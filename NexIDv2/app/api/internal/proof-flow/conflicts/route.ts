import { NextResponse } from "next/server";
import { jsonError, proofFlowConflictReviewSchema } from "@/lib/server/validation";
import { listProofFlowReviewerConflictReports, reviewProofFlowReviewerConflict } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

function assertInternal(request: Request) {
  const secret = process.env.PROOFFLOW_REVIEW_CRON_SECRET || process.env.INTERNAL_ADMIN_TOKEN || process.env.CRON_SECRET;
  if (!secret) return;
  const supplied = request.headers.get("x-cron-secret")
    || request.headers.get("x-internal-admin-token")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== secret) throw new Error("Unauthorized internal request.");
}

export async function GET(request: Request) {
  try {
    assertInternal(request);
    const url = new URL(request.url);
    const reports = await listProofFlowReviewerConflictReports({
      status: url.searchParams.get("status") || undefined,
      limit: Number(url.searchParams.get("limit") || 50)
    });
    return NextResponse.json({ ok: true, reports });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertInternal(request);
    const body = proofFlowConflictReviewSchema.parse(await request.json());
    const result = await reviewProofFlowReviewerConflict(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
