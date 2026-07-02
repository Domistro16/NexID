import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { syncNativeMarketFactoryEvents } from "@/lib/services/nativeMarketIndexerService";
import { jsonError } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const url = new URL(request.url);
    const chainId = Number(url.searchParams.get("chainId") ?? "");
    const configuredChainId = Number(process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || 84532);
    const resolvedChainId = Number.isFinite(chainId) && chainId > 0 ? chainId : configuredChainId;
    const fromBlockParam = url.searchParams.get("fromBlock");
    const fromBlock = fromBlockParam && /^\d+$/.test(fromBlockParam) ? BigInt(fromBlockParam) : undefined;
    const toBlockParam = url.searchParams.get("toBlock");
    const toBlock = toBlockParam && /^\d+$/.test(toBlockParam) ? BigInt(toBlockParam) : undefined;
    const skipLifecycle = url.searchParams.get("skipLifecycle") === "true";

    const result = await syncNativeMarketFactoryEvents({ chainId: resolvedChainId, fromBlock, toBlock, skipLifecycle });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
