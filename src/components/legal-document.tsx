import type { ReactNode } from "react";

import { PublicShell } from "@/components/public-shell";

export function LegalDocument({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <PublicShell newsletter={false}>
      <main className="legal-page site-container">
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">Legal information</p>
          <h1>{title}</h1>
          <p className="legal-page__summary">{summary}</p>
          <p className="legal-page__updated">Last updated: 1 September 2026</p>
        </header>
        <article className="legal-page__content">{children}</article>
      </main>
    </PublicShell>
  );
}
