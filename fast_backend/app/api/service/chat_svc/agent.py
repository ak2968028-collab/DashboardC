"""Tool-calling RAG agent on a local Ollama model (llama3.1:8b).

Per question: relevant knowledge passages are retrieved and put in the system prompt, then the model may call
tools (database queries, maps, rasters, knowledge search) for a few rounds before writing the answer.
Everything is streamed to the browser as NDJSON events:
  {"type": "status", "text"}            what the assistant is doing
  {"type": "tool", "name", "args"}      a tool call
  {"type": "visual", "visual"}          a map / chart / table produced by a tool
  {"type": "sources", "sources"}        knowledge passages used
  {"type": "token", "text"}             answer text, streamed
  {"type": "reset"}                     discard streamed text (it turned out to be a tool call)
  {"type": "error", "text"} / {"type": "done"} / {"type": "ping"} (keep-alive while the model thinks)"""
import asyncio
import json
import re
from collections.abc import AsyncIterator

import httpx

from app.api.service.chat_svc.knowledge import knowledge_base
from app.api.service.chat_svc.tools import TOOL_NAMES, Toolbox, tool_specs
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.config.session import AsyncSessionLocal

MAX_TOOL_ROUNDS = 4
HISTORY_TURNS = 6
PING_SECONDS = 8
CONTEXT_MIN_SCORE = 2.0  # BM25 score a passage needs to be put in the prompt up front

SYSTEM_PROMPT = """You are the assistant of the Varanasi Village Environment & Carbon Dashboard (IIT BHU).
You answer questions about villages of Varanasi district, Uttar Pradesh: population, land use, energy, transport,
waste, livestock and their greenhouse gas emissions (IPCC 2006 Tier-1, t CO2e/yr), and about GIS raster layers.

Rules:
- Use the tools to get numbers. Never invent data, village names or emission figures.
- Only state facts that appear in the tool results. If a tool returns an "error", tell the user what went wrong
  instead of guessing. Leave optional tool arguments out instead of passing null.
- Tools also draw maps, rasters and charts for the user, so call one whenever a map or chart would help
  (e.g. "show", "map", "where", "which villages", "compare", "raster").
- Use search_knowledge for methodology, formulas, emission factors or mitigation questions.
- For greetings or general chat, answer directly without tools.
- After the tool results arrive, answer in plain language in 2-6 sentences or a short list, quoting the key numbers
  with units. Mention that the map/chart is shown when a tool produced one. Do not output JSON.
"""


def _ndjson(event: dict) -> bytes:
    return (json.dumps(event, ensure_ascii=False, default=str) + "\n").encode()


def _text_tool_call(content: str) -> list[dict] | None:
    """llama3.1 sometimes writes the tool call as JSON text instead of a structured tool call."""
    text = content.strip().removeprefix("<|python_tag|>").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text).strip()
    if not text.startswith(("{", "[")):
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # several calls separated by ';' or newlines
        try:
            data = [json.loads(p) for p in re.split(r";\s*|\n(?=\{)", text) if p.strip()]
        except json.JSONDecodeError:
            return None
    calls = data if isinstance(data, list) else [data]
    out = []
    for c in calls:
        if not isinstance(c, dict):
            return None
        name = c.get("name") or (c.get("function") or {}).get("name")
        args = c.get("parameters") or c.get("arguments") or (c.get("function") or {}).get("arguments") or {}
        if name not in TOOL_NAMES:
            return None
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        out.append({"function": {"name": name, "arguments": args}})
    return out or None


