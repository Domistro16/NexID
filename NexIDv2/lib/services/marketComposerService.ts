import type { MarketArena, MarketTemplateId, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const blockedTerms = [
  "assassination",
  "death of",
  "die",
  "dies",
  "serious illness",
  "pregnant",
  "pregnancy",
  "divorce",
  "private relationship",
  "dox",
  "doxx",
  "harass",
  "crime accusation",
  "allegation",
  "terrorist",
  "terror attack",
  "school shooting",
  "kidnap",
  "suicide"
];

const footballTerms = ["arsenal", "champions league", "uefa", "goal", "match", "league", "club", "transfer", "player", "squad", "football", "premier", "final"];
const cultureTerms = ["award", "chart", "song", "album", "movie", "box office", "grammy", "oscar", "billboard"];
const cryptoTerms = ["token", "coin", "btc", "eth", "sol", "base", "price", "$", "market cap", "airdrop"];

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part ? `${part[0]?.toUpperCase()}${part.slice(1)}` : part)
    .join(" ")
    .slice(0, 80);
}

function detectArena(raw: string, hint?: MarketArena): MarketArena {
  const text = raw.toLowerCase();
  if (footballTerms.some((term) => text.includes(term))) return "football";
  if (cultureTerms.some((term) => text.includes(term))) return "culture";
  if (cryptoTerms.some((term) => text.includes(term))) return "crypto";
  if (hint) return hint;
  return "crypto";
}

function explicitArena(raw: string) {
  const text = raw.toLowerCase();
  if (footballTerms.some((term) => text.includes(term))) return "football";
  if (cultureTerms.some((term) => text.includes(term))) return "culture";
  if (cryptoTerms.some((term) => text.includes(term))) return "crypto";
  return null;
}

function detectTemplate(raw: string, arena: MarketArena): MarketTemplateId {
  const text = raw.toLowerCase();
  if (arena === "football" && text.includes("transfer")) return "sports_transfer";
  if (arena === "football") return "sports_result";
  if (arena === "culture" && (text.includes("chart") || text.includes("#1"))) return "chart_rank";
  if (arena === "culture" && text.includes("award")) return "award_outcome";
  if (text.includes(" vs ") || text.includes("beats") || text.includes("beat ")) return "token_basket_race";
  if (text.includes("$") || text.includes("price") || text.includes("hit ")) return "token_price_threshold";
  if (text.includes("announce") || text.includes("release")) return "official_announcement";
  return "custom_objective";
}

function officialSportsSource(raw: string) {
  const text = raw.toLowerCase();
  if (text.includes("champions league") || text.includes("uefa")) {
    return {
      name: "UEFA Champions League official fixtures and results",
      url: "https://www.uefa.com/uefachampionsleague/fixtures-results/"
    };
  }
  if (text.includes("premier league")) {
    return {
      name: "Premier League official results",
      url: "https://www.premierleague.com/results"
    };
  }
  return {
    name: "Official league or match result source",
    url: null
  };
}

function detectSettlementSource(raw: string, arena: MarketArena, template: MarketTemplateId) {
  if (template === "token_price_threshold" || template === "token_basket_race") return "CoinGecko public USD price data";
  if (template === "sports_result") return officialSportsSource(raw).name;
  if (template === "sports_transfer") return "Official club, league, or player announcement source";
  if (template === "chart_rank") return "Named official chart body";
  if (template === "award_outcome") return "Named award body announcement";
  if (arena === "culture") return "Specified official public source";
  return null;
}

function sourceTypeFor(arena: MarketArena, template: MarketTemplateId): ShapedMarketDraft["resolution"]["sourceType"] {
  if (template === "token_price_threshold" || template === "token_basket_race") return "api";
  if (template === "sports_result") return "official_score";
  if (template === "sports_transfer" || template === "official_announcement" || template === "public_release") return "official_announcement";
  if (template === "chart_rank" || template === "award_outcome") return "official_chart";
  return arena === "crypto" ? "api" : "manual_optimistic";
}

