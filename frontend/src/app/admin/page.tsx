"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Database, ExternalLink, KeyRound, MapPin, Power, Trash2, UserPlus, X } from "lucide-react";
import { RequireRole } from "@/components/AuthContext";
import ChangePassword from "@/components/ChangePassword";
import LocationPicker from "@/components/LocationPicker";
import { fmtDate, StatusPill, Tabs, ValuesDiff, VerificationPill } from "@/components/SurveyData";
import { Alert, Card, DataTable, PageTitle } from "@/components/ui";
import {
  errorText, fileObjectUrl, refreshAll, sendApi, useSubmission, useSubmissions, useSurveyFields, useUsers,
  useVerifications,
} from "@/lib/api";
import type { CensusVillage, Role, Submission, User } from "@/lib/types";

type Message = { kind: "success" | "error"; text: string } | null;

export default function AdminPage() {
  const [tab, setTab] = useState<"approvals" | "verification" | "users">("approvals");
  return (
    <RequireRole role="admin">
      {(admin) => (
        <>
          <PageTitle>🛡️ Admin · Approvals &amp; Accounts</PageTitle>
          <div className="controls">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "approvals", label: "✅ Data approvals" },
                { id: "verification", label: "🪪 Pradhan verification" },
                { id: "users", label: "👥 Supervisors & admins" },
              ]}
            />
            <Link href="/import" className="btn"><Database size={16} /> Bulk Excel import / export</Link>
          </div>
          {tab === "approvals" ? <Approvals /> : tab === "verification" ? <Verifications /> : <Users admin={admin} />}
          <ChangePassword />
        </>
      )}
    </RequireRole>
  );
}

// ---------- Approvals ----------

function Approvals() {
  const [status, setStatus] = useState("pending");
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const { data: submissions = [], isLoading, mutate } = useSubmissions(true, status);

  return (
    <>
      <div className="controls">
        <label className="field">
          <span>Show</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOpenId(null); }}>
            <option value="pending">Waiting for approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All submissions</option>
          </select>
        </label>
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {isLoading ? (
        <div className="loading">Loading submissions…</div>
      ) : submissions.length ? (
        <DataTable<Submission>
          rows={submissions}
          rowKey={(s) => String(s.id)}
          columns={[
            { key: "village_name", label: "Village", render: (s) => <><b>{s.village_name}</b> <code>{s.village_code}</code></> },
            { key: "district_name", label: "Location", render: (s) => `${s.subdistrict_name ?? "—"}, ${s.district_name ?? "—"}` },
            { key: "submitted_by", label: "Supervisor", render: (s) => s.submitted_by ?? "—" },
            { key: "source", label: "Via", render: (s) => (s.source === "excel" ? "Excel" : "Form") },
            { key: "changes", label: "Values", numeric: true, render: (s) => Object.keys(s.values).length },
            { key: "modified_at", label: "Sent", render: (s) => fmtDate(s.modified_at) },
            { key: "status", label: "Status", render: (s) => <StatusPill status={s.status} /> },
            {
              key: "review", label: "",
              render: (s) => (
                <button className={`btn ${openId === s.id ? "" : "primary"}`} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  {openId === s.id ? "Close" : s.status === "pending" ? "Review" : "View"}
                </button>
              ),
            },
          ]}
        />
      ) : (
        <Alert kind="info">No {status ? `${status} ` : ""}submissions.</Alert>
      )}
      {openId && (
        <Review
          key={openId}
          id={openId}
          onDone={async (text) => {
            setOpenId(null);
            setMessage({ kind: "success", text });
            await mutate();
          }}
        />
      )}
    </>
  );
}