class Agent:
    def __init__(self, emit):
        self.emit = emit  # async callable(event dict)

    async def _chat(self, client: httpx.AsyncClient, messages: list[dict], tools: list[dict] | None) -> tuple[str, list]:
        """One streamed model call; forwards answer tokens, returns (content, tool calls)."""
        body = {"model": settings.OLLAMA_MODEL, "messages": messages, "stream": True,
                "options": {"num_ctx": settings.OLLAMA_NUM_CTX, "temperature": 0.2}}
        if tools:
            body["tools"] = tools
        content, calls, streaming = "", [], False
        async with client.stream("POST", f"{settings.OLLAMA_URL}/api/chat", json=body) as r:
            if r.status_code != 200:
                detail = (await r.aread()).decode(errors="replace")[:300]
                raise RuntimeError(f"Ollama returned {r.status_code}: {detail}")
            async for line in r.aiter_lines():
                if not line.strip():
                    continue
                chunk = json.loads(line)
                if chunk.get("error"):
                    raise RuntimeError(chunk["error"])
                msg = chunk.get("message") or {}
                calls.extend(msg.get("tool_calls") or [])
                piece = msg.get("content") or ""
                if not piece:
                    continue
                content += piece
                if streaming:
                    await self.emit({"type": "token", "text": piece})
                elif content.strip() and not content.lstrip().startswith(("{", "[", "<|", "```")):
                    # Looks like prose, not a JSON tool call: start streaming it.
                    streaming = True
                    await self.emit({"type": "token", "text": content})
        if not streaming and content.strip() and not calls:
            parsed = _text_tool_call(content)
            if parsed:
                return "", parsed
            await self.emit({"type": "token", "text": content})
        elif streaming and calls:
            await self.emit({"type": "reset"})
        return content, calls

    async def run(self, question: str, history: list[dict]):
        async with AsyncSessionLocal() as db:
            toolbox = Toolbox(db)
            await self.emit({"type": "status", "text": "Searching the knowledge base…"})
            try:
                passages = [p for p in await knowledge_base.search(db, question, k=3) if p["score"] >= CONTEXT_MIN_SCORE]
            except Exception:
                logger.exception("Assistant: knowledge retrieval failed")
                passages = []
            system = SYSTEM_PROMPT
            if passages:
                system += "\nReference passages (cite them when relevant):\n" + "\n".join(
                    f"[{i + 1}] {p['title']}: {p['text']}" for i, p in enumerate(passages))
                await self.emit({"type": "sources", "sources": [{"title": p["title"], "source": p["source"]} for p in passages]})

            messages = [{"role": "system", "content": system}]
            for turn in history[-HISTORY_TURNS * 2:]:
                if turn.get("role") in ("user", "assistant") and turn.get("content"):
                    messages.append({"role": turn["role"], "content": str(turn["content"])[:2000]})
            messages.append({"role": "user", "content": question})

            tools = tool_specs()
            async with httpx.AsyncClient(timeout=httpx.Timeout(settings.OLLAMA_TIMEOUT, connect=10)) as client:
                for round_no in range(MAX_TOOL_ROUNDS + 1):
                    await self.emit({"type": "status", "text": "Thinking…" if round_no == 0 else "Writing the answer…"})
                    # Last round: no tools, so the model has to answer.
                    content, calls = await self._chat(client, messages, tools if round_no < MAX_TOOL_ROUNDS else None)
                    if not calls:
                        break
                    messages.append({"role": "assistant", "content": content, "tool_calls": calls})
                    for call in calls:
                        fn = call.get("function") or {}
                        name, args = fn.get("name", ""), fn.get("arguments") or {}
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except json.JSONDecodeError:
                                args = {}
                        await self.emit({"type": "tool", "name": name, "args": args})
                        await self.emit({"type": "status", "text": f"Running {name.replace('_', ' ')}…"})
                        try:
                            result, visuals = await toolbox.run(name, args)
                        except Exception as e:
                            logger.exception("Assistant tool %s failed", name)
                            result, visuals = {"error": f"{type(e).__name__}: {e}"}, []
                        for v in visuals:
                            await self.emit({"type": "visual", "visual": v})
                        messages.append({"role": "tool", "tool_name": name,
                                         "content": json.dumps(result, ensure_ascii=False, default=str)[:6000]})


async def stream_answer(question: str, history: list[dict]) -> AsyncIterator[bytes]:
    """Runs the agent in the background and yields its events, with keep-alive pings so proxies don't time out."""
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: dict):
        await queue.put(event)

    async def runner():
        try:
            await Agent(emit).run(question, history)
        except httpx.ConnectError:
            await emit({"type": "error", "text": f"Cannot reach the language model at {settings.OLLAMA_URL}. "
                                                 "Is Ollama running and reachable from the backend?"})
        except httpx.TimeoutException:
            await emit({"type": "error", "text": "The language model took too long to answer. Try a shorter question."})
        except Exception as e:
            logger.exception("Assistant failed")
            await emit({"type": "error", "text": f"Assistant error: {e}"})
        finally:
            await emit({"type": "done"})

    task = asyncio.create_task(runner())
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=PING_SECONDS)
            except asyncio.TimeoutError:
                yield _ndjson({"type": "ping"})
                continue
            yield _ndjson(event)
            if event["type"] == "done":
                break
    finally:
        if not task.done():
            task.cancel()


async def model_status() -> dict:
    """Whether Ollama is reachable and has the configured model pulled."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.OLLAMA_URL}/api/tags")
            r.raise_for_status()
            names = [m.get("name") for m in r.json().get("models", [])]
    except Exception as e:
        return {"online": False, "model": settings.OLLAMA_MODEL, "url": settings.OLLAMA_URL, "detail": str(e)[:200]}
    want = settings.OLLAMA_MODEL
    available = any(n == want or n.split(":")[0] == want or n == f"{want}:latest" for n in names)
    return {"online": True, "model": want, "model_available": available, "embed_model": settings.OLLAMA_EMBED_MODEL,
            "url": settings.OLLAMA_URL}