function sourceUrlFor(raw: string, template: MarketTemplateId) {
  const explicit = explicitSourceUrl(raw);
  if (explicit) return explicit;
  const coingecko = coinGeckoUrl(raw, template);
  if (coingecko) return coingecko;
  if (template === "sports_result") return officialSportsSource(raw).url;
  return null;
}

function explicitSourceUrl(raw: string) {
  return raw.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, "") ?? null;
}

const coinGeckoIds: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
  doge: "dogecoin",
  ada: "cardano",
  avax: "avalanche-2",
  link: "chainlink",
  hype: "hyperliquid",
  hyperliquid: "hyperliquid"
};

function configuredCoinGeckoIds() {
  const raw = process.env.NEXMARKETS_COINGECKO_IDS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key.toLowerCase(), value]));
  } catch {
    return {};
  }
}

function coinGeckoUrl(raw: string, template: MarketTemplateId) {
  if (template !== "token_price_threshold" && template !== "token_basket_race") return null;
  const ids = { ...coinGeckoIds, ...configuredCoinGeckoIds() };
  for (const [key, coinId] of Object.entries(ids)) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)) {
      return `https://www.coingecko.com/en/coins/${coinId}`;
    }
  }
  return null;
}

function resolutionMethod(rawThesis: string, template: MarketTemplateId) {
  if (template === "token_basket_race") return "Compare percentage change from the locked start time to the close time using CoinGecko USD price data. Ride wins if the first named side outperforms.";
  if (template === "token_price_threshold") return "Ride wins if the named asset reaches the stated threshold by the locked close time according to CoinGecko USD price data.";
  if (template === "sports_result") return "Ride wins if the official result source confirms the stated team/player outcome by market close.";
  if (template === "sports_transfer") return "Ride wins if the official club, league, player, or approved source confirms the transfer by the locked close time.";
  if (template === "chart_rank") return "Ride wins if the named work reaches the stated chart rank by the locked close time according to the named chart body.";
  if (template === "award_outcome") return "Ride wins if the named award body announces the stated outcome.";
  return `Ride wins if the objective condition in "${rawThesis}" is verified by the locked settlement source before close.`;
}

function sideCopy(template: MarketTemplateId, title: string) {
  if (template === "token_basket_race") {
    return {
      ride: "The first named basket or entity outperforms by percentage change.",
      fade: "The opposing basket or entity matches or outperforms."
    };
  }
  return {
    ride: `${title} resolves true.`,
    fade: `${title} does not resolve true.`
  };
}

function resolutionFallback(template: MarketTemplateId) {
  if (template === "token_price_threshold" || template === "token_basket_race") {
    return "If CoinGecko is unavailable, use CoinMarketCap or another monitorable public historical USD spot-price source captured before ProofFlow finalization; do not rely on Binance as the automated primary source.";
  }
  return "If the primary source is unavailable, use the fallback source captured at launch or send the market through the dispute process.";
}

