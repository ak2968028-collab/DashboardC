"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Sparkles, X } from "lucide-react";
import { AssistantChat } from "@/components/AssistantChat";

/** Bottom-right circular launcher (elevated slightly) with hover-revealed attention callout and popup drawer. */
export function FloatingAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Full-page /assistant already displays the full chat and map workbench.
  if (pathname === "/assistant") return null;

  function openAssistant() {
    setHasOpened(true);
    setOpen(true);
  }

  function toggle() {
    if (!open) openAssistant();
    else setOpen(false);
  }

  return (
    <>
      {hasOpened && (
        <div
          className={`assistant-popup-dialog ${expanded ? "is-expanded" : ""} ${open ? "is-open" : ""}`}
          role="dialog"
          aria-label="AI Carbon Assistant"
          aria-hidden={!open}
        >
          <AssistantChat
            variant="popup"
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      <div className={`assistant-fab-wrap ${open ? "is-open" : ""}`}>
        {!open && (
          <button
            type="button"
            className="assistant-callout"
            onClick={openAssistant}
            aria-label="Open AI Carbon Assistant"
          >
            <span className="assistant-callout-badge">
              <Sparkles size={12} /> AI Assistant
            </span>
            <span className="assistant-callout-text">Ask about villages, emissions &amp; maps</span>
          </button>
        )}

        <button
          type="button"
          className={`assistant-fab ${open ? "is-open" : ""}`}
          onClick={toggle}
          aria-label={open ? "Close AI Carbon Assistant" : "Open AI Carbon Assistant"}
          aria-expanded={open}
          title="AI Carbon Assistant"
        >
          {!open && <span className="assistant-fab-pulse" aria-hidden="true" />}
          {open ? <X size={24} /> : <Bot size={26} />}
          {!open && <span className="assistant-fab-badge">AI</span>}
        </button>
      </div>
    </>
  );
}
