"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBoardsApi, fetchDashboardApi } from "@/lib/services/nexid-client";
import type { BoardEntry, BoardKey, DashboardSnapshot } from "@/lib/types/nexid";
import { emptyBoards } from "@/components/nexid/shared/utils";

type FrameKey = "day" | "week" | "month" | "all";
type BoardTabKey = "overall" | "riders" | "faders" | "creators" | "week";

type EdgeRow = {
  id: string;
  source: BoardEntry | null;
  name: string;
  username: string;
  wallet: string;
  rank: number;
  rankLabel: string;
  score: number;
  scoreLabel: string;
  move: string;
  role: string;
  reason: string;
  avatar: string;
  lane: string;
  beat: string;
  gap?: string;
};

type ModalState = {
  id: string;
  type: "rank" | "myedge";
};

type CardData = {
  headline: string;
  subhead: string;
  meta: string;
  why: string;
  rank: string;
  move: string;
  score: string;
  name: string;
  username: string;
  role: string;
  timeframe: string;
};

const EM_DASH = "\u2014";
const DOT = "\u00b7";

const frames: Record<FrameKey, { label: string; noun: string }> = {
  day: { label: "1D", noun: "today" },
  week: { label: "1W", noun: "this week" },
  month: { label: "1M", noun: "this month" },
  all: { label: "Lifetime", noun: "all time" }
};

const boardTabs: Array<[BoardTabKey, string]> = [
  ["overall", "Overall"],
  ["riders", "Riders"],
  ["faders", "Faders"],
  ["creators", "Creators"],
  ["week", "Movers"]
];

function boardTitle(key?: BoardKey | null) {
  return {
    faders: "Top Fader",
    riders: "Top Rider",
    receipts: "Receipt Leader",
    lowcap: "Low-Capital Signal",
    global: "Season Edge",
    regional: "Regional Edge",
    ai: "AI Agent",
    base: "Base Edge",
    solana: "Solana Edge",
    rwa: "RWA Edge"
  }[key ?? "global"];
}

