import { NextResponse } from "next/server";
import { jsonError, nativeResolutionBotRunSchema } from "@/lib/server/validation";
import { runNativeResolutionBot } from "@/lib/services/nativeResolutionBotService";

export const dynamic = "force-dynamic";

function inputFromUrl(request: Request) {
  const url = new URL(request.url);
  return nativeResolutionBotRunSchema.parse({
    chainId: url.searchParams.get("chainId") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    force: url.searchParams.get("force") || undefined
  });
}

export async function GET(request: Request) {
  try {
    const result = await runNativeResolutionBot(inputFromUrl(request));
    return NextResponse.json(result, { status: result.ok ? 200 : 424 });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runNativeResolutionBot(nativeResolutionBotRunSchema.parse(body));
    return NextResponse.json(result, { status: result.ok ? 200 : 424 });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
