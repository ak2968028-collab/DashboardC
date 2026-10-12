"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, DataTable, PageTitle } from "@/components/ui";
import { errorMessage, refreshAll, useEmissionFactors } from "@/lib/api";
import type { EmissionFactor } from "@/lib/types";

export default function SettingsPage() {
  const { data: factors = [] } = useEmissionFactors();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function recalculate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/emissions/recompute", { method: "POST" });
      if (!res.ok) throw new Error(await errorMessage(res));
      const { villages_recalculated } = await res.json();
      await refreshAll();
      setMessage({ kind: "success", text: `Recalculated emissions for ${villages_recalculated} villages successfully!` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>⚙️ Carbon Emission Factors &amp; Modeling Parameters</PageTitle>
      <p>Inspect active greenhouse gas emission factors without altering core software code.</p>
      <DataTable<EmissionFactor>
        rows={factors}
        rowKey={(f) => f.activity}
        columns={[
          { key: "activity", label: "Activity / Fuel" },
          { key: "unit", label: "Unit" },
          { key: "factor", label: "Factor", numeric: true },
          { key: "factor_unit", label: "Emission Factor Unit" },
          { key: "standard", label: "Standard" },
        ]}
      />
      <div style={{ margin: "14px 0" }}>
        <button className="btn primary" onClick={recalculate} disabled={busy}>
          <RefreshCw size={16} /> {busy ? "Re-calculating emissions across all villages…" : "Recalculate All District Emissions Now"}
        </button>
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </>
  );
}
