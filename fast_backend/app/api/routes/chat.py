from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.schema.chat_schema import Chat_request
from app.api.service.chat_svc.agent import model_status, stream_answer

router = APIRouter()


@router.post("")
async def chat(body: Chat_request):
    """Asks the AI assistant (local Ollama LLM with database, map, raster and knowledge-base tools).
    Streams NDJSON events: status, tool, visual (map / chart / table), sources, token, error, done."""
    history = [t.model_dump() for t in body.history]
    return StreamingResponse(
        stream_answer(body.message.strip(), history),
        media_type="application/x-ndjson",
        # Stop proxies (nginx, Cloudflare) from buffering the stream.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def chat_status():
    """Whether the language model is reachable."""
    return await model_status()
