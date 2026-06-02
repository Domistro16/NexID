import { NextResponse } from "next/server";
import { jsonError, nativeResolutionBotRunSchema } from "@/lib/server/validation";
import { runNativeResolutionBot } from "@/lib/services/nativeResolutionBotService";

export const dynamic = "force-dynamic";

function inputFromUrl(request: Request) {
  const url = new URL(request.url);
  return nativeResolutionBotRunSchema.parse({
    chainId: url.searchParams.get("chainId") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    force: url.searchParams.get("force") || undefined,
    strict: url.searchParams.get("strict") || undefined
  });
}

function botInput(input: ReturnType<typeof nativeResolutionBotRunSchema.parse>) {
  const { strict: _strict, ...runInput } = input;
  return runInput;
}

function responseStatus(result: { ok: boolean }, strict: boolean) {
  return strict && !result.ok ? 424 : 200;
}

export async function GET(request: Request) {
  try {
    const input = inputFromUrl(request);
    const result = await runNativeResolutionBot(botInput(input));
    return NextResponse.json(result, { status: responseStatus(result, input.strict) });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = nativeResolutionBotRunSchema.parse(body);
    const result = await runNativeResolutionBot(botInput(input));
    return NextResponse.json(result, { status: responseStatus(result, input.strict) });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
