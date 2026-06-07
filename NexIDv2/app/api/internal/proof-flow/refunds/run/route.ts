import { NextResponse } from "next/server";
import { jsonError, proofFlowQueueRunSchema } from "@/lib/server/validation";
import { executeProofFlowRefundQueue } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

function assertCron(request: Request) {
  const secret = process.env.PROOFFLOW_REFUND_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-cron-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || url.searchParams.get("cronSecret")
    || url.searchParams.get("secret");
  if (supplied !== secret) throw new Error("Unauthorized cron request.");
}

function inputFromUrl(request: Request) {
  const url = new URL(request.url);
  return proofFlowQueueRunSchema.parse({
    limit: url.searchParams.get("limit") || undefined
  });
}

export async function GET(request: Request) {
  try {
    assertCron(request);
    const result = await executeProofFlowRefundQueue(inputFromUrl(request));
    return NextResponse.json({ ok: result.every((item) => item.ok), results: result });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertCron(request);
    const body = proofFlowQueueRunSchema.parse(await request.json().catch(() => ({})));
    const result = await executeProofFlowRefundQueue(body);
    return NextResponse.json({ ok: result.every((item) => item.ok), results: result });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
