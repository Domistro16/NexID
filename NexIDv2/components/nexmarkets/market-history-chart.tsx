"use client";

import { useMemo, useState, type MouseEvent, type TouchEvent } from "react";
import { compactUsd } from "@/components/nexmarkets/market-ui";
import type { PublicMarketActivity } from "@/lib/services/marketActivityService";

type RangeKey = "1D" | "7D" | "1M" | "All";

type ChartInputPoint = {
  id: string;
  createdAt: string;
  price: number;
  volume: number;
  side: "ride" | "fade" | "current";
};

type ChartPoint = ChartInputPoint & {
  x: number;
  y: number;
  v: number;
  label: string;
};

const RANGES: RangeKey[] = ["1D", "7D", "1M", "All"];
const W = 1000;
const H = 350;
const PAD_T = 24;
const PAD_B = 32;
const CENT = "\u00a2";

function clampPrice(value: number) {
  return Math.max(0.01, Math.min(0.99, value));
}

function rangeCutoff(range: RangeKey) {
  if (range === "All") return null;
  const days = range === "1D" ? 1 : range === "7D" ? 7 : 30;
  return Date.now() - (days * 24 * 60 * 60 * 1000);
}

function chartLabel(value: string) {
  if (value === "now") return "Now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recent";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function sourcePoints(activity: PublicMarketActivity, currentPrice: number | null): ChartInputPoint[] {
  const tradePoints = activity.trades.flatMap((trade): ChartInputPoint[] => {
    if (trade.yesPrice == null || !Number.isFinite(trade.yesPrice)) return [];
    return [{
      id: trade.id,
      createdAt: trade.createdAt,
      price: clampPrice(trade.yesPrice),
      volume: trade.amount,
      side: trade.side
    }];
  });

  if (currentPrice !== null) {
    tradePoints.push({
      id: "current",
      createdAt: "now",
      price: clampPrice(currentPrice),
      volume: activity.volumeUsdc,
      side: "current"
    });
  }

  return tradePoints.sort((a, b) => {
    const aTime = a.createdAt === "now" ? Date.now() : Date.parse(a.createdAt);
    const bTime = b.createdAt === "now" ? Date.now() : Date.parse(b.createdAt);
    return aTime - bTime;
  });
}

function rangePoints(points: ChartInputPoint[], range: RangeKey) {
  const cutoff = rangeCutoff(range);
  if (cutoff === null) return points;
  const before = points.filter((point) => point.createdAt !== "now" && Date.parse(point.createdAt) < cutoff);
  const inside = points.filter((point) => point.createdAt === "now" || Date.parse(point.createdAt) >= cutoff);
  const baseline = before.at(-1);
  return baseline ? [baseline, ...inside] : inside;
}

function nx89Path(points: ChartPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) {
    const point = points[0]!;
    return `M 0 ${point.y.toFixed(2)} C 500 ${point.y.toFixed(2)}, 500 ${point.y.toFixed(2)}, 1000 ${point.y.toFixed(2)}`;
  }
  let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    const midX = prev.x + ((point.x - prev.x) * 0.56);
    d += ` C ${midX.toFixed(2)} ${prev.y.toFixed(2)}, ${midX.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  return d;
}

function buildChartPoints(points: ChartInputPoint[]) {
  const data = points.map((point) => Math.round(point.price * 100));
  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const spread = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, Math.floor(rawMin - (spread * 0.28) - 1));
  const max = Math.min(100, Math.ceil(rawMax + (spread * 0.28) + 1));
  const plotH = H - PAD_T - PAD_B;
  return points.map((point, index): ChartPoint => {
    const v = Math.round(point.price * 100);
    const x = points.length === 1 ? W : index * (W / Math.max(1, points.length - 1));
    const y = PAD_T + ((max - v) * plotH / Math.max(1, max - min));
    return {
      ...point,
      x,
      y,
      v,
      label: point.createdAt === "now" ? "Now" : chartLabel(point.createdAt)
    };
  });
}

function EmptyChart({ pendingResult }: { pendingResult: boolean }) {
  return (
    <div className="v40-empty-chart">
      <b>{pendingResult ? "Result pending." : "No market history yet."}</b>
      <span>{pendingResult ? "Verification and settlement will set the final outcome." : "Recorded trade prices will appear here once this market has activity."}</span>
    </div>
  );
}

export function MarketHistoryChart({
  price,
  pendingResult,
  activity
}: {
  price: number | null;
  status: string;
  pendingResult: boolean;
  activity: PublicMarketActivity;
}) {
  const [range, setRange] = useState<RangeKey>("7D");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ left: number; top: number } | null>(null);

  const points = useMemo(() => buildChartPoints(rangePoints(sourcePoints(activity, price), range)), [activity, price, range]);
  const path = nx89Path(points);
  const first = points[0]?.v ?? 0;
  const last = points.at(-1)?.v ?? 0;
  const move = last - first;
  const moveText = `${move >= 0 ? "+" : ""}${move.toFixed(1)}${CENT}`;
  const rawValues = points.map((point) => point.v);
  const yMax = rawValues.length ? Math.max(...rawValues) : 0;
  const yMin = rawValues.length ? Math.min(...rawValues) : 0;
  const yMarks = [yMax, Math.round((yMax + yMin) / 2), yMin];
  const activePoint = hoverIndex === null ? null : points[hoverIndex] ?? null;
  const previousPoint = hoverIndex === null ? null : points[Math.max(0, hoverIndex - 1)] ?? null;
  const hoverMove = activePoint && previousPoint && hoverIndex ? activePoint.v - previousPoint.v : 0;
  const hoverMoveText = hoverIndex ? `${hoverMove >= 0 ? "+" : ""}${hoverMove.toFixed(1)}${CENT}` : "-";

  function showHover(event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) {
    if (!points.length) return;
    let clientX: number | null = null;
    if ("touches" in event) {
      clientX = event.touches[0]?.clientX ?? null;
      if (event.cancelable) event.preventDefault();
    } else {
      clientX = event.clientX;
    }
    if (clientX === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = (clientX - rect.left) / Math.max(1, rect.width);
    const index = Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1))));
    const point = points[index]!;
    const x = point.x / W * rect.width;
    const y = point.y / H * rect.height;
    setHoverIndex(index);
    setHoverPoint({
      left: Math.min(Math.max(x, 88), rect.width - 88),
      top: Math.min(Math.max(y, 60), rect.height - 18)
    });
  }

  return (
    <section className="v40-panel v40-chart-panel">
      <div className="v40-chart-head">
        <div>
          <h3>Market history</h3>
          <p>Hover or tap the line for price and volume.</p>
        </div>
        <div className="v40-tabbar">
          {RANGES.map((item) => (
            <button className={range === item ? "active" : ""} key={item} type="button" onClick={() => { setRange(item); setHoverIndex(null); setHoverPoint(null); }}>
              {item}
            </button>
          ))}
        </div>
      </div>
      {!points.length ? <EmptyChart pendingResult={pendingResult} /> : (
        <div
          className="nx89-chart"
          onClick={showHover}
          onMouseLeave={() => { setHoverIndex(null); setHoverPoint(null); }}
          onMouseMove={showHover}
          onTouchMove={showHover}
          onTouchStart={showHover}
        >
          <div className="nx89-live"><span>YES</span><b>{last}{CENT}</b><em className={move >= 0 ? "up" : "down"}>{moveText}</em></div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Market price history">
            <defs>
              <linearGradient id="nx89Line" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#ffd36b" />
                <stop offset=".52" stopColor="#ffb000" />
                <stop offset="1" stopColor="#ffe4b4" />
              </linearGradient>
            </defs>
            <g className="nx89-grid">
              {[0.25, 0.5, 0.75].map((tick) => (
                <line x1="0" x2={W} y1={PAD_T + (tick * (H - PAD_T - PAD_B))} y2={PAD_T + (tick * (H - PAD_T - PAD_B))} key={tick} />
              ))}
            </g>
            <path className="nx89-line-shadow" d={path} />
            <path className="nx89-line" d={path} />
            <circle className="nx89-end" cx={points.at(-1)!.x} cy={points.at(-1)!.y} r="5.5" />
            {points.map((point, index) => (
              <circle className={`v40-chart-dot nx89-hit ${hoverIndex === index ? "active" : ""}`} cx={point.x} cy={point.y} r="7" key={point.id} />
            ))}
            <g className="nx89-axis">
              {yMarks.map((value, index) => (
                <text x={W - 8} y={PAD_T + (index * (H - PAD_T - PAD_B) / 2) + 4} textAnchor="end" key={`${value}-${index}`}>{Math.round(value)}{CENT}</text>
              ))}
            </g>
          </svg>
          <div className="v40-cross nx89-cross" style={{ left: activePoint ? `${activePoint.x / W * 100}%` : 0, opacity: activePoint ? 1 : 0 }} />
          <div className="v40-tip nx89-tip" style={{ left: hoverPoint?.left ?? 0, top: hoverPoint?.top ?? 0, opacity: activePoint ? 1 : 0 }}>
            {activePoint ? (
              <>
                <b>{activePoint.v}{CENT} YES</b>
                <span>{activePoint.label} - {compactUsd(activePoint.volume)} volume</span>
                <span className={hoverMove >= 0 ? "up" : "down"}>Move {hoverMoveText}</span>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
