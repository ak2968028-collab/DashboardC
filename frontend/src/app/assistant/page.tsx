"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Layers, Map as MapIcon, Send, Square, Trash2, User, Wrench } from "lucide-react";
import { DonutChart, SimpleBarChart } from "@/components/charts";
import { DataTable, PageTitle } from "@/components/ui";
import { errorText } from "@/lib/api";
import { askAssistant, useModelStatus, type ChatTurn, type MapVisual, type TableVisual, type Visual } from "@/lib/chat";
import { fmt } from "@/lib/format";

// Leaflet needs the browser window, so the map is client-only.
const AssistantMap = dynamic(() => import("@/components/AssistantMap"), {
  ssr: false,
  loading: () => <div className="loading">Loading map…</div>,
});

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  visuals: Visual[];
  tools: { name: string; args: Record<string, unknown> }[];
  sources: { title: string; source: string }[];
  status?: string;
  error?: string;
  pending?: boolean;
}

const EXAMPLES = [
  "Which 10 villages have the highest total emissions?",
  "Show the livestock emission raster",
  "Map per capita emissions in Pindra block",
  "How are livestock emissions calculated?",
  "Give me an overview of Varanasi district",
  "Compare emissions of Chakadhiya and Dhanejpattee",
];

let nextId = 1;

function VisualView({ v, onMap, active }: { v: Visual; onMap: (m: MapVisual) => void; active: boolean }) {
  if (v.kind === "map") {
    return (
      <button type="button" className={`btn chat-map-chip ${active ? "on" : ""}`} onClick={() => onMap(v)}>
        {v.raster ? <Layers size={14} /> : <MapIcon size={14} />} {active ? "On the map: " : "Show on map: "}{v.title}
      </button>
    );
  }
  if (v.kind === "chart") {
    return (
      <div className="chat-visual">
        <div className="chat-visual-title">{v.title}</div>
        {v.chart === "donut"
          ? <DonutChart data={v.data.map((d) => ({ name: String(d.name), value: Number(d.value) }))} height={260} />
          : <SimpleBarChart data={v.data} category={v.category ?? "name"} series={v.series ?? [{ key: "value", name: "Value" }]}
              horizontal={v.horizontal} height={Math.max(220, (v.horizontal ? 28 : 0) * v.data.length + 60)} showValues={v.data.length <= 12} />}
      </div>
    );
  }
  return (
    <details className="chat-visual">
      <summary className="chat-visual-title">{v.title} ({v.rows.length} rows)</summary>
      <DataTable<TableVisual["rows"][number]> rows={v.rows} rowKey={(r) => JSON.stringify(r)}
        columns={v.columns.map((c) => ({
          key: c.key, label: c.label, numeric: c.numeric,
          render: (r) => (typeof r[c.key] === "number" ? fmt(r[c.key] as number, Number.isInteger(r[c.key]) ? 0 : 2) : String(r[c.key] ?? "")),
        }))} />
    </details>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapVisual, setMapVisual] = useState<MapVisual | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: status } = useModelStatus();

  // /assistant?q=... asks a question straight away (links from other pages).
  const askedFromUrl = useRef(false);
  useEffect(() => {
    if (askedFromUrl.current) return;
    askedFromUrl.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) send(q);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const update = (id: number, fn: (m: Message) => Message) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: ChatTurn[] = messages.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text }));
    const userMsg: Message = { id: nextId++, role: "user", text: question, visuals: [], tools: [], sources: [] };
    const botId = nextId++;
    setMessages((ms) => [...ms, userMsg, { id: botId, role: "assistant", text: "", visuals: [], tools: [], sources: [], pending: true, status: "Connecting…" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await askAssistant(question, history, (e) => {
        switch (e.type) {
          case "status": update(botId, (m) => ({ ...m, status: e.text })); break;
          case "token": update(botId, (m) => ({ ...m, text: m.text + e.text })); break;
          case "reset": update(botId, (m) => ({ ...m, text: "" })); break;
          case "tool": update(botId, (m) => ({ ...m, tools: [...m.tools, { name: e.name, args: e.args }] })); break;
          case "sources": update(botId, (m) => ({ ...m, sources: e.sources })); break;
          case "visual":
            update(botId, (m) => ({ ...m, visuals: [...m.visuals, e.visual] }));
            if (e.visual.kind === "map") setMapVisual(e.visual);
            break;
          case "error": update(botId, (m) => ({ ...m, error: e.text })); break;
          case "done": update(botId, (m) => ({ ...m, pending: false, status: undefined })); break;
        }
      }, ctrl.signal);
    } catch (err) {
      if (!ctrl.signal.aborted) update(botId, (m) => ({ ...m, error: errorText(err) }));
    } finally {
      update(botId, (m) => ({ ...m, pending: false, status: undefined }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const offline = status && (!status.online || status.model_available === false);

  return (
    <>
      <PageTitle>AI Carbon Assistant</PageTitle>
      <div className="assistant-layout">
        <section className="chat-panel">
          <header className="chat-head">
            <Bot size={18} />
            <div>
              <b>Ask about villages, emissions &amp; map layers</b>
              <small className={`chat-model ${offline ? "off" : status ? "on" : ""}`}>
                {!status ? "Checking model…" : !status.online ? `Model offline (${status.url})`
                  : status.model_available === false ? `${status.model} is not pulled on Ollama` : `${status.model} · local Ollama`}
              </small>
            </div>
            {messages.length > 0 && (
              <button type="button" className="btn-ghost chat-clear" onClick={() => { setMessages([]); setMapVisual(null); }}
                disabled={busy} title="Clear conversation"><Trash2 size={15} /></button>
            )}
          </header>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>The assistant answers from the dashboard database and methodology. Its answers come with maps, emission rasters and charts.</p>
                <div className="chat-examples">
                  {EXAMPLES.map((q) => <button key={q} type="button" className="btn" onClick={() => send(q)} disabled={busy}>{q}</button>)}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                <div className="chat-avatar">{m.role === "user" ? <User size={15} /> : <Bot size={15} />}</div>
                <div className="chat-bubble">
                  {m.tools.length > 0 && (
                    <div className="chat-tools">
                      {m.tools.map((t, i) => (
                        <span key={i} title={JSON.stringify(t.args)}><Wrench size={11} /> {t.name.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  )}
                  {m.text && <div className="chat-text">{m.text}</div>}
                  {m.pending && !m.text && <div className="chat-status"><span className="chat-dots" /> {m.status}</div>}
                  {m.visuals.map((v, i) => (
                    <VisualView key={i} v={v} onMap={setMapVisual} active={v === mapVisual} />
                  ))}
                  {m.sources.length > 0 && (
                    <div className="chat-sources">Sources: {m.sources.map((s) => s.title).join(" · ")}</div>
                  )}
                  {m.error && <div className="alert error">{m.error}</div>}
                </div>
              </div>
            ))}
          </div>

          <form className="chat-input" onSubmit={onSubmit}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="e.g. Which villages in Pindra emit most from firewood?"
              rows={2}
              maxLength={2000}
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()} title="Stop"><Square size={16} /></button>
            ) : (
              <button type="submit" className="btn primary" disabled={!input.trim()} title="Send"><Send size={16} /></button>
            )}
          </form>
        </section>

        <AssistantMap visual={mapVisual} visualKey={mapVisual ? `${mapVisual.title}|${mapVisual.raster?.layer ?? ""}|${mapVisual.highlight.join(",")}` : "none"} />
      </div>
    </>
  );
}
