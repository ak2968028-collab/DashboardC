"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bot, Download, ExternalLink, FileText, Layers, Loader2, Map as MapIcon,
  Maximize2, Minimize2, Paperclip, PenLine, Send, Square, Trash2, User, Wrench, X,
} from "lucide-react";
import { DonutChart, SimpleBarChart } from "@/components/charts";
import { DataTable } from "@/components/ui";
import { errorText } from "@/lib/api";
import {
  AREA_FILE_TYPES, askAssistant, uploadArea, useModelStatus,
  type AreaInfo, type ChatTurn, type MapVisual, type TableVisual, type Visual,
} from "@/lib/chat";
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
  "Attach a boundary file (📎) or draw on the map, then ask: total emissions inside my area?",
  "Make a PDF report of the district with a thematic map of per capita emissions",
];

let nextId = 1;

/** Generated image (map / chart PNG) or video (MP4, or animated GIF) with open and download links. */
function MediaView({ v }: { v: Extract<Visual, { kind: "media" }> }) {
  const file = v.url.split("/").pop() ?? "file";
  const links = (url: string, label: string) => (
    <span className="chat-media-links">
      <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>
      <a href={url} download={url.split("/").pop()}><Download size={12} /> {label}</a>
    </span>
  );
  if (v.media === "file") {
    return (
      <div className="chat-media file">
        <div className="chat-media-row">
          <FileText size={22} className="chat-media-icon" />
          <span className="chat-media-name"><b>{v.title}</b></span>
          {links(v.url, file.endsWith(".pdf") ? "PDF" : "Download")}
        </div>
      </div>
    );
  }
  if (v.media === "video") {
    return (
      <div className="chat-media">
        <div className="chat-visual-title">🎬 {v.title}</div>
        {v.mp4
          ? <video src={v.mp4} controls loop muted playsInline />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={v.url} alt={v.title} />}
        <div className="chat-media-row">
          {v.mp4 && links(v.mp4, "MP4")}
          {v.gif && links(v.gif, "GIF")}
        </div>
        {!!v.frames?.length && (
          <div className="chat-media-frames">
            Frames as PNG:{" "}
            {v.frames.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" download={f.url.split("/").pop()}>
                {f.title.split(" emissions")[0]}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="chat-media image">
      <a href={v.url} target="_blank" rel="noreferrer" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.url} alt={v.title} loading="lazy" />
      </a>
      <div className="chat-media-row"><span className="chat-media-name">🖼 {v.title.replace(/^Image: /, "")}</span>{links(v.url, file.endsWith(".png") ? "PNG" : "Download")}</div>
    </div>
  );
}

function VisualView({ v, onMap, active }: { v: Visual; onMap: (m: MapVisual) => void; active: boolean }) {
  if (v.kind === "media") return <MediaView v={v} />;
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

interface AssistantChatProps {
  variant?: "page" | "popup";
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}

export function AssistantChat({ variant = "page", expanded = false, onToggleExpand, onClose }: AssistantChatProps) {
  const isPopup = variant === "popup";
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapVisual, setMapVisual] = useState<MapVisual | null>(null);
  const [showPopupMap, setShowPopupMap] = useState(false);
  // Vector area the user attached (GeoJSON, KML/KMZ, zipped shapefile, GeoPackage); sent with every question.
  const [area, setArea] = useState<AreaInfo | null>(null);
  // The area came from shapes drawn on the map (not a file): removing it also clears the drawing.
  const [areaFromDrawing, setAreaFromDrawing] = useState(false);
  const [clearDrawKey, setClearDrawKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: status } = useModelStatus();

  // /assistant?q=... asks a question straight away (links from other pages).
  const askedFromUrl = useRef(false);
  useEffect(() => {
    if (isPopup || askedFromUrl.current) return;
    askedFromUrl.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) send(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPopup]);

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
      await askAssistant(question, history, area?.id ?? null, (e) => {
        switch (e.type) {
          case "status": update(botId, (m) => ({ ...m, status: e.text })); break;
          case "token": update(botId, (m) => ({ ...m, text: m.text + e.text })); break;
          case "reset": update(botId, (m) => ({ ...m, text: "" })); break;
          case "tool": update(botId, (m) => ({ ...m, tools: [...m.tools, { name: e.name, args: e.args }] })); break;
          case "sources": update(botId, (m) => ({ ...m, sources: e.sources })); break;
          case "visual":
            update(botId, (m) => ({ ...m, visuals: [...m.visuals, e.visual] }));
            if (e.visual.kind === "map") {
              setMapVisual(e.visual);
              if (isPopup) setShowPopupMap(true);
            }
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

  function removeArea() {
    if (areaFromDrawing) setClearDrawKey((k) => k + 1);
    setArea(null);
    setAreaFromDrawing(false);
  }

  /** Shapes drawn on the map become the area (sent like an uploaded GeoJSON file). */
  async function onDraw(fc: FeatureCollection | null) {
    if (!fc) {
      if (areaFromDrawing) {
        setArea(null);
        setAreaFromDrawing(false);
      }
      return;
    }
    setUploading(true);
    try {
      const a = await uploadArea(new File([JSON.stringify(fc)], "drawn_area.geojson", { type: "application/geo+json" }));
      setArea({ ...a, name: "Drawn area" });
      setAreaFromDrawing(true);
    } catch (err) {
      setMessages((ms) => [...ms, {
        id: nextId++, role: "assistant", text: "", visuals: [], tools: [], sources: [],
        error: `Could not use the drawing: ${errorText(err)}`,
      }]);
    } finally {
      setUploading(false);
    }
  }

  async function attach(file: File) {
    setUploading(true);
    try {
      const a = await uploadArea(file);
      if (areaFromDrawing) setClearDrawKey((k) => k + 1);
      setAreaFromDrawing(false);
      setArea(a);
      // Show the outline right away.
      setMapVisual({
        kind: "map", title: `Uploaded area: ${a.name}`, metric: { key: "", label: "", unit: "", ramp: "reds" },
        values: {}, names: {}, highlight: [], focus: [], raster: null, area: a.outline,
      });
      if (isPopup) setShowPopupMap(true);
      setMessages((ms) => [...ms, {
        id: nextId++, role: "assistant", visuals: [], tools: [], sources: [],
        text: `Area “${a.name}” attached: ${fmt(a.area_ha)} ha, ${a.features} feature${a.features === 1 ? "" : "s"}`
          + `${a.buffered_m ? ` (points/lines buffered by ${a.buffered_m} m)` : ""}. Ask about it, for example “total emissions `
          + `inside my area”, “thematic map of livestock emissions for my area” or “clip the population raster to my area”.`,
      }]);
    } catch (err) {
      setMessages((ms) => [...ms, {
        id: nextId++, role: "assistant", text: "", visuals: [], tools: [], sources: [],
        error: `Could not use ${file.name}: ${errorText(err)}`,
      }]);
    } finally {
      setUploading(false);
    }
  }

  const openMapVisual = (v: MapVisual) => {
    setMapVisual(v);
    if (isPopup) setShowPopupMap(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const offline = status && (!status.online || status.model_available === false);
  const examples = isPopup ? EXAMPLES.slice(0, 5) : EXAMPLES;
  const mapKey = mapVisual ? `${mapVisual.title}|${mapVisual.raster?.layer ?? ""}|${mapVisual.highlight.join(",")}` : "none";

  const chatPanel = (
    <section className={`chat-panel ${isPopup ? "is-popup" : ""}`}>
      <header className="chat-head">
        <Bot size={18} />
        <div className="chat-head-title">
          <b>{isPopup ? "AI Carbon Assistant" : "Ask about villages, emissions & map layers"}</b>
          <small className={`chat-model ${offline ? "off" : status ? "on" : ""}`}>
            {!status ? "Checking model…" : !status.online ? `Model offline (${status.url})`
              : status.model_available === false ? `${status.model} is not pulled on Ollama` : `${status.model} · local Ollama`}
          </small>
        </div>
        <div className="chat-head-actions">
          {isPopup && !expanded && (
            <button
              type="button"
              className={`chat-head-btn ${showPopupMap ? "active" : ""}`}
              onClick={() => setShowPopupMap((v) => !v)}
              title={showPopupMap ? "Hide map panel" : "Show interactive map"}
            >
              <MapIcon size={16} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              className="chat-head-btn"
              onClick={() => { setMessages([]); setMapVisual(null); }}
              disabled={busy}
              title="Clear conversation"
            >
              <Trash2 size={16} />
            </button>
          )}
          {isPopup && onToggleExpand && (
            <button
              type="button"
              className="chat-head-btn"
              onClick={onToggleExpand}
              title={expanded ? "Compact view" : "Expand assistant"}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          {isPopup && onClose && (
            <button type="button" className="chat-head-btn" onClick={onClose} title="Close assistant">
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {isPopup && !expanded && showPopupMap && (
        <div className="assistant-popup-inline-map">
          <AssistantMap visual={mapVisual} onDraw={onDraw} clearDrawKey={clearDrawKey} visualKey={mapKey} />
        </div>
      )}

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask questions from the dashboard database and methodology — answers come with maps, emission rasters and charts.</p>
            <div className="chat-examples">
              {examples.map((q) => <button key={q} type="button" className="btn" onClick={() => send(q)} disabled={busy}>{q}</button>)}
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
                <VisualView key={i} v={v} onMap={openMapVisual} active={v === mapVisual} />
              ))}
              {m.sources.length > 0 && (
                <div className="chat-sources">Sources: {m.sources.map((s) => s.title).join(" · ")}</div>
              )}
              {m.error && <div className="alert error">{m.error}</div>}
            </div>
          </div>
        ))}
      </div>

      {area && (
        <div className="chat-area-chip">
          {areaFromDrawing ? <PenLine size={13} /> : <Paperclip size={13} />}
          <span>
            <b>{area.name}</b> · {fmt(area.area_ha)} ha · {area.features} feature{area.features === 1 ? "" : "s"}
            {area.buffered_m ? ` (points/lines buffered ${area.buffered_m} m)` : ""}
            {area.inside_district_pct < 99 ? ` · ${fmt(area.inside_district_pct)}% inside district` : ""}
          </span>
          <button type="button" onClick={removeArea} title="Remove the area" disabled={busy}><X size={13} /></button>
        </div>
      )}
      <form className="chat-input" onSubmit={onSubmit}>
        <input ref={fileRef} type="file" accept={AREA_FILE_TYPES} hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) attach(f);
        }} />
        <button type="button" className="btn chat-attach" onClick={() => fileRef.current?.click()} disabled={busy || uploading}
          title="Attach a vector file to clip data and rasters to (GeoJSON, KML/KMZ, zipped shapefile, GeoPackage)">
          {uploading ? <Loader2 size={16} className="spin" /> : <Paperclip size={16} />}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={area ? `Ask about ${area.name}, e.g. thematic map of per capita emissions, clip the population raster`
            : "e.g. Which villages in Pindra emit most from firewood?"}
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
  );

  if (!isPopup || expanded) {
    return (
      <div className={isPopup ? "assistant-layout assistant-popup-expanded-layout" : "assistant-layout"}>
        {chatPanel}
        <AssistantMap visual={mapVisual} onDraw={onDraw} clearDrawKey={clearDrawKey} visualKey={mapKey} />
      </div>
    );
  }

  return chatPanel;
}