function Review({ id, onDone }: { id: number; onDone: (message: string) => void }) {
  const { data: s, error: loadError } = useSubmission(id);
  const { data: fields = [] } = useSurveyFields();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loadError) return <Alert kind="error">❌ {loadError.message}</Alert>;
  if (!s) return <div className="loading">Loading submission…</div>;

  async function decide(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) return setError("Write a comment so the supervisor knows what to fix.");
    if (action === "approve" && !confirm(`Approve and publish this data for ${s!.village_name} on the dashboard?`)) return;
    setBusy(true);
    setError(null);
    try {
      await sendApi("POST", `/api/admin/submissions/${id}/${action}`, { comment: comment.trim() || null });
      if (action === "approve") await refreshAll();
      onDone(action === "approve"
        ? `✅ ${s!.village_name}: data approved, dashboard and emissions updated.`
        : `${s!.village_name}: submission rejected; the supervisor can see your comment.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Card title={<>Submission #{s.id} · {s.village_name} <StatusPill status={s.status} /></>}>
      <p className="caption">
        Sent {fmtDate(s.modified_at)} by <b>{s.submitted_by ?? "—"}</b> via {s.source === "excel" ? "Excel upload" : "website form"} ·{" "}
        {s.subdistrict_name}, {s.district_name}
      </p>
      {!s.current && <Alert kind="info">ℹ️ This village is not on the dashboard yet. Approving adds it (block set to its sub-district).</Alert>}
      {s.warnings.map((w) => <Alert key={w} kind="warning">⚠️ {w}</Alert>)}
      <ValuesDiff fields={fields} current={s.current} proposed={s.values} />

      {s.status === "pending" ? (
        <div className="stack section-gap">
          <label className="field">
            <span>Comment for the supervisor (required to reject)</span>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Cow count looks too high, please recheck" />
          </label>
          {error && <Alert kind="error">❌ {error}</Alert>}
          <div className="controls">
            <button className="btn primary" disabled={busy} onClick={() => decide("approve")}>
              <Check size={16} /> {busy ? "Working…" : "Approve & publish to dashboard"}
            </button>
            <button className="btn danger" disabled={busy} onClick={() => decide("reject")}><X size={16} /> Reject</button>
          </div>
        </div>
      ) : (
        <p>
          {s.status === "approved" ? "Approved" : "Rejected"} by <b>{s.reviewed_by ?? "—"}</b> on {fmtDate(s.reviewed_at)}
          {s.review_comment && <> — &ldquo;{s.review_comment}&rdquo;</>}
        </p>
      )}
    </Card>
  );
}

// ---------- Pradhan verification ----------

function Verifications() {
  const [status, setStatus] = useState("pending");
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const { data: users = [], isLoading, mutate } = useVerifications(true, status);
  const open = users.find((u) => u.id === openId);

  return (
    <>
      <p>Supervisors who chose their village and uploaded a Pradhan certificate. Check the certificate matches the person and the village, then verify to open data entry.</p>
      <div className="controls">
        <label className="field">
          <span>Show</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOpenId(null); }}>
            <option value="pending">Waiting for verification</option>
            <option value="verified">Verified</option>
            <option value="rejected">Not verified (rejected)</option>
            <option value="unverified">Village not chosen yet</option>
          </select>
        </label>
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {isLoading ? (
        <div className="loading">Loading…</div>
      ) : users.length ? (
        <DataTable<User>
          rows={users}
          rowKey={(u) => String(u.id)}
          columns={[
            { key: "full_name", label: "Pradhan", render: (u) => <><b>{u.full_name || u.username}</b> <small className="unit">{u.username}</small></> },
            { key: "village_name", label: "Village", render: (u) => (u.village_name ? <>{u.village_name} <code>{u.village_code}</code></> : "—") },
            { key: "location", label: "Location", render: (u) => (u.district_name ? `${u.subdistrict_name}, ${u.district_name}, ${u.state_name}` : "—") },
            { key: "certificate", label: "Certificate", render: (u) => u.certificate_filename ?? "—" },
            { key: "certificate_uploaded_at", label: "Sent", render: (u) => fmtDate(u.certificate_uploaded_at) },
            { key: "status", label: "Status", render: (u) => <VerificationPill status={u.verification_status} /> },
            {
              key: "review", label: "",
              render: (u) => u.certificate_filename && (
                <button className={`btn ${openId === u.id ? "" : "primary"}`} onClick={() => setOpenId(openId === u.id ? null : u.id)}>
                  {openId === u.id ? "Close" : u.verification_status === "pending" ? "Review" : "View"}
                </button>
              ),
            },
          ]}
        />
      ) : (
        <Alert kind="info">Nobody in this list.</Alert>
      )}
      {open && (
        <VerificationReview
          key={open.id}
          user={open}
          onDone={async (text) => {
            setOpenId(null);
            setMessage({ kind: "success", text });
            await mutate();
          }}
        />
      )}
    </>
  );
}

function VerificationReview({ user, onDone }: { user: User; onDone: (message: string) => void }) {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = user.full_name || user.username;

  useEffect(() => {
    let url: string | null = null;
    fileObjectUrl(`/api/admin/users/${user.id}/certificate`)
      .then((f) => { url = f.url; setFile(f); })
      .catch((err) => setError(errorText(err)));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [user.id]);

  async function decide(action: "verify" | "reject-verification") {
    if (action === "reject-verification" && !comment.trim()) return setError("Write the reason so the Pradhan knows what to fix.");
    setBusy(true);
    setError(null);
    try {
      await sendApi("POST", `/api/admin/users/${user.id}/${action}`, { comment: comment.trim() || null });
      onDone(action === "verify"
        ? `✅ ${name} verified as Pradhan of ${user.village_name}; data entry is open for them.`
        : `${name} not verified; ${user.village_name} is free again and they can re-apply.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Card title={<>{name} · {user.village_name} <VerificationPill status={user.verification_status} /></>}>
      <p className="caption">
        Claims to be Pradhan of <b>{user.village_name}</b> ({user.village_code}), {user.subdistrict_name}, {user.district_name}, {user.state_name} ·
        certificate &ldquo;{user.certificate_filename}&rdquo; sent {fmtDate(user.certificate_uploaded_at)}
      </p>
      {file ? (
        <>
          {file.type === "application/pdf"
            ? <iframe className="certificate-view" src={file.url} title={`Pradhan certificate of ${name}`} />
            : <img className="certificate-view" src={file.url} alt={`Pradhan certificate of ${name}`} />}
          <a className="btn" href={file.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open in new tab</a>
        </>
      ) : (
        !error && <div className="loading">Loading certificate…</div>
      )}
      {user.verification_status === "pending" ? (
        <div className="stack section-gap">
          <label className="field">
            <span>Comment (required to reject)</span>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Name on the certificate does not match / photo is not readable" />
          </label>
          {error && <Alert kind="error">❌ {error}</Alert>}
          <div className="controls">
            <button className="btn primary" disabled={busy} onClick={() => decide("verify")}>
              <Check size={16} /> {busy ? "Working…" : `Verify as Pradhan of ${user.village_name}`}
            </button>
            <button className="btn danger" disabled={busy} onClick={() => decide("reject-verification")}><X size={16} /> Reject</button>
          </div>
        </div>
      ) : (
        <>
          {error && <Alert kind="error">❌ {error}</Alert>}
          <p className="section-gap">
            {user.verification_status === "verified" ? "Verified" : "Rejected"} by <b>{user.verified_by ?? "—"}</b> on {fmtDate(user.verified_at)}
            {user.verification_comment && <> — &ldquo;{user.verification_comment}&rdquo;</>}
          </p>
        </>
      )}
    </Card>
  );
}

// ---------- Users ----------

function Users({ admin }: { admin: User }) {
  const { data: users = [], mutate } = useUsers(true);
  const [message, setMessage] = useState<Message>(null);
  const [villageFor, setVillageFor] = useState<User | null>(null);
  const takenCodes = users.flatMap((u) => (u.village_code ? [u.village_code] : []));

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    try {
      await action();
      await mutate();
      setMessage({ kind: "success", text: success });
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
      return false;
    }
  }

  const patch = (u: User, body: object, success: string) => run(() => sendApi("PATCH", `/api/admin/users/${u.id}`, body), success);

  function resetPassword(u: User) {
    const password = prompt(`New password for ${u.username} (min 6 characters):`);
    if (password) patch(u, { password }, `Password for ${u.username} changed. Share it with them securely.`);
  }

  function remove(u: User) {
    if (confirm(`Delete ${u.username}? Their past submissions are kept.`)) {
      run(() => sendApi("DELETE", `/api/admin/users/${u.id}`), `${u.username} deleted.`);
    }
  }

  return (
    <>
      <CreateUser takenCodes={takenCodes} onCreate={(body) => run(() => sendApi("POST", "/api/admin/users", body), `Account ${body.username} created.`)} />
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <DataTable<User>
        rows={users}
        rowKey={(u) => String(u.id)}
        columns={[
          { key: "username", label: "Username", render: (u) => <b>{u.username}</b> },
          { key: "full_name", label: "Name", render: (u) => u.full_name || "—" },
          { key: "role", label: "Role", render: (u) => (u.role === "admin" ? "Admin" : "Supervisor") },
          {
            key: "village", label: "Village",
            render: (u) => (u.role === "admin" ? "—" : u.village_name ? `${u.village_name} (${u.village_code}), ${u.district_name}` : <i>not selected yet</i>),
          },
          { key: "verification", label: "Verification", render: (u) => <VerificationPill status={u.verification_status} /> },
          { key: "is_active", label: "Status", render: (u) => (u.is_active ? "Active" : <span className="status-pill rejected">Disabled</span>) },
          { key: "created_at", label: "Created", render: (u) => fmtDate(u.created_at) },
          {
            key: "actions", label: "Actions",
            render: (u) => (
              <div className="row-actions">
                <button className="btn" title="Reset password" onClick={() => resetPassword(u)}><KeyRound size={14} /></button>
                {u.role === "supervisor" && (
                  <button className="btn" title="Change village" onClick={() => setVillageFor(u)}><MapPin size={14} /></button>
                )}
                {u.id !== admin.id && (
                  <>
                    <button className="btn" title={u.is_active ? "Disable login" : "Enable login"}
                      onClick={() => patch(u, { is_active: !u.is_active }, `${u.username} ${u.is_active ? "disabled" : "enabled"}.`)}>
                      <Power size={14} />
                    </button>
                    <button className="btn danger" title="Delete" onClick={() => remove(u)}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      {villageFor && (
        <ChangeVillage
          key={villageFor.id}
          user={villageFor}
          takenCodes={takenCodes.filter((c) => c !== villageFor.village_code)}
          onCancel={() => setVillageFor(null)}
          onSave={async (code) => {
            if (await patch(villageFor, { village_code: code }, code ? `${villageFor.username}'s village changed.` : `${villageFor.username} unlinked from the village.`)) {
              setVillageFor(null);
            }
          }}
        />
      )}
    </>
  );
}

interface NewUser { username: string; password: string; full_name: string; role: Role; village_code: string | null }

function CreateUser({ takenCodes, onCreate }: { takenCodes: string[]; onCreate: (body: NewUser) => Promise<boolean> }) {
  const empty: NewUser = { username: "", password: "", full_name: "", role: "supervisor", village_code: null };
  const [form, setForm] = useState<NewUser>(empty);
  const [village, setVillage] = useState<CensusVillage | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await onCreate({ ...form, village_code: form.role === "supervisor" ? village?.village_code ?? null : null });
    setBusy(false);
    if (ok) {
      setForm(empty);
      setVillage(null);
      setOpen(false);
    }
  }

  if (!open) {
    return <div className="controls"><button className="btn primary" onClick={() => setOpen(true)}><UserPlus size={16} /> New account</button></div>;
  }

  return (
    <Card title="New account">
      <form onSubmit={submit}>
        <div className="controls">
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="supervisor">Village supervisor (Pradhan)</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">
            <span>Username</span>
            <input required minLength={3} pattern="[A-Za-z0-9_.\-]+" title="Letters, numbers, _ . -" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="field">
            <span>Full name</span>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Password (min 6)</span>
            <input required minLength={6} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
        </div>
        {form.role === "supervisor" && (
          <>
            <p className="caption">
              Village (optional): leave empty so the Pradhan chooses it at login and uploads their certificate for you to verify.
              A village chosen here counts as verified.
            </p>
            <LocationPicker value={village} onChange={setVillage} takenCodes={takenCodes} />
          </>
        )}
        <div className="controls">
          <button className="btn primary" type="submit" disabled={busy}><UserPlus size={16} /> {busy ? "Creating…" : "Create account"}</button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

function ChangeVillage({ user, takenCodes, onCancel, onSave }: {
  user: User;
  takenCodes: string[];
  onCancel: () => void;
  onSave: (code: string | null) => void;
}) {
  const [village, setVillage] = useState<CensusVillage | null>(null);
  return (
    <Card title={`Village for ${user.username}${user.village_name ? ` (now ${user.village_name})` : ""}`}>
      <LocationPicker value={village} onChange={setVillage} takenCodes={takenCodes} />
      <div className="controls">
        <button className="btn primary" disabled={!village} onClick={() => onSave(village!.village_code)}>
          <MapPin size={16} /> Set {village?.village_name ?? "village"}
        </button>
        {user.village_code && <button className="btn" onClick={() => onSave(null)}>Unlink village</button>}
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}
