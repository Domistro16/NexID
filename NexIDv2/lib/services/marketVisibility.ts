import { MarketOrigin } from "@prisma/client";

export const UNLAUNCHED_NATIVE_MARKET_STATUSES = ["draft", "route_check", "ready_to_launch"] as const;

export function isUnlaunchedNativeMarket(row: {
  origin: string;
  status: string;
  contractAddress?: string | null;
}) {
  return row.origin === "native" &&
    !row.contractAddress &&
    (UNLAUNCHED_NATIVE_MARKET_STATUSES as readonly string[]).includes(row.status);
}

export function publicMarketWhereClause() {
  return {
    NOT: {
      origin: MarketOrigin.native,
      contractAddress: null,
      status: { in: [...UNLAUNCHED_NATIVE_MARKET_STATUSES] }
    }
  };
}

