import Link from "next/link";
import type { ReactNode } from "react";
import { logoutInternalAdmin } from "@/app/internal/auth-actions";
import { internalNav } from "@/lib/internal/admin-data";

type InternalStat = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
};

function textValue(value: ReactNode) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function statusTone(value: ReactNode) {
  const text = textValue(value).toLowerCase();
  if (/(blocked|failed|disputed|no-trade|wide|low|stale|review)/.test(text)) return "bad";
  if (/(pending|partial|mixed|draft|unset|none|manual)/.test(text)) return "warn";
  if (/(tradable|ready|approved|paid|generated|resolved|live|filled|normal|strong|clean|hot|yes)/.test(text)) return "good";
  return "idle";
}

function labelize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InternalAdminPage({
  title,
  eyebrow,
  deck,
  stats,
  children
}: {
  title: string;
  eyebrow: string;
  deck?: string;
  stats?: InternalStat[];
  children: ReactNode;
}) {
  return (
    <main className="internal-shell">
      <aside className="internal-rail">
        <Link href="/pulse" className="internal-brand"><span>NexMarkets</span><b>Internal</b></Link>
        <div className="internal-rail-copy">Launch operations, settlement review, points integrity and referral safety.</div>
        <nav>
          {internalNav.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutInternalAdmin} className="internal-logout-form">
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <section className="internal-main">
        <header className="internal-hero">
          <div>
            <div className="eyebrow"><i className="dot" /> {eyebrow}</div>
            <h1>{title}</h1>
            {deck ? <p>{deck}</p> : null}
          </div>
          <div className="internal-orbit" aria-hidden="true"><span /></div>
        </header>
        {stats?.length ? (
          <div className="internal-stat-grid">
            {stats.map((stat) => (
              <div className="internal-stat" key={String(stat.label)}>
                <span>{stat.label}</span>
                <b>{stat.value}</b>
                {stat.note ? <small>{stat.note}</small> : null}
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </section>
    </main>
  );
}

export function InternalTable({
  columns,
  rows,
  primaryColumn = columns[0],
  secondaryColumns = columns.slice(1, 3),
  metricColumns = columns.slice(3, 6),
  detailColumns,
  statusColumn,
  actionColumn = "actions",
  emptyText = "No live records yet."
}: {
  columns: string[];
  rows: Array<Record<string, ReactNode>>;
  primaryColumn?: string;
  secondaryColumns?: string[];
  metricColumns?: string[];
  detailColumns?: string[];
  statusColumn?: string;
  actionColumn?: string;
  emptyText?: string;
}) {
  const detailKeys = detailColumns ?? columns.filter((column) => (
    column !== primaryColumn &&
    column !== actionColumn &&
    !secondaryColumns.includes(column) &&
    !metricColumns.includes(column)
  ));
  return (
    <div className="internal-record-list">
      {rows.map((row, index) => (
        <article className="internal-record" key={index}>
          <div className="internal-record-main">
            <div className="internal-record-title">
              <h2>{row[primaryColumn]}</h2>
              <div className="internal-chip-row">
                {secondaryColumns.map((column) => row[column] ? (
                  <span className={`internal-chip ${column === statusColumn ? statusTone(row[column]) : statusTone(row[column])}`} key={column}>
                    {row[column]}
                  </span>
                ) : null)}
              </div>
            </div>
            {metricColumns.length ? (
              <div className="internal-record-metrics">
                {metricColumns.map((column) => (
                  <div className="internal-record-metric" key={column}>
                    <span>{labelize(column)}</span>
                    <b>{row[column] ?? "none"}</b>
                  </div>
                ))}
              </div>
            ) : null}
            {detailKeys.length ? (
              <details className="internal-details">
                <summary>Audit details</summary>
                <div>
                  {detailKeys.map((column) => (
                    <p key={column}>
                      <span>{labelize(column)}</span>
                      <b>{row[column] || "none"}</b>
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
          {row[actionColumn] ? <div className="internal-record-actions">{row[actionColumn]}</div> : null}
        </article>
      ))}
      {!rows.length ? <div className="internal-empty">{emptyText}</div> : null}
    </div>
  );
}

export function InternalCommandPanel({
  title,
  description,
  defaultOpen = false,
  children
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="internal-command-panel" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <small>{description}</small>
      </summary>
      <div className="internal-command-body">{children}</div>
    </details>
  );
}
