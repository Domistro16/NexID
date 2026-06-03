import { NextResponse } from "next/server";
import { jsonError, nexmindNotificationRunSchema } from "@/lib/server/validation";
import { runCreatorNotificationJob } from "@/lib/services/nexmind/nexmindNotificationJobService";

export const dynamic = "force-dynamic";

function assertCron(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== secret) throw new Error("Unauthorized cron request.");
}

function inputFromUrl(request: Request) {
  const url = new URL(request.url);
  return nexmindNotificationRunSchema.parse({
    limit: url.searchParams.get("limit") || undefined,
    force: url.searchParams.get("force") || undefined
  });
}

export async function GET(request: Request) {
  try {
    assertCron(request);
    return NextResponse.json(await runCreatorNotificationJob(inputFromUrl(request)));
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertCron(request);
    const body = nexmindNotificationRunSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await runCreatorNotificationJob(body));
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
