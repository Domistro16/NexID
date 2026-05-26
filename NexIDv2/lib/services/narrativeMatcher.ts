import type { Narrative } from "@/lib/types/nexid";

export function narrativeSearchTerms(narrative: Narrative) {
  const base = [narrative.name, narrative.tag, narrative.summary];
  return base.join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((item) => item.length > 3);
}

export function scoreMarketForNarrative(narrative: Narrative, market: { question: string; slug: string }) {
  const haystack = `${market.question} ${market.slug}`.toLowerCase();
  return narrativeSearchTerms(narrative).reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
