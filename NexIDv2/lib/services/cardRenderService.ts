import type { Prisma } from "@prisma/client";
import { withDatabase } from "@/lib/server/db";
import { uploadSvgAsset } from "@/lib/services/s3AssetStore";

export async function renderCardAsset(input: { type?: string; title?: string; payload?: Prisma.InputJsonValue }) {
  const id = `card_${Date.now()}`;
  const type = input.type ?? "receipt";
  const title = input.title ?? "NexID card";
  const svg = renderCardSvg({ title, type, payload: input.payload });
  const s3Url = await uploadSvgAsset(`cards/${id}.svg`, svg);
  const card = {
    id,
    type,
    title,
    publicUrl: s3Url ?? `/api/cards/assets/${id}.svg`,
    format: "svg",
    width: 1600,
    height: 900
  };
  return withDatabase(
    async (db) => {
      const row = await db.cardAsset.create({
        data: {
          type: card.type,
          title: card.title,
          format: card.format,
          publicUrl: card.publicUrl,
          payload: input.payload
        }
      });
      return { ...card, id: row.id, publicUrl: row.publicUrl };
    },
    async () => card
  );
}

export async function getCardAsset(id: string) {
  return withDatabase(
    async (db) => db.cardAsset.findUnique({ where: { id } }),
    async () => null
  );
}

function escapeText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderCardSvg(input: { title: string; type: string; payload?: unknown }) {
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? (input.payload as Record<string, unknown>)
    : {};
  const rows = Object.entries(payload).slice(0, 4);
  const title = escapeText(input.title);
  const type = escapeText(input.type);
  const big = escapeText(payload.Result ?? payload.Status ?? payload.Rank ?? payload.Points ?? "EDGE");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <radialGradient id="gold" cx="78%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#ffcf6a" stop-opacity="0.42"/>
      <stop offset="55%" stop-color="#ffb000" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#080706" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#080706"/>
      <stop offset="58%" stop-color="#15110b"/>
      <stop offset="100%" stop-color="#2b1d08"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" rx="44" fill="url(#bg)"/>
  <rect width="1600" height="900" rx="44" fill="url(#gold)"/>
  <path d="M980 120 C1200 94 1390 205 1440 430 C1488 646 1334 790 1110 794 C940 797 830 716 815 560 C798 374 833 138 980 120Z" fill="#ffb000" opacity="0.08"/>
  <path d="M1120 190 C1268 185 1375 292 1375 448 C1375 612 1260 705 1121 705 C993 705 910 612 910 460 C910 300 981 195 1120 190Z" fill="#f8f1e5" opacity="0.07"/>
  <text x="92" y="112" fill="#ffcf6a" font-family="Azeret Mono, Consolas, monospace" font-size="28" font-weight="800" letter-spacing="4">${type}</text>
  <text x="92" y="210" fill="#fff8eb" font-family="Georgia, serif" font-size="82" font-weight="900">${big}</text>
  <foreignObject x="92" y="250" width="870" height="180">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Trebuchet MS, sans-serif; color:#c8bca9; font-size:38px; line-height:1.16; font-weight:800;">${title}</div>
  </foreignObject>
  ${rows.map(([label, value], index) => {
    const x = 92 + index * 340;
    return `<g><rect x="${x}" y="665" width="300" height="112" rx="24" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/><text x="${x + 24}" y="710" fill="#928879" font-family="Azeret Mono, Consolas, monospace" font-size="18" font-weight="800">${escapeText(label)}</text><text x="${x + 24}" y="758" fill="#fff8eb" font-family="Trebuchet MS, sans-serif" font-size="32" font-weight="900">${escapeText(value)}</text></g>`;
  }).join("")}
  <text x="92" y="835" fill="#827767" font-family="Azeret Mono, Consolas, monospace" font-size="20" font-weight="700">NexID EdgeBoard · Trade the timeline. Prove your edge.</text>
</svg>`;
}
