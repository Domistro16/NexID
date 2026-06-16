type IconName = "desk" | "queue" | "earnings" | "settled" | "how";

export function Mark() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M11 22.5 18.2 10l10.7 20H21.7l-2.9-5.5-3.1 5.5H9.5l5.6-9.5"
        stroke="var(--gold)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NavIcon({ name }: { name: IconName }) {
  if (name === "queue") {
    return (
      <svg className="navicon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 5.8h10c1 0 1.8.8 1.8 1.8v1.2H5.2V7.6C5.2 6.6 6 5.8 7 5.8Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M5.2 8.8h13.6v7.6c0 1-.8 1.8-1.8 1.8H7c-1 0-1.8-.8-1.8-1.8V8.8Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M8.2 12.1h7.6M8.2 15.1h4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "earnings") {
    return (
      <svg className="navicon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.5 17.2 9 12.7l3.1 3.1 7.4-8.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.2 6.9h4.3v4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 20.2h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".55" />
      </svg>
    );
  }
  if (name === "how") {
    return (
      <svg className="navicon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.8 4.8h10.4c1 0 1.8.8 1.8 1.8v10.8c0 1-.8 1.8-1.8 1.8H6.8c-1 0-1.8-.8-1.8-1.8V6.6c0-1 .8-1.8 1.8-1.8Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M8.4 8.2h7.2M8.4 12h7.2M8.4 15.8h4.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M17.2 4.8v4.4h-4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
      </svg>
    );
  }
  if (name === "settled") {
    return (
      <svg className="navicon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.5 4.8h7.1l2.9 2.9v10.1c0 1-.8 1.8-1.8 1.8H7.5c-1 0-1.8-.8-1.8-1.8V6.6c0-1 .8-1.8 1.8-1.8Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M14.5 4.9v3h3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m8.8 13.1 2 2 4.5-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="navicon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 10.2 12 4.3l7.5 5.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.4 9.4v8.2c0 .9.7 1.6 1.6 1.6h8c.9 0 1.6-.7 1.6-1.6V9.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.2 19.2v-5.1c0-.6.5-1.1 1.1-1.1h3.4c.6 0 1.1.5 1.1 1.1v5.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
