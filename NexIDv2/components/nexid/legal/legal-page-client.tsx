"use client";

import Link from "next/link";
import { legalLabels, legalPages, type LegalKey } from "@/lib/services/legalService";

export function LegalPageClient({ pageKey }: { pageKey: LegalKey }) {
  const page = legalPages[pageKey] ?? legalPages.faq;
  return (
    <section id="legal" className="view active">
      <div className="legal-layout">
        <aside className="legal-nav">{(Object.keys(legalPages) as LegalKey[]).map((key) => <Link key={key} className={key === pageKey ? "active" : ""} href={`/legal/${key}`}>{legalLabels[key]}</Link>)}</aside>
        <article className="legal-page"><div className="eyebrow"><i className="dot" /> Legal and safety</div><h1>{page[0]}</h1><h3>{page[1]}</h3><p>{page[2]}</p><h3>{page[3]}</h3><p>{page[4]}</p></article>
      </div>
    </section>
  );
}
