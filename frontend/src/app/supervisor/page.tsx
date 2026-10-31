"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { RequireRole, useAuth } from "@/components/AuthContext";
import ChangePassword from "@/components/ChangePassword";
import LocationPicker from "@/components/LocationPicker";
import { fmtDate, StatusPill, SurveyForm, Tabs, ValuesDiff } from "@/components/SurveyData";
import { Alert, Card, DataTable, PageTitle } from "@/components/ui";
import {
  downloadFile, errorText, sendApi, useMySubmissions, useSupervisorVillage, useSurveyFields,
} from "@/lib/api";
import { fmt } from "@/lib/format";
import type { CensusVillage, CensusVillageDetails, Submission, SurveyField, User } from "@/lib/types";

type Message = { kind: "success" | "error"; text: string } | null;

const MAX_CERTIFICATE_MB = 5;

export default function SupervisorPage() {
  return <RequireRole role="supervisor">{(user) => <DataEntry user={user} />}</RequireRole>;
}

function DataEntry({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const { data: mine, mutate: reloadVillage, isLoading } = useSupervisorVillage(true);

  // The admin may have verified (or rejected) the certificate since this login.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (isLoading || !mine) return <div className="loading">Loading your village…</div>;
  const status = user.verification_status;
  return (
    <>
      <PageTitle>📝 Village Data Entry</PageTitle>
      {status === "verified" && mine.village ? (
        <VillageData user={user} />
      ) : status === "pending" && mine.village ? (
        <AwaitingVerification user={user} village={mine.village} onCheck={() => Promise.all([refreshUser(), reloadVillage()])} />
      ) : (
        <>
          {status === "rejected" && (
            <Alert kind="error">
              ❌ The admin could not verify you{user.verified_by && <> ({user.verified_by})</>}: <b>{user.verification_comment}</b>.
              Please choose your village and upload your Pradhan certificate again.
            </Alert>
          )}
          <SelectVillage onSelected={() => reloadVillage()} />
        </>
      )}
      <ChangePassword />
    </>
  );
}

function SelectVillage({ onSelected }: { onSelected: () => void }) {
  const { refreshUser } = useAuth();
  const [village, setVillage] = useState<CensusVillage | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!village || !certificate) return;
    if (certificate.size > MAX_CERTIFICATE_MB * 1024 * 1024) return setError(`The certificate must be ${MAX_CERTIFICATE_MB} MB or smaller.`);
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("village_code", village.village_code);
      body.append("certificate", certificate);
      await sendApi("PUT", "/api/supervisor/village", body);
      await refreshUser();
      onSelected();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card title="Step 1 · Select your village">
        <p>Choose State, District, Sub-district (Tehsil) and the village you are the Pradhan (Village Head) of. Each village has one Pradhan.</p>
        <LocationPicker value={village} onChange={setVillage} />
        {village && !village.on_dashboard && (
          <Alert kind="info">ℹ️ {village.village_name} is not on the dashboard yet. It will be added once the admin approves your first data submission.</Alert>
        )}
      </Card>
      <Card title="Step 2 · Upload your Pradhan certificate">
        <p>
          Upload your <b>Pradhan election certificate / appointment letter (praman patra)</b> as a PDF or a clear photo (JPG or PNG, up
          to {MAX_CERTIFICATE_MB} MB). The admin checks it and then opens data entry for your village.
        </p>
        <div className="controls">
          <label className="field grow">
            <span>Pradhan certificate</span>
            <input type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => setCertificate(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn primary" type="submit" disabled={!village || !certificate || busy}>
            <ShieldCheck size={16} /> {busy ? "Sending…" : "Send for verification"}
          </button>
        </div>
        {error && <Alert kind="error">❌ {error}</Alert>}
      </Card>
    </form>
  );
}

function AwaitingVerification({ user, village, onCheck }: {
  user: User;
  village: CensusVillageDetails;
  onCheck: () => Promise<unknown>;
}) {
  const [checking, setChecking] = useState(false);
  return (
    <Card title="⏳ Waiting for admin verification">
      <dl className="info-list">
        <div><dt>Village</dt><dd><b>{village.village_name}</b> ({village.village_code})</dd></div>
        <div><dt>Location</dt><dd>{village.state_name} › {village.district_name} › {village.subdistrict_name}</dd></div>
        <div><dt>Certificate</dt><dd>{user.certificate_filename ?? "—"}</dd></div>
        <div><dt>Sent</dt><dd>{fmtDate(user.certificate_uploaded_at)}</dd></div>
      </dl>
      <p>The admin is checking your Pradhan certificate. Data entry for {village.village_name} opens as soon as you are verified.</p>
      <button className="btn" disabled={checking} onClick={async () => { setChecking(true); await onCheck(); setChecking(false); }}>
        <RefreshCw size={16} /> {checking ? "Checking…" : "Check again"}
      </button>
    </Card>
  );
}