function endOfUtcDay(date: Date) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCHours(23, 59, 59, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextWeekday(dayName: string, now: Date) {
  const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(dayName.toLowerCase());
  if (target < 0) return null;
  const current = now.getUTCDay();
  const delta = (target - current + 7) % 7 || 7;
  return endOfUtcDay(addDays(now, delta));
}

function parseMonthDay(value: string, now: Date) {
  const parsed = new Date(`${value.replace(/,\s*\d{4}$/, "")}, ${now.getUTCFullYear()} 23:59:59 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= now.getTime()) parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  return parsed;
}

function detectTimeframe(raw: string) {
  const text = raw.trim();
  const now = new Date();
  const dateLike = text.match(/\b(?:by|before|on|through|until)\s+([a-zA-Z]+\s+\d{1,2}(?:,\s*\d{4})?|friday|monday|tuesday|wednesday|thursday|saturday|sunday|month end|year end)\b/i);
  if (dateLike?.[0] && dateLike[1]) {
    const label = dateLike[0];
    const target = dateLike[1].toLowerCase();
    const closeAt = target === "month end"
      ? endOfUtcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)))
      : target === "year end"
        ? endOfUtcDay(new Date(Date.UTC(now.getUTCFullYear(), 11, 31)))
        : nextWeekday(target, now) ?? parseMonthDay(dateLike[1], now);
    if (closeAt) return {
      startAt: now.toISOString(),
      closeAt: closeAt.toISOString(),
      timezone: "UTC",
      label
    };
  }
  const duration = text.match(/\b(\d+\s*(?:day|days|week|weeks|month|months))\b/i);
  if (duration?.[1]) {
    const amount = Number(duration[1].match(/\d+/)?.[0] ?? 0);
    const unit = duration[1].toLowerCase();
    const days = unit.includes("month") ? amount * 30 : unit.includes("week") ? amount * 7 : amount;
    const closeAt = endOfUtcDay(addDays(now, days || 7));
    return {
      startAt: now.toISOString(),
      closeAt: closeAt.toISOString(),
      timezone: "UTC",
      label: duration[1]
    };
  }
  if (/\bthis week\b/i.test(text)) {
    const closeAt = endOfUtcDay(addDays(now, 7));
    return {
      startAt: now.toISOString(),
      closeAt: closeAt.toISOString(),
      timezone: "UTC",
      label: "this week"
    };
  }
  return null;
}

function extractEntities(raw: string) {
  const tickers = raw.match(/\$?[A-Z]{2,12}\b/g) ?? [];
  const capitalized = raw.match(/\b[A-Z][a-zA-Z0-9-]{2,}\b/g) ?? [];
  return Array.from(new Set([...tickers, ...capitalized])).slice(0, 8);
}

export function shapeMarket(input: { rawThesis: string; arenaHint?: MarketArena }): ShapedMarketDraft {
  const rawThesis = input.rawThesis.trim().replace(/\s+/g, " ");
  const lower = rawThesis.toLowerCase();
  const blockedReason = blockedTerms.find((term) => lower.includes(term));
  const arena = explicitArena(rawThesis) ?? detectArena(rawThesis, input.arenaHint);
  const template = detectTemplate(rawThesis, arena);
  const timeframe = detectTimeframe(rawThesis);
  const settlementSource = detectSettlementSource(rawThesis, arena, template);
  const sourceUrl = sourceUrlFor(rawThesis, template);
  const missingFields = [
    !timeframe ? "timeframe" : null,
    !settlementSource ? "settlement source" : null,
    !sourceUrl ? "source URL" : null
  ].filter((item): item is string => Boolean(item));
  const riskStatus = blockedReason ? "blocked" : missingFields.length ? "ambiguous_refine" : "allowed";
  const title = titleCase(rawThesis.replace(/\?+$/, ""));
  const question = rawThesis.endsWith("?") ? rawThesis : `Will ${rawThesis}?`;
  const sourceName = settlementSource ?? "Specified official public source";
  const riskReasons = blockedReason
    ? [`Blocked unsafe market topic: ${blockedReason}`]
    : [
        timeframe ? "Fixed timeframe detected" : "Needs fixed timeframe",
        settlementSource ? "Objective settlement source detected" : "Needs objective settlement source",
        "Ride/Fade sides map to true/false settlement"
      ];

  return {
    rawThesis,
    title,
    question,
    arena,
    template,
    entities: extractEntities(rawThesis),
    timeframe,
    settlementSource,
    resolution: {
      sourceType: sourceTypeFor(arena, template),
      sourceName,
      sourceUrl,
      method: resolutionMethod(rawThesis, template),
      fallback: resolutionFallback(template)
    },
    sides: sideCopy(template, title),
    launch: {
      stakeUsdc: 20,
      nonRefundableFeeUsdc: 10,
      refundableQualityBondUsdc: 10
    },
    risk: {
      status: riskStatus,
      reasons: riskReasons,
      requiredUserEdits: missingFields
    },
    riskStatus,
    missingFields,
    blockedReason: blockedReason ? `Blocked unsafe market topic: ${blockedReason}` : null,
    duplicateCheck: {
      status: "pending",
      matches: []
    }
  };
}
