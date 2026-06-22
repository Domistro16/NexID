"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark, NavIcon } from "./icons";
import type {
  ConfidenceLabel,
  EarningsPoint,
  ReviewDraft,
  ReviewerCase,
  ReviewerOutcome,
  ReviewerView,
  ReviewerWorkbenchData
} from "./types";

type Props = {
  initialView: ReviewerView;
  initialCaseId?: string;
};

const nav: Array<{ id: ReviewerView; label: string; icon: "desk" | "queue" | "earnings" | "settled" | "how" }> = [
  { id: "desk", label: "Desk", icon: "desk" },
  { id: "queue", label: "Queue", icon: "queue" },
  { id: "earnings", label: "Earnings", icon: "earnings" },
  { id: "history", label: "Settled", icon: "settled" },
  { id: "how", label: "How", icon: "how" }
];

let cachedAccess = false;
let cachedWorkbench: ReviewerWorkbenchData | null = null;

function emptyDraft(): ReviewDraft {
  return {
    outcome: null,
    confidence: "",
    note: "",
    saved: false,
    submitted: false,
    revealed: false,
    audit: null,
    checks: { source: false, timestamp: false, rule: false, fallback: false }
  };
}

function draftFromCase(item?: ReviewerCase | null): ReviewDraft {
  if (!item) return emptyDraft();
  return {
    outcome: item.recommendedOutcome,
    confidence: item.confidenceLabel ?? "",
    note: item.noteText ?? "",
    nonce: item.noteNonce ?? undefined,
    noteHash: item.noteHash ?? undefined,
    saved: false,
    submitted: Boolean(item.submittedAt),
    revealed: Boolean(item.revealedAt),
    audit: item.submittedAt
      ? { ok: true, reasons: [item.revealedAt ? "Reviewer note was revealed and recorded." : "Private reviewer note commit is recorded."] }
      : null,
    checks: { source: false, timestamp: false, rule: false, fallback: false }
  };
}

function draftKey(id: string) {
  return `nmxReviewerDraft:${id}`;
}

function readDraft(id: string, item?: ReviewerCase | null) {
  if (typeof window === "undefined") return draftFromCase(item);
  const raw = window.localStorage.getItem(draftKey(id));
  if (!raw) return draftFromCase(item);
  try {
    return { ...draftFromCase(item), ...JSON.parse(raw) } as ReviewDraft;
  } catch {
    return draftFromCase(item);
  }
}

function saveDraftToStorage(id: string, draft: ReviewDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(id), JSON.stringify(draft));
}

function outcomeLabel(outcome?: ReviewerOutcome | null) {
  if (outcome === "ride") return "Ride";
  if (outcome === "fade") return "Fade";
  if (outcome === "invalid") return "Invalid";
  return "";
}

function outcomeValue(label: string): ReviewerOutcome | null {
  const normalized = label.toLowerCase();
  if (normalized === "ride") return "ride";
  if (normalized === "fade") return "fade";
  if (normalized === "invalid") return "invalid";
  return null;
}

function confidenceValue(label: ConfidenceLabel | "") {
  if (label === "High") return 0.9;
  if (label === "Medium") return 0.65;
  if (label === "Low") return 0.35;
  return undefined;
}

function routeFor(view: ReviewerView, caseId?: string) {
  if (view === "desk") return "/";
  if (view === "queue") return "/queue";
  if (view === "earnings") return "/earnings";
  if (view === "history") return "/history";
  if (view === "how") return "/how";
  return caseId ? `/cases/${encodeURIComponent(caseId)}` : "/queue";
}

function validUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function localAudit(draft: ReviewDraft) {
  const text = draft.note.toLowerCase();
  const failures: string[] = [];
  if (!draft.outcome) failures.push("No outcome was selected.");
  if (!draft.confidence) failures.push("No confidence level was selected.");
  if (draft.note.length < 90) failures.push("Evidence Note is too short. It must explain the rule, source, timestamp and fallback.");
  if (!(draft.checks.source || text.includes("source"))) failures.push("Locked source was not clearly addressed.");
  if (!(draft.checks.timestamp || text.includes("timestamp") || text.includes("utc") || text.includes("deadline"))) failures.push("Timestamp or valid time window was not clearly addressed.");
  if (!(draft.checks.rule || text.includes("ride") || text.includes("fade") || text.includes("invalid"))) failures.push("Ride/Fade/Invalid rule applied was not clear.");
  if (!(draft.checks.fallback || text.includes("fallback"))) failures.push("Fallback rule was not considered.");
  return {
    ok: failures.length === 0,
    reasons: failures.length ? failures : ["Submission accepted. Source, timestamp, rule and fallback were addressed."]
  };
}

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashCommit(note: string, nonce: string) {
  const input = new TextEncoder().encode(`${note.trim()}${nonce.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function apiMessage(response: Response) {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function middleDot() {
  return " \u00b7 ";
}

export function ReviewerWorkbench({ initialView, initialCaseId }: Props) {
  const router = useRouter();
  const [view, setView] = useState<ReviewerView>(initialView);
  const [caseId, setCaseId] = useState(initialCaseId ?? "");
  const [entered, setEntered] = useState(cachedAccess);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workbench, setWorkbench] = useState<ReviewerWorkbenchData | null>(cachedWorkbench);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [caseTab, setCaseTab] = useState<"all" | "rules" | "evidence" | "verdict">("all");
  const [queueFilter, setQueueFilter] = useState("all");
  const [earningDetail, setEarningDetail] = useState<"pending" | "paid" | "month" | "lifetime">("paid");
  const [earnRange, setEarnRange] = useState<"7D" | "30D" | "90D" | "Life">("7D");
  const [earningPoint, setEarningPoint] = useState(0);
  const [pointLocked, setPointLocked] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    setView(initialView);
    if (initialCaseId) setCaseId(initialCaseId);
  }, [initialView, initialCaseId]);

  useEffect(() => {
    const theme = window.localStorage.getItem("nmxReviewerTheme") || "dark";
    document.documentElement.dataset.theme = theme;
    if (cachedWorkbench) {
      setWorkbench(cachedWorkbench);
      setEntered(true);
      return;
    }
    if (window.localStorage.getItem("nmxReviewerAccess") === "ok") {
      setEntered(true);
    }
  }, []);

  const showToast = useCallback((title: string, message: string) => {
    setToast({ title, message });
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/main/reviewer/workbench", {
        cache: "no-store",
        credentials: "include"
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      const body = await response.json() as { workbench: ReviewerWorkbenchData };
      cachedAccess = true;
      cachedWorkbench = body.workbench;
      setWorkbench(body.workbench);
      setDrafts((current) => {
        const next = { ...current };
        for (const item of body.workbench.cases) {
          if (!next[item.id]) next[item.id] = readDraft(item.id, item);
        }
        return next;
      });
      if (!caseId && body.workbench.cases[0]) setCaseId(body.workbench.cases[0].id);
      window.localStorage.setItem("nmxReviewerAccess", "ok");
      setEntered(true);
      return body.workbench;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load reviewer workbench.";
      setError(message);
      cachedAccess = false;
      cachedWorkbench = null;
      setEntered(false);
      window.localStorage.removeItem("nmxReviewerAccess");
      return null;
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const loginWithReviewerAccess = useCallback(async (accessId: string, accessKey: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/main/reviewer/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessId, accessKey })
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      cachedAccess = true;
      window.localStorage.setItem("nmxReviewerAccess", "ok");
      setEntered(true);
      await loadWorkbench();
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Reviewer access could not be verified.";
      cachedAccess = false;
      cachedWorkbench = null;
      window.localStorage.removeItem("nmxReviewerAccess");
      setError(message);
      setEntered(false);
    } finally {
      setLoading(false);
    }
  }, [loadWorkbench]);

  useEffect(() => {
    if (entered && !workbench && !loading) {
      void loadWorkbench();
    }
  }, [entered, loadWorkbench, loading, workbench]);

  const currentCase = useMemo(() => {
    if (!workbench?.cases.length) return null;
    return workbench.cases.find((item) => item.id === caseId) ?? workbench.cases[0] ?? null;
  }, [caseId, workbench]);

  const currentDraft = currentCase ? drafts[currentCase.id] ?? draftFromCase(currentCase) : emptyDraft();

  const updateDraft = useCallback((id: string, updater: (draft: ReviewDraft) => ReviewDraft) => {
    setDrafts((current) => {
      const nextDraft = updater(current[id] ?? emptyDraft());
      saveDraftToStorage(id, nextDraft);
      return { ...current, [id]: nextDraft };
    });
  }, []);

  const go = useCallback((nextView: ReviewerView) => {
    router.push(routeFor(nextView, caseId || currentCase?.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [caseId, currentCase?.id, router]);

  const openCase = useCallback((id: string) => {
    setCaseTab(window.matchMedia("(max-width: 759px)").matches ? "rules" : "all");
    router.push(routeFor("case", id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [router]);

  const toggleTheme = useCallback(() => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("nmxReviewerTheme", next);
  }, []);

  const commitVerdict = useCallback(async (item: ReviewerCase, draft: ReviewDraft) => {
    const audit = localAudit(draft);
    if (!audit.ok) {
      updateDraft(item.id, (current) => ({ ...current, audit }));
      showToast("Submission not accepted", "The submission status explains what is missing before the sealed commit can be sent.");
      return;
    }
    if (!draft.outcome) return;
    setLoading(true);
    try {
      const nonce = randomNonce();
      const noteHash = await hashCommit(draft.note, nonce);
      const payload: Record<string, unknown> = {
        outcome: draft.outcome,
        noteHash,
        confidence: confidenceValue(draft.confidence)
      };
      const sourceUrl = validUrl(item.url);
      if (sourceUrl) payload.sourceUrl = sourceUrl;
      const response = await fetch(`/api/main/markets/${encodeURIComponent(item.id)}/proof-flow/reviewer-note`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      updateDraft(item.id, (current) => ({
        ...current,
        saved: true,
        submitted: true,
        nonce,
        noteHash,
        audit: { ok: true, reasons: ["Private reviewer note commit is recorded. Keep the nonce for reveal."] }
      }));
      showToast("Submission accepted", "Your private verdict commit was recorded for this ProofFlow panel.");
      await loadWorkbench();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "The reviewer note could not be submitted.";
      updateDraft(item.id, (current) => ({ ...current, audit: { ok: false, reasons: [message] } }));
      showToast("Submission not accepted", message);
    } finally {
      setLoading(false);
    }
  }, [loadWorkbench, showToast, updateDraft]);

  const revealVerdict = useCallback(async (item: ReviewerCase, draft: ReviewDraft) => {
    if (!draft.outcome || !draft.note.trim() || !draft.nonce) {
      const message = "Reveal requires the same note, outcome, and nonce used for the private commit.";
      updateDraft(item.id, (current) => ({ ...current, audit: { ok: false, reasons: [message] } }));
      showToast("Reveal not accepted", message);
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        outcome: draft.outcome,
        note: draft.note,
        nonce: draft.nonce
      };
      const sourceUrl = validUrl(item.url);
      if (sourceUrl) payload.sourceUrl = sourceUrl;
      const response = await fetch(`/api/main/markets/${encodeURIComponent(item.id)}/proof-flow/reviewer-note/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      updateDraft(item.id, (current) => ({
        ...current,
        revealed: true,
        audit: { ok: true, reasons: ["Reviewer note reveal matched the private commit and was recorded."] }
      }));
      showToast("Reveal accepted", "Your Evidence Note now matches the sealed commit for settlement.");
      await loadWorkbench();
    } catch (revealError) {
      const message = revealError instanceof Error ? revealError.message : "The reviewer note could not be revealed.";
      updateDraft(item.id, (current) => ({ ...current, audit: { ok: false, reasons: [message] } }));
      showToast("Reveal not accepted", message);
    } finally {
      setLoading(false);
    }
  }, [loadWorkbench, showToast, updateDraft]);

  if (!entered || !workbench) {
    return <LoginScreen loading={loading} error={error} onEnter={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      void loginWithReviewerAccess(String(formData.get("accessId") ?? ""), String(formData.get("accessKey") ?? ""));
    }} />;
  }

  return (
    <>
      <div className="bg-grid" />
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <Brand title="ProofFlow" subtitle="Reviewer Workbench" />
            <div className="top-actions">
              <button className="ghost" type="button" onClick={toggleTheme} aria-label="Toggle theme">Theme</button>
              <button className="ghost desktop-only" type="button" onClick={() => go("earnings")}>Earnings</button>
              <button className="ghost desktop-only" type="button" onClick={() => go("history")}>Settled</button>
              <div className="reviewer-pill">
                <div className="avatar">{workbench.reviewer.initials}</div>
                <div><b>{workbench.reviewer.displayName}</b><span>{workbench.reviewer.tier}{middleDot()}active</span></div>
              </div>
            </div>
          </div>
        </header>
        <div className="shell">
          <aside className="side">
            <div className="side-card">
              <Nav view={view} go={go} />
            </div>
            <div className="side-card">
              <span className="kicker"><i className="dot good" /> Reviewer status</span>
              <div style={{ height: 10 }} />
              <div className="stat">
                <span>Score</span>
                <b>{workbench.reviewer.score}</b>
                <small>{workbench.reviewer.tier}{middleDot()}{workbench.reviewer.specialty}</small>
              </div>
              <div style={{ height: 12 }} />
              <div className="progress"><i style={{ width: `${workbench.reviewer.progress}%` }} /></div>
            </div>
          </aside>
          <main className="main">
            {view === "desk" && <DeskScreen data={workbench} onOpenCase={openCase} onGo={go} onSelectEarning={(key) => { setEarningDetail(key); go("earnings"); }} />}
            {view === "queue" && <QueueScreen cases={workbench.cases} filter={queueFilter} onFilter={setQueueFilter} onOpenCase={openCase} />}
            {view === "case" && (
              <CaseRoom
                item={currentCase}
                draft={currentDraft}
                tab={caseTab}
                loading={loading}
                onTab={setCaseTab}
                updateDraft={updateDraft}
                onCommit={commitVerdict}
                onReveal={revealVerdict}
              />
            )}
            {view === "earnings" && (
              <EarningsScreen
                data={workbench}
                detail={earningDetail}
                setDetail={setEarningDetail}
                range={earnRange}
                setRange={(range) => {
                  const points = workbench.earnings.chart[range] ?? [];
                  setEarnRange(range);
                  setEarningPoint(Math.max(0, points.length - 1));
                  setPointLocked(false);
                }}
                point={earningPoint}
                setPoint={setEarningPoint}
                pointLocked={pointLocked}
                setPointLocked={setPointLocked}
                showToast={showToast}
              />
            )}
            {view === "history" && <HistoryScreen rows={workbench.history} />}
            {view === "how" && <HowScreen />}
          </main>
        </div>
        <nav className="mnav" aria-label="Mobile navigation">
          <Nav view={view} go={go} mobile />
        </nav>
      </div>
      <div className={`toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast && <><b>{toast.title}</b><span>{toast.message}</span></>}
      </div>
    </>
  );
}

function Brand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="brand">
      <div className="mark" aria-hidden="true"><Mark /></div>
      <div><b>{title}</b><span>{subtitle}</span></div>
    </div>
  );
}

function LoginScreen({ loading, error, onEnter }: { loading: boolean; error: string; onEnter: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <>
      <div className="bg-grid" />
      <section className="login">
        <div className="login-card">
          <div className="login-hero">
            <Brand title="NexMarkets" subtitle="ProofFlow Workbench" />
            <div>
              <span className="kicker"><i className="dot" /> Evidence Reviewer Access</span>
              <h1>Review markets with the rules in front of you.</h1>
              <p>This hub is for qualified Evidence Reviewers. Each case shows the locked market rules, the evidence available, and the exact note required before a sealed verdict can be submitted.</p>
            </div>
            <div className="meta-row">
              <span className="chip"><i className="dot good" /> Private verdicts</span>
              <span className="chip"><i className="dot" /> Locked Resolution Card</span>
              <span className="chip"><i className="dot warn" /> Post-submission audit</span>
            </div>
          </div>
          <form className="login-panel" onSubmit={onEnter}>
            <div className="field"><label htmlFor="accessId">Reviewer .id</label><input id="accessId" name="accessId" placeholder="atlas.review" autoComplete="username" required /></div>
            <div className="field"><label htmlFor="accessKey">Access key</label><input id="accessKey" name="accessKey" placeholder="Reviewer access key" type="password" autoComplete="current-password" required /></div>
            {error && <div className="error-box">{error}</div>}
            <button className="primary" type="submit" disabled={loading}>{loading ? "Checking access..." : "Enter Workbench"}</button>
            <p className="hint">Access is issued by an admin and tied to a reviewer wallet. The wallet must still be assigned to a ProofFlow panel before cases appear.</p>
          </form>
        </div>
      </section>
    </>
  );
}

function Nav({ view, go, mobile = false }: { view: ReviewerView; go: (view: ReviewerView) => void; mobile?: boolean }) {
  return (
    <>
      {nav.map((item) => {
        const active = view === item.id || (view === "case" && item.id === "queue");
        return (
          <button
            key={item.id}
            type="button"
            className={mobile ? (active ? "active" : "") : `navbtn ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            <i><NavIcon name={item.icon} /></i>
            <span>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}

function DeskScreen({ data, onOpenCase, onGo, onSelectEarning }: {
  data: ReviewerWorkbenchData;
  onOpenCase: (id: string) => void;
  onGo: (view: ReviewerView) => void;
  onSelectEarning: (key: "pending" | "paid" | "month" | "lifetime") => void;
}) {
  const active = data.cases.filter((item) => item.status !== "Paid" && item.status !== "Finalized");
  const urgent = [...active].sort((left, right) => left.deadlineSeconds - right.deadlineSeconds)[0] ?? data.cases[0];
  return (
    <section className="screen section">
      <div className="hero">
        <span className="kicker"><i className="dot good" /> Reviewer desk</span>
        <h2>Start with the case that can expire first.</h2>
        <p>Your job is to apply the locked Resolution Card to the evidence. Ignore comments, market sentiment and other reviewers. Read the rules, check the source, write a clear Evidence Note, then submit a sealed verdict.</p>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="primary" type="button" disabled={!urgent} onClick={() => urgent && onOpenCase(urgent.id)}>Open most urgent case</button>
          <button className="btn" type="button" onClick={() => onGo("queue")}>View full queue</button>
          <button className="btn" type="button" onClick={() => onGo("history")}>Past settled markets</button>
          <button className="btn" type="button" onClick={() => onGo("how")}>How it works</button>
        </div>
      </div>
      <div className="grid stats">
        <div className="card stat"><span>Active cases</span><b>{data.stats.activeCases}</b><small>Assigned to you</small></div>
        <div className="card stat"><span>Due soon</span><b>{data.stats.dueSoon}</b><small>Under 3 hours</small></div>
        <button className="card stat clickable" type="button" onClick={() => onSelectEarning("paid")}><span>Auto-paid</span><b>{data.stats.autoPaid}</b><small>Paid to reviewer address</small></button>
        <div className="card stat"><span>Reviewer score</span><b>{data.stats.reviewerScore}</b><small>{data.stats.reviewerTier}</small></div>
      </div>
      <div className="split">
        <div className="card">
          <h3>What needs attention</h3>
          {data.cases.length ? (
            <div className="timeline">
              {data.cases.map((item, index) => (
                <div className="timeline-item" key={item.assignmentId}>
                  <div className="timeline-dot">{index + 1}</div>
                  <div className="timeline-box">
                    <b>{item.title}</b>
                    <span>{item.status}{middleDot()}{item.deadline} left{middleDot()}estimated {item.reward}</span>
                    <div className="actions" style={{ marginTop: 10 }}>
                      <button className="btn" type="button" onClick={() => onOpenCase(item.id)}>Review case</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No reviewer assignments" body="No ProofFlow review panels are currently assigned to this wallet." />}
        </div>
        <div className="card">
          <h3>How to review</h3>
          <div className="grid">
            <ChecklistItem title="Use the locked rules first" body="The market question, source, deadline, Ride rule, Fade rule and Invalid rule decide the case." />
            <ChecklistItem title="Stay independent" body="You cannot see other reviewer verdicts before your sealed note is submitted." />
            <ChecklistItem title="Submit first, then get confirmation" body="After submission, the platform confirms whether your note is counted or gives the reason it was not accepted." />
          </div>
        </div>
      </div>
    </section>
  );
}

function QueueScreen({ cases, filter, onFilter, onOpenCase }: {
  cases: ReviewerCase[];
  filter: string;
  onFilter: (filter: string) => void;
  onOpenCase: (id: string) => void;
}) {
  const list = cases.filter((item) => {
    if (filter === "all") return true;
    return item.priority.toLowerCase().includes(filter);
  });
  return (
    <section className="screen section">
      <div className="hero">
        <span className="kicker"><i className="dot" /> Review queue</span>
        <h2>Pick a case. Review one at a time.</h2>
        <p>Each case has a deadline and a reward estimate. Open the case, read the locked rules, then decide from the evidence available.</p>
      </div>
      <div className="toolbar">
        {[
          ["all", "All"],
          ["due", "Due soon"],
          ["new", "New"],
          ["high", "High value"]
        ].map(([key, label]) => (
          <button key={key} className={`seg ${filter === key ? "active" : ""}`} type="button" onClick={() => onFilter(key)}>{label}</button>
        ))}
      </div>
      {list.length ? <div className="grid queue-grid">{list.map((item) => <CaseCard key={item.assignmentId} item={item} onOpenCase={onOpenCase} />)}</div> : <EmptyState title="No cases in this filter" body="The live reviewer queue does not currently have matching assignments." />}
    </section>
  );
}

function CaseCard({ item, onOpenCase }: { item: ReviewerCase; onOpenCase: (id: string) => void }) {
  return (
    <article className="case-card">
      <div className="case-top">
        <div>
          <div className="case-title">{item.title}</div>
          <div className="meta-row" style={{ marginTop: 9 }}>
            <span className="chip">{item.category}</span>
            <span className="chip"><i className="dot warn" />{item.priority}</span>
          </div>
        </div>
        <span className="chip">{item.deadline}</span>
      </div>
      <div className="case-status">
        <div className="progress"><i style={{ width: `${item.progress}%` }} /></div>
        <div className="meta-row"><span className="chip">{item.status}</span><span className="chip">Reward {item.reward}</span><span className="chip">Pool ${item.pool}</span></div>
      </div>
      <button className="primary" type="button" onClick={() => onOpenCase(item.id)}>Open case</button>
    </article>
  );
}

function CaseRoom({ item, draft, tab, loading, onTab, updateDraft, onCommit, onReveal }: {
  item: ReviewerCase | null;
  draft: ReviewDraft;
  tab: "all" | "rules" | "evidence" | "verdict";
  loading: boolean;
  onTab: (tab: "all" | "rules" | "evidence" | "verdict") => void;
  updateDraft: (id: string, updater: (draft: ReviewDraft) => ReviewDraft) => void;
  onCommit: (item: ReviewerCase, draft: ReviewDraft) => void;
  onReveal: (item: ReviewerCase, draft: ReviewDraft) => void;
}) {
  if (!item) return <EmptyState title="Case not assigned" body="This reviewer wallet does not have a live ProofFlow assignment for that case." />;
  const panelClass = (panel: "rules" | "evidence" | "verdict") => `case-panel ${tab !== "all" && tab !== panel ? "mobile-hidden" : ""}`;
  return (
    <section className="screen section">
      <div className="hero case-hero">
        <span className="kicker"><i className="dot warn" /> Case room</span>
        <h2>{item.title}</h2>
        <p>{item.status}{middleDot()}{item.category}{middleDot()}{item.deadline} left. Review from the Resolution Card and evidence only.</p>
        <div className="meta-row" style={{ marginTop: 14 }}>
          <span className="chip">Proposed: {item.proposal}</span>
          <span className="chip">Challenge: {item.challenge}</span>
          <span className="chip">Reviewer pool: ${item.pool}</span>
        </div>
      </div>
      <div className="case-mobile-tabs">
        {(["all", "rules", "evidence", "verdict"] as const).map((key) => (
          <button key={key} className={tab === key ? "active" : ""} type="button" onClick={() => onTab(key)}>{key[0].toUpperCase() + key.slice(1)}</button>
        ))}
      </div>
      <div className="workbench-grid">
        <div className={panelClass("rules")}><ResolutionCard item={item} /></div>
        <div className={panelClass("evidence")}><EvidenceRoom item={item} /></div>
        <div className={panelClass("verdict")}>
          <VerdictStudio
            item={item}
            draft={draft}
            loading={loading}
            updateDraft={updateDraft}
            onCommit={onCommit}
            onReveal={onReveal}
          />
        </div>
      </div>
    </section>
  );
}

function ResolutionCard({ item }: { item: ReviewerCase }) {
  return (
    <section className="card locked">
      <span className="kicker"><i className="dot" /> Resolution Card</span>
      <h3>Rules locked before trading</h3>
      <p>The reviewer must apply these rules. Do not replace them with market sentiment or outside opinions.</p>
      <div className="rules-list">
        <Rule label="Market question" body={item.question} />
        <Rule label="Ride wins if" body={item.ride} />
        <Rule label="Fade wins if" body={item.fade} />
        <Rule label="Invalid if" body={item.invalid} />
        <Rule label="Fallback rule" body={item.fallback} />
      </div>
      <div className="source-card">
        <b>Locked source</b>
        <code>{item.url || "No source URL recorded"}</code>
        <span className="mini">{item.source}</span>
      </div>
    </section>
  );
}

function Rule({ label, body }: { label: string; body: string }) {
  return <div className="rule"><span>{label}</span><b>{body}</b></div>;
}

function EvidenceRoom({ item }: { item: ReviewerCase }) {
  return (
    <section className="card">
      <span className="kicker"><i className="dot good" /> Evidence room</span>
      <h3>Check what proves the rule.</h3>
      <p>Evidence can support Ride, Fade, or Invalid. If a challenger gives no evidence, still check the locked source yourself.</p>
      <div className="evidence-grid" style={{ marginTop: 12 }}>
        {item.evidence.length ? item.evidence.map((evidence, index) => (
          <div className="evidence-item" key={`${evidence.title}-${index}`}>
            <div className="evidence-head"><b>{evidence.title}</b><span className="chip">{evidence.meta}</span></div>
            <p>{evidence.body}</p>
            {evidence.url && <a className="mini" href={evidence.url} target="_blank" rel="noreferrer">Open evidence source</a>}
          </div>
        )) : <EmptyState title="No evidence rows" body="No public evidence submissions are recorded for this ProofFlow case yet." />}
      </div>
      <div className="card soft" style={{ marginTop: 12 }}>
        <h3>Evidence flags</h3>
        <p>These are case facts collected with the evidence. They do not decide the verdict for you.</p>
        <div className="feedback" style={{ marginTop: 10 }}>
          {item.flags.length ? item.flags.map((flag) => (
            <div className="feedback-item" key={flag}><i>!</i><div><b>{flag}</b><span>Check this against the locked Resolution Card.</span></div></div>
          )) : <div className="feedback-item good"><i>✓</i><div><b>No reviewer flags recorded</b><span>Proceed from the locked source, evidence, and rules.</span></div></div>}
        </div>
      </div>
    </section>
  );
}

function VerdictStudio({ item, draft, loading, updateDraft, onCommit, onReveal }: {
  item: ReviewerCase;
  draft: ReviewDraft;
  loading: boolean;
  updateDraft: (id: string, updater: (draft: ReviewDraft) => ReviewDraft) => void;
  onCommit: (item: ReviewerCase, draft: ReviewDraft) => void;
  onReveal: (item: ReviewerCase, draft: ReviewDraft) => void;
}) {
  const setDraft = (updater: (draft: ReviewDraft) => ReviewDraft) => updateDraft(item.id, updater);
  const save = () => {
    const next = { ...draft, saved: true };
    saveDraftToStorage(item.id, next);
    setDraft(() => next);
  };

  return (
    <section className="card">
      <span className="kicker"><i className="dot warn" /> Verdict Studio</span>
      <h3>Submit a sealed verdict.</h3>
      <p>Choose the outcome and write the Evidence Note. Do not expect hints before you submit. After submission, the platform confirms whether the note was accepted into the settlement process.</p>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Outcome</label>
        <div className="verdict-options">
          {(["Ride", "Fade", "Invalid"] as const).map((label) => {
            const value = outcomeValue(label);
            return (
              <button key={label} className={`verdict-btn ${draft.outcome === value ? "active" : ""}`} type="button" onClick={() => setDraft((current) => ({ ...current, outcome: value }))}>
                <b>{label}</b><span>{label === "Ride" ? "Condition proven" : label === "Fade" ? "Condition not proven" : "Rules cannot settle"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>Confidence</label>
        <div className="confidence">
          {(["High", "Medium", "Low"] as const).map((label) => (
            <button key={label} className={`seg ${draft.confidence === label ? "active" : ""}`} type="button" onClick={() => setDraft((current) => ({ ...current, confidence: label }))}>{label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Evidence Note</label>
        <textarea
          value={draft.note}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          placeholder="Example: The locked source did not show the Ride condition before the deadline. I checked the timestamp at..."
        />
        <div className="hint"><span>{draft.note.length}</span> characters. A good note says the rule used, source checked, timestamp, and whether fallback applies.</div>
        <div className="meter"><i style={{ width: `${Math.min(100, Math.round(draft.note.length / 1.6))}%` }} /></div>
      </div>
      <div className="checklist">
        <CheckBox checked={draft.checks.source} title="I checked the locked source" body="Use the source from the Resolution Card unless fallback applies." onChange={(checked) => setDraft((current) => ({ ...current, checks: { ...current.checks, source: checked } }))} />
        <CheckBox checked={draft.checks.timestamp} title="I checked the valid time window" body="The evidence must fit the market deadline." onChange={(checked) => setDraft((current) => ({ ...current, checks: { ...current.checks, timestamp: checked } }))} />
        <CheckBox checked={draft.checks.rule} title="I applied the Ride/Fade/Invalid rules" body="Your note must say which rule decided the case." onChange={(checked) => setDraft((current) => ({ ...current, checks: { ...current.checks, rule: checked } }))} />
        <CheckBox checked={draft.checks.fallback} title="I considered the fallback rule" body="State whether fallback applies or not." onChange={(checked) => setDraft((current) => ({ ...current, checks: { ...current.checks, fallback: checked } }))} />
      </div>
      <div style={{ height: 10 }} />
      <div className="actions">
        <button className="btn" type="button" onClick={save}>Save draft</button>
        <button className="primary" type="button" disabled={loading || draft.revealed || (!item.canCommit && draft.submitted)} onClick={() => onCommit(item, draft)}>
          {draft.submitted ? "Commit recorded" : "Submit sealed verdict"}
        </button>
        {(draft.submitted || item.canReveal) && (
          <button className="btn" type="button" disabled={loading || draft.revealed} onClick={() => onReveal(item, draft)}>
            {draft.revealed ? "Reveal recorded" : "Reveal note"}
          </button>
        )}
      </div>
      <SubmissionStatus draft={draft} />
    </section>
  );
}

function SubmissionStatus({ draft }: { draft: ReviewDraft }) {
  if (!draft.audit) return null;
  return (
    <div className={`audit-card ${draft.audit.ok ? "pass" : "fail"}`} style={{ marginTop: 12 }}>
      <span className="kicker"><i className={`dot ${draft.audit.ok ? "good" : "bad"}`} /> Submission status</span>
      <h3>{draft.audit.ok ? "Accepted into settlement tally" : "Not accepted into settlement tally"}</h3>
      <p>{draft.audit.ok ? "Your sealed verdict was received and counted for this settlement round. Auto-payment is handled after final settlement." : "Your sealed verdict was received, but it was not counted. The reason is recorded below."}</p>
      <div className="feedback">
        {draft.audit.reasons.map((reason) => (
          <div className={`feedback-item ${draft.audit?.ok ? "good" : "bad"}`} key={reason}>
            <i>{draft.audit?.ok ? "✓" : "!"}</i>
            <div><b>{reason}</b><span>{draft.audit?.ok ? "No action needed." : "This is recorded with your settled-market history."}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsScreen({ data, detail, setDetail, range, setRange, point, setPoint, pointLocked, setPointLocked, showToast }: {
  data: ReviewerWorkbenchData;
  detail: "pending" | "paid" | "month" | "lifetime";
  setDetail: (detail: "pending" | "paid" | "month" | "lifetime") => void;
  range: "7D" | "30D" | "90D" | "Life";
  setRange: (range: "7D" | "30D" | "90D" | "Life") => void;
  point: number;
  setPoint: (point: number) => void;
  pointLocked: boolean;
  setPointLocked: (locked: boolean) => void;
  showToast: (title: string, message: string) => void;
}) {
  const points = data.earnings.chart[range] ?? [];
  const activePoint = points[Math.min(point, Math.max(0, points.length - 1))] ?? { x: "-", y: 0, cases: 0, status: "No data" };
  const selected = data.earnings.details[detail];
  return (
    <section className="screen section">
      <div className="hero">
        <span className="kicker"><i className="dot good" /> Earnings</span>
        <h2>Every reward should point back to a settled case.</h2>
        <p>Tap any amount to see what it came from. Rewards are auto-paid to the Atlas.id payout address after the settlement is final and the submission is accepted.</p>
      </div>
      <div className="grid stats">
        <EarningStat active={detail === "pending"} label="Pending" amount={data.stats.pending} body="Waiting for final settlement" onClick={() => setDetail("pending")} />
        <EarningStat active={detail === "paid"} label="Auto-paid" amount={data.stats.autoPaid} body="Sent to reviewer address" onClick={() => setDetail("paid")} />
        <EarningStat active={detail === "month"} label="This month" amount={data.stats.thisMonth} body={`${data.stats.validSubmissions} completed reviews`} onClick={() => setDetail("month")} />
        <EarningStat active={detail === "lifetime"} label="Lifetime" amount={data.stats.lifetime} body={`${data.stats.validSubmissions} valid submissions`} onClick={() => setDetail("lifetime")} />
      </div>
      <div className="split">
        <div className="card chart-card">
          <div className="case-top">
            <div><h3>Earnings over time</h3><p>Move over a point to preview it. Click or tap a point to keep it selected.</p></div>
            <div className="toolbar">
              {(["7D", "30D", "90D", "Life"] as const).map((key) => (
                <button key={key} className={`seg ${range === key ? "active" : ""}`} type="button" onClick={() => setRange(key)}>{key}</button>
              ))}
            </div>
          </div>
          <div className="chart-wrap">
            <EarningsChart
              data={points}
              active={Math.min(point, Math.max(0, points.length - 1))}
              onPick={(index) => {
                setPoint(index);
                setPointLocked(true);
              }}
              locked={pointLocked}
            />
          </div>
          <div className="chart-pick">
            <div>
              <b>{activePoint.x} payout point</b>
              <span>{activePoint.cases} settled {activePoint.cases === 1 ? "case" : "cases"}{middleDot()}{activePoint.status}{middleDot()}{pointLocked ? "Selected by click" : "Move over the chart to inspect"}</span>
            </div>
            <strong>${activePoint.y}</strong>
          </div>
          <div className="chart-legend">
            <span className="chip"><i className="dot good" /> Auto-paid</span>
            <span className="chip"><i className="dot warn" /> Pending separate</span>
            <span className="chip"><i className="dot" /> {pointLocked ? "Point locked" : "Hover/tap active"}</span>
          </div>
        </div>
        <div className="card">
          <h3>{selected.title}</h3>
          <div className="earning-detail"><div className="stat"><span>Selected amount</span><b>{selected.amount}</b><small>{selected.body}</small></div></div>
          <div className="ledger" style={{ marginTop: 12 }}>
            {selected.rows.length ? selected.rows.map((row) => (
              <button className="ledger-row clickable" type="button" key={`${row[0]}-${row[1]}`} onClick={() => showToast(row[0], `${row[1]} selected. Open the settled case receipt from history for the exact transaction.`)}>
                <div><b>{row[0]}</b><span>{row[2]}</span></div><div className="amount">{row[1]}</div>
              </button>
            )) : <EmptyState title="No earnings rows" body="No reward records exist for this earnings bucket yet." />}
          </div>
        </div>
      </div>
      <div className="card"><h3>Auto-payment rule</h3><p>Accepted submissions are paid automatically to the reviewer payout address after final settlement and reward calculation. There is no claim button and no manual withdrawal step for reviewers.</p></div>
    </section>
  );
}

function EarningStat({ active, label, amount, body, onClick }: { active: boolean; label: string; amount: string; body: string; onClick: () => void }) {
  return <button className={`card stat clickable ${active ? "active" : ""}`} type="button" onClick={onClick}><span>{label}</span><b>{amount}</b><small>{body}</small></button>;
}

function smoothPath(points: Array<{ px: number; py: number }>, yMin: number, yMax: number) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].px.toFixed(1)} ${points[0].py.toFixed(1)}`;
  const clampY = (value: number) => Math.max(yMin, Math.min(yMax, value));
  let d = `M${points[0].px.toFixed(1)} ${points[0].py.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const tension = 0.18;
    const c1x = p1.px + (p2.px - p0.px) * tension;
    const c1y = clampY(p1.py + (p2.py - p0.py) * tension);
    const c2x = p2.px - (p3.px - p1.px) * tension;
    const c2y = clampY(p2.py - (p3.py - p1.py) * tension);
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.px.toFixed(1)} ${p2.py.toFixed(1)}`;
  }
  return d;
}

function EarningsChart({ data, active, onPick, locked }: { data: EarningsPoint[]; active: number; onPick: (index: number) => void; locked: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const safe = data.length ? data : [{ x: "-", y: 0, cases: 0, status: "No data" }];
  const display = hover ?? active;
  const w = 760;
  const h = 286;
  const pad = 42;
  const fade = 54;
  const plotLeft = 18;
  const plotRight = w - 18;
  const max = Math.max(...safe.map((item) => item.y), 1) * 1.18;
  const pts = safe.map((item, index) => {
    const px = safe.length === 1 ? w / 2 : plotLeft + (index * (plotRight - plotLeft)) / (safe.length - 1);
    const py = h - pad - (item.y / max) * (h - 2 * pad);
    return { ...item, px, py, index };
  });
  const visual = [{ ...pts[0], px: -fade }, ...pts, { ...pts[pts.length - 1], px: w + fade }];
  const line = smoothPath(visual, pad - 8, h - pad);
  const area = `${line} L ${(w + fade).toFixed(1)} ${h - pad} L ${(-fade).toFixed(1)} ${h - pad} Z`;
  const activePt = pts[Math.min(display, pts.length - 1)] ?? pts[0];
  const calloutX = Math.min(Math.max(activePt.px - 68, pad), w - pad - 136);
  const calloutY = Math.max(16, activePt.py - 78);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Interactive earnings chart" onPointerLeave={() => !locked && setHover(null)}>
      <defs>
        <linearGradient id="gEarn" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--gold)" stopOpacity=".36" /><stop offset=".62" stopColor="var(--gold)" stopOpacity=".10" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></linearGradient>
        <linearGradient id="chartEdgeFade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="white" stopOpacity="0" /><stop offset=".07" stopColor="white" stopOpacity=".45" /><stop offset=".15" stopColor="white" stopOpacity="1" /><stop offset=".85" stopColor="white" stopOpacity="1" /><stop offset=".93" stopColor="white" stopOpacity=".45" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
        <mask id="chartEdgeMask" maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect x="0" y="0" width={w} height={h} fill="url(#chartEdgeFade)" /></mask>
        <filter id="chartGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g color="var(--muted)">
        {[0, .25, .5, .75, 1].map((tick) => {
          const gy = h - pad - tick * (h - 2 * pad);
          return <g key={tick}><line x1={pad} x2={w - pad} y1={gy} y2={gy} stroke="currentColor" opacity=".10" /><text x={pad - 10} y={gy + 4} textAnchor="end" fill="currentColor" opacity=".48" fontSize="11">${Math.round(max * tick)}</text></g>;
        })}
      </g>
      <g mask="url(#chartEdgeMask)"><path d={area} fill="url(#gEarn)" opacity=".98" /><path d={line} fill="none" stroke="var(--gold)" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" filter="url(#chartGlow)" /></g>
      <line className="chart-active-guide" x1={activePt.px} x2={activePt.px} y1={pad - 12} y2={h - pad} stroke="var(--gold)" strokeWidth="1.5" opacity=".35" strokeDasharray="4 5" />
      <g className="chart-focus"><circle cx={activePt.px} cy={activePt.py} r="15" fill="var(--gold)" opacity=".14" /><circle cx={activePt.px} cy={activePt.py} r="7" fill="var(--gold2)" stroke="var(--panel)" strokeWidth="3" /></g>
      <g className="chart-callout" transform={`translate(${calloutX} ${calloutY})`}><rect x="0" y="0" width="136" height="58" rx="16" fill="var(--panel)" stroke="var(--line)" /><text x="14" y="22" fill="var(--muted)" fontSize="11" fontWeight="900">{activePt.x} {middleDot()} {activePt.cases} {activePt.cases === 1 ? "case" : "cases"}</text><text x="14" y="45" fill="var(--ink)" fontSize="22" fontWeight="950">${activePt.y}</text></g>
      {pts.map((pt, index) => {
        const labelX = Math.min(Math.max(pt.px, 34), w - 34);
        const isActive = index === display;
        return (
          <g
            className="chart-point"
            key={`${pt.x}-${index}`}
            tabIndex={0}
            role="button"
            aria-label={`${pt.x} earned $${pt.y}`}
            onPointerEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            onClick={() => onPick(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPick(index);
              }
            }}
          >
            <circle className="hit" cx={pt.px} cy={pt.py} r="25" />
            <circle cx={pt.px} cy={pt.py} r={isActive ? 6 : 4.5} fill={isActive ? "var(--gold2)" : "var(--panel)"} stroke="var(--gold)" strokeWidth={isActive ? 3 : 2} />
            <text x={labelX} y={h - 12} textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="850">{pt.x}</text>
          </g>
        );
      })}
    </svg>
  );
}

function HistoryScreen({ rows }: { rows: ReviewerWorkbenchData["history"] }) {
  return (
    <section className="screen section">
      <div className="hero">
        <span className="kicker"><i className="dot" /> Settled markets</span>
        <h2>Past settlements, verdicts and payout notes.</h2>
        <p>This is the reviewer's record of completed work. Each settled market shows the final outcome, your verdict, whether your submission was accepted, and why you did or did not earn.</p>
      </div>
      {rows.length ? (
        <div className="grid queue-grid">
          {rows.map((row) => (
            <article className="settled-card" key={row.assignmentId}>
              <div className="case-top">
                <div><div className="case-title">{row.market}</div><span className="mini">{row.date}{middleDot()}Final: {row.final}{middleDot()}Your verdict: {row.mine}</span></div>
                <span className="chip"><i className={`dot ${row.audit === "Accepted" ? "good" : "bad"}`} />{row.audit}</span>
              </div>
              <p>{row.note}</p>
              <div className="meta-row"><span className="chip">Reward {row.reward}</span><span className="chip">Final {row.final}</span><span className="chip">Mine {row.mine}</span></div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No settled reviewer history" body="Finalized ProofFlow assignments for this wallet will appear here." />}
    </section>
  );
}

function HowScreen() {
  const steps = [
    ["1", "Open a case", "Choose a case from the queue. Work one case at a time so each decision stays focused."],
    ["2", "Read the locked rules", "The Resolution Card decides the market. Use the market question, source, deadline, Ride rule, Fade rule, Invalid rule and fallback rule."],
    ["3", "Check the evidence", "Review proposer evidence, challenger evidence if provided, and the locked source snapshots. If no challenger evidence exists, still check the source yourself."],
    ["4", "Submit a sealed verdict", "Choose Ride, Fade or Invalid, select confidence, and write an Evidence Note that explains source, timestamp, rule and fallback."],
    ["5", "Post-submission check", "After submission, the platform checks whether your sealed verdict can enter the settlement tally. You see accepted or not accepted, with the reason."],
    ["6", "Auto-payment", "When the market finalizes, accepted reward amounts are calculated and auto-paid to the Atlas.id payout address. There is no claim button."]
  ];
  return (
    <section className="screen section">
      <div className="hero">
        <span className="kicker"><i className="dot" /> How it works</span>
        <h2>What reviewers do, from assignment to auto-payment.</h2>
        <p>This page explains the reviewer workflow without giving outcome suggestions. Reviewers decide independently from the locked rules and evidence.</p>
      </div>
      <div className="grid">
        {steps.map((step) => <div className="reviewer-rules-step" key={step[0]}><i>{step[0]}</i><div><b>{step[1]}</b><span>{step[2]}</span></div></div>)}
      </div>
      <div className="card"><h3>What reviewers should not see</h3><p>Reviewers should not see other reviewers' verdicts before submission. They should not receive outcome suggestions. They should not use market comments, popularity or sentiment to decide a case.</p></div>
      <div className="card"><h3>What decides payment</h3><p>Payment is based on the final settlement and whether the submission was accepted into the tally. Accepted rewards are auto-paid to Atlas.id after settlement. Rejected submissions are recorded with a reason in settled-market history.</p></div>
    </section>
  );
}

function CheckBox({ checked, title, body, onChange }: { checked: boolean; title: string; body: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <div><b>{title}</b><span>{body}</span></div>
    </label>
  );
}

function ChecklistItem({ title, body }: { title: string; body: string }) {
  return <div className="check"><input type="checkbox" checked disabled readOnly /><div><b>{title}</b><span>{body}</span></div></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty"><b>{title}</b><span>{body}</span></div>;
}
