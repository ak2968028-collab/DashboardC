import type { ReactNode } from "react";

/** Plain reading layout for the policy pages linked from the footer. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="legal">
      <h1>{title}</h1>
      <p className="legal-updated">Last updated: {updated}</p>
      {children}
    </article>
  );
}