function VillageData({ user }: { user: User }) {
  const { data: mine, mutate: reloadVillage } = useSupervisorVillage(true);
  const { data: fields = [] } = useSurveyFields();
  const { data: submissions = [], mutate: reloadSubmissions } = useMySubmissions(true);
  const [tab, setTab] = useState<"form" | "excel">("form");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const village = mine!.village!;
  const current = mine!.current;
  const pending = submissions.find((s) => s.status === "pending");
  const lastReviewed = submissions.find((s) => s.status !== "pending");

  async function send(body: unknown, url: string) {
    setBusy(true);
    setMessage(null);
    try {
      await sendApi("POST", url, body);
      await Promise.all([reloadSubmissions(), reloadVillage()]);
      setMessage({ kind: "success", text: "Sent to the admin for approval. The dashboard will show it once approved." });
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(s: Submission) {
    if (!confirm("Withdraw this submission? The admin will no longer see it.")) return;
    try {
      await sendApi("DELETE", `/api/supervisor/submissions/${s.id}`);
      await reloadSubmissions();
      setMessage({ kind: "success", text: "Submission withdrawn." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <>
      <div className="village-banner">
        <div>
          <span className="banner-name">🏡 {village.village_name}</span>
          <span className="banner-meta">
            {village.state_name} › {village.district_name} › {village.subdistrict_name} | Code: <b>{village.village_code}</b>
            {village.population_2011 != null && <> | Census 2011 population: <b>{fmt(village.population_2011)}</b></>}
          </span>
        </div>
        <span className="banner-pill">Supervisor: <b>{user.full_name || user.username}</b></span>
      </div>

      {!current && (
        <Alert kind="info">ℹ️ This village is not on the dashboard yet. Fill in at least <b>Total residents</b> and <b>Total village area</b>; it is added once the admin approves.</Alert>
      )}
      {pending && (
        <Alert kind="warning">
          ⏳ Your submission from {fmtDate(pending.modified_at)} is waiting for admin approval. Sending again replaces it.{" "}
          <button className="btn" onClick={() => withdraw(pending)}><Trash2 size={14} /> Withdraw</button>
        </Alert>
      )}
      {!pending && lastReviewed?.status === "rejected" && (
        <Alert kind="error">
          ❌ Your last submission was rejected{lastReviewed.reviewed_by && <> by {lastReviewed.reviewed_by}</>}:{" "}
          <b>{lastReviewed.review_comment}</b>. Please correct it and send again.
        </Alert>
      )}
      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ id: "form", label: "✏️ Fill in on website" }, { id: "excel", label: "📊 Upload Excel" }]}
      />
      {tab === "form" ? (
        fields.length > 0 && (
          <SurveyForm
            key={JSON.stringify(current)}
            fields={fields}
            current={current}
            busy={busy}
            onSubmit={(values) => send({ values }, "/api/supervisor/submissions")}
          />
        )
      ) : (
        <ExcelUpload villageCode={village.village_code} busy={busy} onUpload={(body) => send(body, "/api/supervisor/submissions/excel")} />
      )}

      <h5 className="card-title section-gap">🗂️ My Submissions</h5>
      {submissions.length ? (
        <SubmissionHistory submissions={submissions} fields={fields} current={current} />
      ) : (
        <p className="caption">Nothing submitted yet.</p>
      )}
    </>
  );
}

function ExcelUpload({ villageCode, busy, onUpload }: {
  villageCode: string;
  busy: boolean;
  onUpload: (body: FormData) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    if (await onUpload(body)) {
      setFile(null);
      e.currentTarget?.reset();
    }
  }

  async function template() {
    setError(null);
    try {
      await downloadFile("/api/supervisor/template.xlsx", `Survey_Template_${villageCode}.xlsx`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Card>
      <ol className="steps">
        <li>
          Download the template. It has only your village&apos;s row and the survey columns, already filled with the
          current dashboard values. The <i>Field Guide</i> sheet explains each column and its unit.
          <div><button type="button" className="btn" onClick={template}><Download size={16} /> Download Excel template</button></div>
        </li>
        <li>Change the values in Excel. Do not rename the columns or change <code>village_code</code>.</li>
        <li>
          Upload the saved file. It is sent to the admin for approval.
          <form onSubmit={upload} className="controls">
            <label className="field grow">
              <span>Filled template (.xlsx)</span>
              <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn primary" type="submit" disabled={!file || busy}>
              <Upload size={16} /> {busy ? "Uploading…" : "Upload for approval"}
            </button>
          </form>
        </li>
      </ol>
      {error && <Alert kind="error">❌ {error}</Alert>}
    </Card>
  );
}

function SubmissionHistory({ submissions, fields, current }: {
  submissions: Submission[];
  fields: SurveyField[];
  current: Record<string, number | null> | null;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = submissions.find((s) => s.id === openId);
  return (
    <>
      <DataTable<Submission>
        rows={submissions}
        rowKey={(s) => String(s.id)}
        columns={[
          { key: "modified_at", label: "Sent", render: (s) => fmtDate(s.modified_at) },
          { key: "source", label: "Via", render: (s) => (s.source === "excel" ? "Excel" : "Website form") },
          { key: "status", label: "Status", render: (s) => <StatusPill status={s.status} /> },
          { key: "review_comment", label: "Admin comment", render: (s) => s.review_comment || "—" },
          { key: "reviewed_at", label: "Reviewed", render: (s) => (s.reviewed_at ? `${fmtDate(s.reviewed_at)} by ${s.reviewed_by ?? "—"}` : "—") },
          {
            key: "view", label: "",
            render: (s) => <button className="btn" onClick={() => setOpenId(openId === s.id ? null : s.id)}>{openId === s.id ? "Hide" : "View values"}</button>,
          },
        ]}
      />
      {open && (
        <Card title={`Values sent on ${fmtDate(open.modified_at)}`}>
          {open.status !== "pending" && <p className="caption">&ldquo;On dashboard&rdquo; shows today&apos;s values.</p>}
          <ValuesDiff fields={fields} current={current} proposed={open.values} />
        </Card>
      )}
    </>
  );
}
