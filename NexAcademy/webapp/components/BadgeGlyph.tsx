"use client";

import { type BadgeType } from "@prisma/client";

/**
 * SVG glyph icons for each badge type.
 * Designed to render inline at small sizes (16–20px) next to .id domains.
 */

const GLYPH_PATHS: Record<BadgeType, { path: string; viewBox: string; fill?: string }> = {
  VERIFIED: {
    viewBox: "0 0 20 20",
    path: "M10 1l2.5 4.5L17.5 7l-3.5 3.7.6 5.3L10 13.5 5.4 16l.6-5.3L2.5 7l5-1.5L10 1z",
  },
  CONSISTENT: {
    viewBox: "0 0 28 20",
    path: "M7 1l2 3.6L13 6l-2.8 3 .5 4.2L7 11.2 3.3 13.2l.5-4.2L1 6l4-1.4L7 1z M21 1l2 3.6L27 6l-2.8 3 .5 4.2L21 11.2 17.3 13.2l.5-4.2L15 6l4-1.4L21 1z",
  },
  RIGOROUS: {
    viewBox: "0 0 36 20",
    path: "M7 1l2 3.6L13 6l-2.8 3 .5 4.2L7 11.2 3.3 13.2l.5-4.2L1 6l4-1.4L7 1z M18 1l2 3.6L24 6l-2.8 3 .5 4.2L18 11.2 14.3 13.2l.5-4.2L12 6l4-1.4L18 1z M29 1l2 3.6L35 6l-2.8 3 .5 4.2L29 11.2 25.3 13.2l.5-4.2L23 6l4-1.4L29 1z",
  },
  DEFI_ACTIVE: {
    viewBox: "0 0 20 20",
    path: "M10 1.34l5.2 3v5.32L10 12.66 4.8 9.66V4.34L10 1.34zM10 3.66L7.2 5.3v3.4L10 10.34l2.8-1.64V5.3L10 3.66z",
    fill: "#22c55e",
  },
  DEFI_FLUENT: {
    viewBox: "0 0 28 20",
    path: "M7 1.34l5.2 3v5.32L7 12.66 1.8 9.66V4.34L7 1.34zM7 3.66L4.2 5.3v3.4L7 10.34l2.8-1.64V5.3L7 3.66z M21 1.34l5.2 3v5.32L21 12.66 15.8 9.66V4.34L21 1.34zM21 3.66L18.2 5.3v3.4L21 10.34l2.8-1.64V5.3L21 3.66z",
    fill: "#22c55e",
  },
  DEFI_NATIVE: {
    viewBox: "0 0 36 20",
    path: "M7 1.34l5.2 3v5.32L7 12.66 1.8 9.66V4.34L7 1.34zM7 3.66L4.2 5.3v3.4L7 10.34l2.8-1.64V5.3L7 3.66z M18 1.34l5.2 3v5.32L18 12.66 12.8 9.66V4.34L18 1.34zM18 3.66L15.2 5.3v3.4L18 10.34l2.8-1.64V5.3L18 3.66z M29 1.34l5.2 3v5.32L29 12.66 23.8 9.66V4.34L29 1.34zM29 3.66L26.2 5.3v3.4L29 10.34l2.8-1.64V5.3L29 3.66z",
    fill: "#22c55e",
  },
  PROTOCOL_SPECIALIST: {
    viewBox: "0 0 20 20",
    path: "M10 2l6.93 4v8L10 18 3.07 14V6L10 2z",
    fill: "#60a5fa",
  },
  ZERO_FLAGS: {
    viewBox: "0 0 20 20",
    path: "M10 2l6 3.46v6.93L10 15.85 4 12.39V5.46L10 2z",
    fill: "#a78bfa",
  },
  AGENT_CERTIFIED: {
    viewBox: "0 0 20 20",
    path: "M10 1l2.94 5.96L19 7.64l-4.5 4.38 1.06 6.2L10 15.13l-5.56 3.09 1.06-6.2L1 7.64l6.06-.68L10 1z",
    fill: "#f0a500",
  },
  CROSS_CHAIN: {
    viewBox: "0 0 20 20",
    path: "M10 2a8 8 0 100 16 8 8 0 000-16zM10 4a6 6 0 110 12 6 6 0 010-12zM9 7v3H6v2h3v3h2v-3h3v-2h-3V7H9z",
  },
  CHARTERED: {
    viewBox: "0 0 20 20",
    path: "M10 1l3 6.18L20 8l-5 4.87 1.18 6.88L10 16.5l-6.18 3.25L5 12.87 0 8l7-0.82L10 1z",
    fill: "#FFD700",
  },
  EARLY_ADOPTER: {
    viewBox: "0 0 20 20",
    path: "M10 2a8 8 0 100 16 8 8 0 000-16zM10 4a6 6 0 110 12 6 6 0 010-12zM10 4v6h-6",
  },
  PROTOCOL_ADVOCATE: {
    viewBox: "0 0 20 20",
    path: "M3 3h1v10H3V3zm3 2h8a2 2 0 010 4H6V5z",
    fill: "#22c55e",
  },
};

const DEFAULT_COLORS: Record<string, string> = {
  VERIFIED: "#f0a500",
  CONSISTENT: "#f0a500",
  RIGOROUS: "#f0a500",
};

interface BadgeGlyphProps {
  type: BadgeType;
  size?: number;
  className?: string;
}

export function BadgeGlyph({ type, size = 16, className }: BadgeGlyphProps) {
  const glyph = GLYPH_PATHS[type];
  const color = glyph.fill ?? DEFAULT_COLORS[type] ?? "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox}
      fill={color}
      className={className}
      aria-label={type}
    >
      <path d={glyph.path} />
    </svg>
  );
}

/**
 * Renders up to 3 badge glyphs inline, as they appear next to a .id domain.
 * Example: ⬡◈ founder.id
 */
interface BadgeStripProps {
  badges: Array<{ type: BadgeType; id: string }>;
  size?: number;
  className?: string;
}

export function BadgeStrip({ badges, size = 14, className }: BadgeStripProps) {
  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`}>
      {badges.slice(0, 3).map((b) => (
        <BadgeGlyph key={b.id} type={b.type} size={size} />
      ))}
    </span>
  );
}
