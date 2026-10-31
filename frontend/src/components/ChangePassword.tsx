"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { errorText, sendApi } from "@/lib/api";
import { Alert } from "./ui";

export default function ChangePassword() {
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await sendApi("POST", "/api/auth/change-password", { current_password: current, new_password: next });
      setMessage({ kind: "success", text: "Password changed." });
      setCurrent("");
      setNext("");
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="section-gap">
      <button className="btn" onClick={() => setShow(!show)}><KeyRound size={16} /> Change my password</button>
      {show && (
        <form onSubmit={submit} className="controls" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="field">
            <span>New password (min 6)</span>
            <input type="password" autoComplete="new-password" minLength={6} required value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">Save</button>
        </form>
      )}
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </div>
  );
}
