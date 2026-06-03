import { NextResponse } from "next/server";
import { jsonError, nexmindSourceHealthRunSchema } from "@/lib/server/validation";
import { runSourceHealthJob } from "@/lib/services/nexmind/nexmindSourceMonitorService";

export const dynamic = "force-dynamic";

function assertCron(request: Request) {
  const secret = process.env.SOURCE_MONITOR_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== secret) throw new Error("Unauthorized cron request.");
}

function inputFromUrl(request: Request) {
  const url = new URL(request.url);
  return nexmindSourceHealthRunSchema.parse({
    limit: url.searchParams.get("limit") || undefined,
    force: url.searchParams.get("force") || undefined
  });
}

export async function GET(request: Request) {
  try {
    assertCron(request);
    const result = await runSourceHealthJob(inputFromUrl(request));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertCron(request);
    const body = nexmindSourceHealthRunSchema.parse(await request.json().catch(() => ({})));
    const result = await runSourceHealthJob(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
