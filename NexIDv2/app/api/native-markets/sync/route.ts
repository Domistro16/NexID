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
    const resolvedChainId = Number.isFinite(chainId) && chainId > 0 ? chainId : 84532;
    const fromBlockParam = url.searchParams.get("fromBlock");
    const fromBlock = fromBlockParam && /^\d+$/.test(fromBlockParam) ? BigInt(fromBlockParam) : undefined;
    if (process.env.NATIVE_MARKETS_TESTNET_ONLY === "true" && resolvedChainId !== 84532) {
      return NextResponse.json({ error: "Native market event sync is testnet-only in this environment" }, { status: 400 });
    }

    const result = await syncNativeMarketFactoryEvents({ chainId: resolvedChainId, fromBlock });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
