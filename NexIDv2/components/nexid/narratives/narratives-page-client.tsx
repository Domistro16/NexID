"use client";

import { useEffect, useState } from "react";
import { fetchNarrativesApi } from "@/lib/services/nexid-client";
import type { Narrative } from "@/lib/types/nexid";
import { MarketTable } from "@/components/nexid/shared/market-table";

export function NarrativesPageClient() {
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  useEffect(() => {
    void fetchNarrativesApi().then(setNarratives).catch(() => setNarratives([]));
  }, []);
  return <section id="narratives" className="view active"><MarketTable narratives={narratives} title="Live Narratives" /></section>;
}
