"use client";

import { useRouter } from "next/navigation";
import {
  legalLabels,
  legalPages,
  type LegalKey,
  type DocBlock,
  type DocSection,
  type InfoSection
} from "@/lib/services/legalService";

export function LegalPageClient({ pageKey }: { pageKey: LegalKey }) {
  const router = useRouter();
  const item = legalPages[pageKey] ?? legalPages.faq;

  // Render a single DocBlock
  const renderDocBlock = (block: DocBlock, idx: number) => {
    switch (block.type) {
      case "text":
        return (
          <div className="nmx-doc-text" key={idx}>
            <h3>{block.title}</h3>
            {(block.paragraphs || []).map((p, pIdx) => (
              <p key={pIdx}>{p}</p>
            ))}
          </div>
        );
      case "table":
        return (
          <div className="nmx-doc-table" key={idx}>
            <h3>{block.title}</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {(block.rows || []).map((r, rIdx) => (
                  <tr key={rIdx}>
                    <td>
                      <b>{r[0]}</b>
                    </td>
                    <td>{r[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "example":
        return (
          <div className="nmx-doc-example" key={idx}>
            <h3>{block.title}</h3>
            <div className="nmx-doc-example-grid">
              <div className="nmx-doc-example-card good">
                <strong>{block.goodTitle || "Good"}</strong>
                <p>{block.good}</p>
              </div>
              <div className="nmx-doc-example-card weak">
                <strong>{block.weakTitle || "Weak"}</strong>
                <p>{block.weak}</p>
              </div>
            </div>
            {block.why ? <div className="nmx-doc-note" style={{ marginTop: "8px" }}>{block.why}</div> : null}
          </div>
        );
      case "check":
        return (
          <div className="nmx-doc-check" key={idx}>
            <h3>{block.title}</h3>
            <ul>
              {(block.items || []).map((x, xIdx) => (
                <li key={xIdx}>{x}</li>
              ))}
            </ul>
          </div>
        );
      case "defs":
        return (
          <div className="nmx-doc-defs" key={idx}>
            <h3>{block.title}</h3>
            <div className="nmx-doc-def-grid">
              {(block.items || []).map((r, rIdx) => (
                <div className="nmx-doc-def" key={rIdx}>
                  <b>{r[0]}</b>
                  <p>{r[1]}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case "note":
        return (
          <div className="nmx-doc-note" key={idx}>
            {block.text}
          </div>
        );
      default:
        return null;
    }
  };

  if (pageKey === "docs") {
    const docSections = (item.sections || []) as DocSection[];
    const docNav = docSections.map((sec, i) => (
      <a href={`#nmx-doc-${i}`} key={i}>
        <span>{String(i + 1).padStart(2, "0")}</span>
        {sec.title}
      </a>
    ));

    const docBody = docSections.map((sec, i) => (
      <section className="nmx-doc-section" id={`nmx-doc-${i}`} key={i}>
        <div className="nmx-doc-section-head">
          <div className="nmx-doc-kicker">{String(i + 1).padStart(2, "0")}</div>
          <h2>{sec.title}</h2>
          <p>{sec.intro}</p>
        </div>
        <div className="nmx-doc-blocks">
          {(sec.blocks || []).map((block, blockIdx) => renderDocBlock(block, blockIdx))}
        </div>
      </section>
    ));

    return (
      <section className="nmx-docs-page nmx-doc-standalone">
        <div className="nmx-doc-hero">
          <div>
            <div className="eyebrow">
              <i className="dot" />
              {item.kicker}
            </div>
            <h1>{item.title}</h1>
            <p>{item.lead}</p>
          </div>
          <div className="nmx-doc-version">
            <b>Guide v1</b>
            <span>Search, trade, launch, settle, share.</span>
          </div>
        </div>
        <div className="nmx-doc-layout">
          <aside className="nmx-doc-sidebar">
            <b>Docs</b>
            {docNav}
          </aside>
          <article className="nmx-doc-body">{docBody}</article>
        </div>
      </section>
    );
  }

  const keys = ["terms", "privacy", "how"];
  const nav = keys.map((k) => (
    <button
      key={k}
      className={pageKey === k ? "active" : ""}
      onClick={() => router.push(`/legal/${k}`)}
    >
      {legalLabels[k as LegalKey]}
    </button>
  ));

  const infoSections = (item.sections || []) as InfoSection[];
  const sectionsList = infoSections.map((sec, i) => (
    <article className="nmx-info-card" key={i}>
      <span>{String(i + 1).padStart(2, "0")}</span>
      <h3>{sec[0]}</h3>
      <p>{sec[1]}</p>
    </article>
  ));

  return (
    <section className="nmx-info-page">
      <div className="nmx-info-hero">
        <div>
          <div className="eyebrow">
            <i className="dot" />
            {item.kicker}
          </div>
          <h1>{item.title}</h1>
          <p>{item.lead}</p>
        </div>
      </div>
      <nav className="nmx-info-tabs" aria-label="Info pages">
        {nav}
      </nav>
      <div className="nmx-info-stack">{sectionsList}</div>
    </section>
  );
}