function parseScore(row: BoardEntry) {
  if (typeof row.score === "number" && Number.isFinite(row.score)) return row.score;
  if (typeof row.edgeScore === "number" && Number.isFinite(row.edgeScore)) return row.edgeScore;
  const parsed = Number(String(row.points).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function normalizeMove(value?: string | null) {
  const move = String(value ?? "0").trim();
  if (!move || move === "0") return "0";
  if (move.toLowerCase() === "new") return "NEW";
  return move.startsWith("+") || move.startsWith("-") ? move : `+${move}`;
}

function moveAmount(move: string) {
  if (move === "NEW") return 999;
  const parsed = Number(move.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function classForMove(move: string) {
  if (move === "NEW") return "edge65-new";
  if (move.startsWith("-")) return "edge65-down";
  if (move === "0" || move === EM_DASH) return "";
  return "edge65-up";
}

function withoutFinalPeriod(value: string) {
  return value.trim().replace(/[.。]+$/u, "");
}

function withFinalPeriod(value: string) {
  const clean = value.trim();
  return clean && !/[.!?]$/u.test(clean) ? `${clean}.` : clean;
}

function rankMovementLine(row: BoardEntry, move: string) {
  if (move === "NEW") return "Entered this board from live ranked activity.";
  if (move.startsWith("+")) return `Up ${move.slice(1)} place${move.slice(1) === "1" ? "" : "s"} since the previous board snapshot.`;
  if (move.startsWith("-")) return `Down ${move.slice(1)} place${move.slice(1) === "1" ? "" : "s"} since the previous board snapshot.`;
  if (row.receiptId) return "Holding rank with a live receipt on the board.";
  return "Holding rank in the current board snapshot.";
}

function fallbackUsername(name: string) {
  const clean = name.toLowerCase().replace(/\.id$/i, "").replace(/[^a-z0-9-]/g, "");
  return clean ? `@${clean}` : "@tracked";
}

function avatarFor(row: BoardEntry) {
  const source = row.avatar || row.identity || row.username || row.wallet || "N";
  return source.replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "N";
}

function toEdgeRow(row: BoardEntry): EdgeRow {
  const score = parseScore(row);
  const move = normalizeMove(row.movement);
  const reason = row.whyRanked || row.thesis || row.result || "Ranked by live NexMarkets activity.";

  return {
    id: row.id,
    source: row,
    name: row.identity,
    username: row.username || fallbackUsername(row.identity),
    wallet: row.wallet || "tracked",
    rank: row.rankNumber,
    rankLabel: row.rank || `#${row.rankNumber}`,
    score,
    scoreLabel: score ? score.toLocaleString() : row.points,
    move,
    role: row.edgeRole || boardTitle(row.boardKey),
    reason,
    avatar: avatarFor(row),
    lane: row.lane || row.boardKey || "overall",
    beat: rankMovementLine(row, move)
  };
}

function uniqueRows(rows: BoardEntry[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.identity}:${row.receiptId ?? row.positionId ?? row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowsForTab(boards: Record<BoardKey, BoardEntry[]>, tab: BoardTabKey) {
  if (tab === "overall") return boards.global;
  if (tab === "riders") return boards.riders;
  if (tab === "faders") return boards.faders;
  if (tab === "creators") {
    return uniqueRows([...boards.receipts, ...boards.global]).filter((row) => {
      const haystack = `${row.edgeRole ?? ""} ${row.whyRanked ?? ""} ${row.thesis} ${row.result} ${row.category ?? ""}`.toLowerCase();
      return haystack.includes("creator") || haystack.includes("launch") || haystack.includes("receipt");
    });
  }
  return uniqueRows(Object.values(boards).flat())
    .filter((row) => normalizeMove(row.movement) !== "0")
    .sort((a, b) => moveAmount(normalizeMove(b.movement)) - moveAmount(normalizeMove(a.movement)));
}

function searchRows(rows: EdgeRow[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => `${row.name} ${row.username} ${row.wallet} ${row.reason} ${row.role}`.toLowerCase().includes(q));
}

function decorateTop(rows: EdgeRow[]) {
  const top = rows.slice(0, 3).map((row, index, source) => {
    const nextScore = source[index + 1]?.score ?? 0;
    const leaderScore = source[0]?.score ?? row.score;
    const gap = index === 0
      ? nextScore ? `Leading by ${compactNumber(Math.max(0, row.score - nextScore))} pts` : "Current board leader"
      : `${compactNumber(Math.max(0, leaderScore - row.score))} pts from #1`;
    return { ...row, gap };
  });

  return {
    leader: top[0] ?? null,
    threat: top[1] ?? null,
    climber: top[2] ?? null
  };
}

function currentUserName(snapshot: DashboardSnapshot | null) {
  const user = snapshot?.user;
  if (!user) return null;
  return user.primaryDomainName || user.primaryIdName || user.displayName || user.walletAddress;
}

function myEdgeRow(snapshot: DashboardSnapshot | null, allRows: EdgeRow[]): EdgeRow | null {
  const user = snapshot?.user;
  if (!user) return null;
  const identityCandidates = [
    user.primaryDomainName,
    user.primaryIdName,
    user.displayName,
    user.walletAddress
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const ranked = allRows.find((row) => identityCandidates.some((name) => `${row.name} ${row.wallet}`.toLowerCase().includes(name)));
  if (ranked) return ranked;

  return {
    id: "me",
    source: null,
    name: currentUserName(snapshot) ?? "Connected wallet",
    username: user.primaryIdName ? `@${user.primaryIdName.replace(/\.id$/i, "")}` : "@wallet",
    wallet: user.walletAddress,
    rank: 0,
    rankLabel: "Unranked",
    score: snapshot.points.total,
    scoreLabel: snapshot.points.total.toLocaleString(),
    move: "0",
    role: snapshot.rewards.level,
    reason: `${snapshot.points.total.toLocaleString()} points recorded. Earn qualifying trades, launches, and receipts to enter the EdgeBoard.`,
    avatar: (user.primaryIdName || user.displayName || user.walletAddress || "Y").replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "Y",
    lane: "overall",
    beat: "Not ranked on the current board snapshot yet."
  };
}

function drawRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient | null, stroke?: string | null) {
  drawRound(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function cardFont(size: number, weight = "800") {
  return `${weight} ${size}px Georgia, Cambria, 'Times New Roman', serif`;
}

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = `${line} ${word}`.trim();
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize: number, weight = "900") {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = cardFont(size, weight);
    if (ctx.measureText(String(text)).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}\u2026`).width > maxWidth) value = value.slice(0, -1);
  return `${value}\u2026`;
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const lines = wrapCanvas(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.14, -size * 0.14, size, 0);
  ctx.quadraticCurveTo(size * 0.14, size * 0.14, 0, size);
  ctx.quadraticCurveTo(-size * 0.14, size * 0.14, -size, 0);
  ctx.quadraticCurveTo(-size * 0.14, -size * 0.14, 0, -size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function toCardData(row: EdgeRow, frameKey: FrameKey): CardData {
  return {
    headline: row.name,
    subhead: row.rank ? `Ranked ${row.rankLabel} this ${frames[frameKey].label.toLowerCase()}.` : "Not ranked on the current board.",
    meta: [row.role, row.beat, row.gap].filter(Boolean).join(` ${DOT} `),
    why: row.reason,
    rank: row.rank ? row.rankLabel : "NR",
    move: row.move,
    score: row.scoreLabel,
    name: row.name,
    username: row.username,
    role: row.role,
    timeframe: frames[frameKey].label
  };
}

function drawEdgeCard(canvas: HTMLCanvasElement, data: CardData) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const M = 54;
  const leftX = 70;
  const leftY = 146;
  const leftW = 286;
  const leftH = 590;
  const rightX = 408;
  const rightW = W - rightX - 68;
  const statGap = 18;
  const statW = (rightW - statGap * 2) / 3;
  const footerY = 842;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#090705");
  bg.addColorStop(0.48, "#110e0c");
  bg.addColorStop(1, "#070604");
  fillRound(ctx, 0, 0, W, H, 64, bg);

  ctx.save();
  drawRound(ctx, 0, 0, W, H, 64);
  ctx.clip();
  const glowTop = ctx.createRadialGradient(W * 0.86, H * 0.08, 10, W * 0.86, H * 0.08, W * 0.42);
  glowTop.addColorStop(0, "rgba(255,176,0,.16)");
  glowTop.addColorStop(0.45, "rgba(255,176,0,.052)");
  glowTop.addColorStop(1, "rgba(255,176,0,0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#8f6a31";
  for (let x = 34; x < W; x += 78) {
    for (let y = 36; y < H; y += 78) {
      ctx.beginPath();
      ctx.arc(x, y, 1.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.lineWidth = 2;
  fillRound(ctx, 24, 24, W - 48, H - 48, 54, null, "rgba(255,186,84,.40)");
  ctx.lineWidth = 1;
  fillRound(ctx, 38, 38, W - 76, H - 76, 46, null, "rgba(255,255,255,.07)");
  fillRound(ctx, M, 54, 244, 58, 29, "rgba(255,176,0,.055)", "rgba(255,186,84,.22)");
  ctx.fillStyle = "#f2d189";
  ctx.font = cardFont(32, "800");
  ctx.fillText("NexID", M + 28, 95);

  const slabFill = ctx.createLinearGradient(leftX, leftY, leftX + leftW, leftY + leftH);
  slabFill.addColorStop(0, "rgba(18,16,14,.96)");
  slabFill.addColorStop(1, "rgba(8,7,6,.98)");
  fillRound(ctx, leftX, leftY, leftW, leftH, 36, slabFill, "rgba(255,189,87,.18)");
  fillRound(ctx, leftX + 8, leftY + 8, leftW - 16, leftH - 16, 30, null, "rgba(255,255,255,.055)");

  ctx.fillStyle = "#d2ac62";
  ctx.font = cardFont(18, "800");
  ctx.fillText("RANK", leftX + 36, leftY + 60);
  const rankGrad = ctx.createLinearGradient(leftX + 34, leftY + 100, leftX + leftW - 34, leftY + 310);
  rankGrad.addColorStop(0, "#fff4da");
  rankGrad.addColorStop(0.54, "#f7d78b");
  rankGrad.addColorStop(1, "#dda62a");
  ctx.fillStyle = rankGrad;
  const rankSize = fitFont(ctx, data.rank, leftW - 70, 168, 72, "900");
  ctx.font = cardFont(rankSize, "900");
  const rankW = ctx.measureText(data.rank).width;
  ctx.fillText(data.rank, leftX + (leftW - rankW) / 2, leftY + 184);

  ctx.strokeStyle = "rgba(255,195,98,.28)";
  ctx.beginPath();
  ctx.moveTo(leftX + 38, leftY + 316);
  ctx.lineTo(leftX + 108, leftY + 316);
  ctx.moveTo(leftX + leftW - 108, leftY + 316);
  ctx.lineTo(leftX + leftW - 38, leftY + 316);
  ctx.stroke();
  drawSpark(ctx, leftX + leftW / 2, leftY + 316, 10, "#efcb78");

  ctx.fillStyle = "#fff8ee";
  ctx.font = cardFont(33, "800");
  ctx.fillText(ellipsis(ctx, data.name, leftW - 72), leftX + 36, leftY + 392);
  ctx.fillStyle = "#918171";
  ctx.font = cardFont(20, "700");
  ctx.fillText(ellipsis(ctx, data.username, leftW - 72), leftX + 36, leftY + 434);
  ctx.fillStyle = "#c9a35f";
  ctx.font = cardFont(16, "800");
  ctx.fillText("MOVE", leftX + 36, leftY + 560);
  ctx.fillStyle = data.move.startsWith("+") ? "#63d392" : data.move.startsWith("-") ? "#ed7d7d" : "#ffd36b";
  ctx.font = cardFont(54, "900");
  ctx.fillText(String(data.move), leftX + 36, leftY + 622);

  ctx.fillStyle = "#fff9ef";
  let nameSize = 84;
  while (nameSize > 58) {
    ctx.font = cardFont(nameSize, "900");
    if (wrapCanvas(ctx, data.headline, rightW).length <= 2) break;
    nameSize -= 2;
  }
  ctx.font = cardFont(nameSize, "900");
  let y = drawWrapped(ctx, data.headline, rightX, 194, rightW, nameSize * 0.92, 2) + 14;
  ctx.fillStyle = "#efddbe";
  const subSize = fitFont(ctx, data.subhead, rightW, 48, 34, "900");
  ctx.font = cardFont(subSize, "900");
  y = drawWrapped(ctx, data.subhead, rightX, y, rightW, subSize * 0.96, 1) + 18;
  ctx.fillStyle = "#c6b79f";
  ctx.font = cardFont(27, "600");
  y = drawWrapped(ctx, data.meta, rightX, y, rightW - 8, 36, 2) + 18;

  ctx.font = cardFont(16, "800");
  const roleText = data.role.toUpperCase();
  const chipW = Math.min(ctx.measureText(roleText).width + 76, rightW * 0.58);
  fillRound(ctx, rightX, y, chipW, 46, 23, "rgba(255,176,0,.04)", "rgba(255,190,89,.30)");
  drawSpark(ctx, rightX + 28, y + 23, 9, "#d8b262");
  ctx.fillStyle = "#d8b262";
  ctx.fillText(ellipsis(ctx, roleText, chipW - 72), rightX + 50, y + 31);
  y += 76;

  fillRound(ctx, rightX, y, rightW, 156, 28, "rgba(255,255,255,.028)", "rgba(255,195,98,.20)");
  ctx.fillStyle = "#caa45f";
  ctx.font = cardFont(14, "800");
  ctx.fillText("THE EDGE", rightX + 36, y + 40);
  ctx.fillStyle = "#fff9ef";
  const whySize = fitFont(ctx, data.why, rightW - 72, 28, 22, "800");
  ctx.font = cardFont(whySize, "800");
  drawWrapped(ctx, data.why, rightX + 36, y + 96, rightW - 72, 34, 2);
  y += 178;

  [
    ["TIMEFRAME", data.timeframe],
    ["MOVE", String(data.move)],
    ["SCORE", data.score]
  ].forEach(([label, value], index) => {
    const x = rightX + index * (statW + statGap);
    fillRound(ctx, x, y, statW, 126, 24, "rgba(255,255,255,.028)", "rgba(255,195,98,.22)");
    drawSpark(ctx, x + 44, y + 58, 8, "#d7b162");
    ctx.fillStyle = "#caa45f";
    ctx.font = cardFont(14, "800");
    ctx.fillText(label, x + 84, y + 56);
    ctx.fillStyle = label === "MOVE" && value.startsWith("+") ? "#63d392" : label === "MOVE" && value.startsWith("-") ? "#ed7d7d" : "#fff9ef";
    const valSize = fitFont(ctx, value, statW - 92, 34, 22, "900");
    ctx.font = cardFont(valSize, "900");
    ctx.fillText(value, x + 84, y + 102);
  });

  ctx.strokeStyle = "rgba(255,195,98,.20)";
  ctx.beginPath();
  ctx.moveTo(M, footerY);
  ctx.lineTo(W / 2 - 28, footerY);
  ctx.moveTo(W / 2 + 28, footerY);
  ctx.lineTo(W - M, footerY);
  ctx.stroke();
  drawSpark(ctx, W / 2, footerY, 12, "#efcb78");
}

export function BoardsPageClient() {
  const [frameKey, setFrameKey] = useState<FrameKey>("week");
  const [activeTab, setActiveTab] = useState<BoardTabKey>("overall");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [boards, setBoards] = useState<Record<BoardKey, BoardEntry[]>>(emptyBoards);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showMobileCapsule, setShowMobileCapsule] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      fetchBoardsApi().catch(() => emptyBoards),
      fetchDashboardApi().catch(() => null)
    ]).then(([nextBoards, nextDashboard]) => {
      if (!mounted) return;
      setBoards(nextBoards);
      setDashboard(nextDashboard);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeRows = useMemo(() => searchRows(rowsForTab(boards, activeTab).map(toEdgeRow), query), [activeTab, boards, query]);
  const allEdgeRows = useMemo(() => uniqueRows(Object.values(boards).flat()).map(toEdgeRow), [boards]);
  const topRows = useMemo(() => decorateTop((boards.global.length ? boards.global : uniqueRows(Object.values(boards).flat())).map(toEdgeRow)), [boards]);
  const me = useMemo(() => myEdgeRow(dashboard, allEdgeRows), [allEdgeRows, dashboard]);
  const timeframe = frames[frameKey];
  const maxPage = Math.max(1, Math.ceil(activeRows.length / 15));
  const safePage = Math.min(Math.max(1, page), maxPage);
  const pageRows = activeRows.slice((safePage - 1) * 15, safePage * 15);
  const start = activeRows.length ? (safePage - 1) * 15 + 1 : 0;
  const end = Math.min(safePage * 15, activeRows.length);
  const totalScore = activeRows.reduce((sum, row) => sum + row.score, 0);
  const receiptCount = uniqueRows(Object.values(boards).flat()).filter((row) => row.receiptId).length;
  const selectedRow = modal?.id === "me" ? me : allEdgeRows.find((row) => row.id === modal?.id) ?? activeRows.find((row) => row.id === modal?.id) ?? null;
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const sync = () => setShowMobileCapsule(window.innerWidth <= 720 && window.scrollY > 360);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    if (modal && selectedRow && canvasRef.current) drawEdgeCard(canvasRef.current, toCardData(selectedRow, frameKey));
  }, [frameKey, modal, selectedRow]);

  function chooseFrame(key: FrameKey) {
    setFrameKey(key);
    setPage(1);
  }

  function chooseTab(key: BoardTabKey) {
    setActiveTab(key);
    setPage(1);
  }

  function search(value: string) {
    setQuery(value);
    setPage(1);
  }

  function openCard(id: string, type: ModalState["type"] = "rank") {
    setModal({ id, type });
  }

  function copyLink() {
    void navigator.clipboard?.writeText?.(window.location.href);
  }

  function shareX() {
    const text = encodeURIComponent("My NexMarkets EdgeBoard card is live.");
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "noopener,noreferrer");
  }

  function downloadCard() {
    const canvas = canvasRef.current;
    if (!canvas || !selectedRow) return;
    drawEdgeCard(canvas, toCardData(selectedRow, frameKey));
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexmarkets-edgeboard-card.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 700);
    }, "image/png");
  }

  const FrameTabs = () => (
    <div className="edge65-frame-tabs">
      {Object.entries(frames).map(([key, value]) => (
        <button key={key} className={frameKey === key ? "active" : ""} onClick={() => chooseFrame(key as FrameKey)} type="button">
          {value.label}
        </button>
      ))}
    </div>
  );

  const BoardTabs = () => (
    <nav className="edge65-board-tabs">
      {boardTabs.map(([key, label]) => (
        <button key={key} className={activeTab === key ? "active" : ""} onClick={() => chooseTab(key)} type="button">
          {label}
        </button>
      ))}
    </nav>
  );

  const SearchBox = ({ id }: { id: string }) => (
    <div className="edge65-search">
      <input id={id} value={query} placeholder="Search .id, @username, or wallet" onChange={(event) => search(event.target.value)} />
      <button className="primary" onClick={() => search(query)} type="button">
        Search
      </button>
    </div>
  );

  const Pulse = () => (
    <div className="edge65-pulse">
      <div>
        <span>{timeframe.label} score</span>
        <b>{compactNumber(totalScore)}</b>
      </div>
      <div>
        <span>Top 100</span>
        <b>{activeRows.length}</b>
      </div>
      <div>
        <span>Receipts</span>
        <b>{receiptCount}</b>
      </div>
      <div>
        <span>Reset</span>
        <b>Live</b>
      </div>
    </div>
  );

  const RaceCard = ({ row, label, rank }: { row: EdgeRow; label: string; rank: number }) => {
    const isLeader = rank === 1;
    const line = withFinalPeriod([row.beat, row.gap, rank === 2 ? "Chasing #1" : ""].filter(Boolean).join(" "));
    return (
      <article className={`edge65-race-card ${isLeader ? "leader" : ""} edge65-reveal`}>
        <div className="edge65-line">
          <span className="edge65-rank-badge">{label}</span>
          <span className={`${classForMove(row.move)} edge65-move`}>{row.move}</span>
        </div>
        <div>
          <div className="edge65-race-rank">{row.rankLabel}</div>
          <h3>{row.name}</h3>
          <p>{row.role} {DOT} {withFinalPeriod(withoutFinalPeriod(row.reason))}</p>
        </div>
        <div className="edge65-race-metrics">
          <div>
            <span>Score</span>
            <b>{row.scoreLabel}</b>
          </div>
          <div>
            <span>Move</span>
            <b className={classForMove(row.move)}>{row.move}</b>
          </div>
        </div>
        <div className="edge65-chase">{line}</div>
        <div className="edge65-actions">
          <button className="btn" onClick={() => openCard(row.id, "rank")} type="button">View</button>
          <button className="primary" onClick={() => openCard(row.id, "rank")} type="button">Share</button>
        </div>
      </article>
    );
  };

  return (
    <section id="boards" className="view active">
      <section className="edge65">
        <section className="edge65-hero edge65-reveal">
          <div>
            <span className="edge65-kicker gold"><i className="edge65-dot" /> NexMarkets EdgeBoard</span>
            <h1>Where do you rank?</h1>
            <p>The Top 100 names on NexMarkets, ranked by trades, launches and settled receipts that moved the board.</p>
            <div className="edge65-meta">
              <span className="edge65-pill">{timeframe.label}</span>
              <span className="edge65-pill">Top 100 only</span>
              <span className="edge65-pill">Rewards live</span>
            </div>
          </div>
          <aside className="edge65-panel">
            <div>
              <h3>Find a name.</h3>
              <p>Search by .id, username or wallet.</p>
            </div>
            <FrameTabs />
            <SearchBox id="edge65HeroSearch" />
            <Pulse />
          </aside>
        </section>

        <div className="edge65-layout">
          <main className="edge65-main">
            <section>
              <div className="edge65-section-title">
                <div>
                  <h2>Top of the board.</h2>
                  <p>The chase at a glance: who leads, who is close, who is climbing.</p>
                </div>
                <span className="edge65-pill gold">{timeframe.label} view</span>
              </div>
              {topRows.leader ? (
                <div className="edge65-race-row">
                  {topRows.threat ? <RaceCard row={topRows.threat} label="Closest Threat" rank={2} /> : null}
                  <RaceCard row={topRows.leader} label="Board Leader" rank={1} />
                  {topRows.climber ? <RaceCard row={topRows.climber} label="Fastest Climber" rank={3} /> : null}
                </div>
              ) : (
                <div className="edge65-empty">{loading ? "Loading EdgeBoard data." : "No ranked EdgeBoard entries yet."}</div>
              )}
            </section>

            <section className="edge65-filter-shell">
              <div className="edge65-section-title" style={{ margin: 0 }}>
                <div>
                  <h2>Top 100.</h2>
                  <p>
                    {normalizedQuery ? (
                      <>Results for {"\u201c"}{normalizedQuery}{"\u201d"}.</>
                    ) : (
                      `${timeframe.label} rankings. Search or filter the board.`
                    )}
                  </p>
                </div>
              </div>
              <BoardTabs />
              <div className="edge65-board">
                <div className="edge65-board-head">
                  <span>Rank</span>
                  <span>Name</span>
                  <span>Why ranked</span>
                  <span>Score</span>
                  <span />
                </div>
                {pageRows.length ? (
                  pageRows.map((row) => (
                    <article className="edge65-row edge65-reveal" key={row.id}>
                      <div className="edge65-rankcell">
                        <span className="edge65-ranknum">{row.rankLabel}</span>
                        <b className={classForMove(row.move)}>{row.move}</b>
                      </div>
                      <div className="edge65-user">
                        <div className="edge65-avatar">{row.avatar}</div>
                        <div>
                          <b>{row.name}</b>
                          <span>{row.username} {DOT} {row.wallet}</span>
                        </div>
                      </div>
                      <div className="edge65-cell">
                        <b>{row.reason}</b>
                        <span>Why ranked</span>
                      </div>
                      <div className="edge65-cell">
                        <b>{row.scoreLabel}</b>
                        <span>Score</span>
                      </div>
                      <div className="edge65-row-actions">
                        <button className="btn" onClick={() => openCard(row.id, "rank")} type="button">View</button>
                        <button className="primary" onClick={() => openCard(row.id, "rank")} type="button">Share</button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="edge65-empty">{loading ? "Loading ranked entries." : "No Top 100 name matched that board or search."}</div>
                )}
                <div className="edge65-pagination">
                  <span className="edge65-page-status">Showing {start}-{end} of {activeRows.length}</span>
                  <div className="edge65-page-buttons">
                    <button className="btn" disabled={safePage === 1} onClick={() => setPage(1)} title="First" type="button">{"\u00ab"}</button>
                    <button className="btn" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} title="Back" type="button">{"\u2039"}</button>
                    <button className="btn" disabled={safePage === maxPage} onClick={() => setPage((current) => Math.min(maxPage, current + 1))} title="Next" type="button">{"\u203a"}</button>
                    <button className="btn" disabled={safePage === maxPage} onClick={() => setPage(maxPage)} title="Last" type="button">{"\u00bb"}</button>
                  </div>
                </div>
              </div>
            </section>
          </main>

          <aside className="edge65-side">
            <section className="edge65-me edge65-reveal">
              <span className="edge65-pill gold"><i className="edge65-dot" /> My Edge</span>
              <h3>{me ? `${me.rank ? `You're ${me.rankLabel}.` : "You're unranked."}` : "No wallet connected."}</h3>
              <p>{me ? me.reason : "Connect a wallet or mint a .id to build rank from trades, launches, and receipts."}</p>
              <div className="edge65-mini-grid" style={{ marginTop: 16 }}>
                <div className="edge65-mini"><span>Score</span><b>{me?.scoreLabel ?? "0"}</b></div>
                <div className="edge65-mini"><span>{timeframe.label} move</span><b className={classForMove(me?.move ?? "0")}>{me?.move ?? "0"}</b></div>
                <div className="edge65-mini"><span>Why ranked</span><b>{me?.reason ?? "No ranked activity yet"}</b></div>
                <div className="edge65-mini"><span>Rewards</span><b>{dashboard ? `$${Math.round(dashboard.claimableBalance.totalAvailableUsd || dashboard.claimableBalance.totalLockedUsd)} ${dashboard.claimableBalance.totalAvailableUsd > 0 ? "ready" : "reserved"}` : "$0 ready"}</b></div>
              </div>
              <div className="edge65-next">{me?.beat ?? "No EdgeBoard snapshot for this wallet yet."}</div>
              <div className="edge65-actions" style={{ marginTop: 14 }}>
                <button className="primary" disabled={!me} onClick={() => openCard("me", "myedge")} type="button">Share my card</button>
                <button className="btn" onClick={() => { window.location.href = "/dashboard"; }} type="button">Dashboard</button>
              </div>
            </section>
            <section className="edge65-side-card edge65-reveal">
              <span className="edge65-pill">Next jump</span>
              <h3>{me?.rank ? `Rank ${Math.max(1, me.rank - 1)} is close.` : "Earn a first rank."}</h3>
              <p>{me?.rank ? "One clean settlement can move you past the next name." : "A qualifying trade, launch, or receipt can put you on the board."}</p>
            </section>
          </aside>
        </div>

        <button className={`edge65-mobile-capsule ${showMobileCapsule ? "show" : ""}`} id="edge65MobileCapsule" onClick={() => setSheetOpen(true)} type="button">
          <div>
            <strong>{timeframe.label} {DOT} Top 100</strong>
            <span>{normalizedQuery || "Search / filters"}</span>
          </div>
          <span className="edge65-pill gold">Open</span>
        </button>

        <div className={`edge65-sheet ${sheetOpen ? "show" : ""}`} id="edge65Sheet" onClick={(event) => { if (event.currentTarget === event.target) setSheetOpen(false); }}>
          <div className="edge65-sheet-card">
            <div className="edge65-sheet-handle" />
            <div className="edge65-sheet-head">
              <div>
                <h3>Board controls</h3>
                <p style={{ color: "var(--muted)", margin: "5px 0 0", lineHeight: 1.35 }}>Search, switch timeframe, or change board view.</p>
              </div>
              <button className="btn" onClick={() => setSheetOpen(false)} type="button">Close</button>
            </div>
            <SearchBox id="edge65SheetSearch" />
            <FrameTabs />
            <BoardTabs />
            <button className="primary" onClick={() => setSheetOpen(false)} type="button">Done</button>
          </div>
        </div>

        {modal && selectedRow ? (
          <div className="edge65-modal" onClick={(event) => { if (event.currentTarget === event.target) setModal(null); }}>
            <div className="edge65-share-shell">
              <section className="edge65-canvas-wrap">
                <canvas ref={canvasRef} id="edge65CardCanvas" className="edge65-card-canvas" width={1400} height={900} />
              </section>
              <aside className="edge65-share-side">
                <div>
                  <span className="edge65-pill gold">NexID card</span>
                  <h3>Made to share.</h3>
                  <p>A cleaner way to show where you rank.</p>
                </div>
                <div className="edge65-share-actions">
                  <button className="primary" onClick={shareX} type="button">Share on X</button>
                  <button className="btn" onClick={downloadCard} type="button">Download PNG</button>
                  <button className="btn" onClick={copyLink} type="button">Copy link</button>
                  <button className="btn" onClick={() => setModal(null)} type="button">Close</button>
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
