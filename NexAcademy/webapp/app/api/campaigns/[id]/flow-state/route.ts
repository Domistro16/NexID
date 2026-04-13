import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import {
  getCampaignFlowState,
  getDefaultCampaignFlowState,
  saveCampaignFlowState,
} from "@/lib/services/campaign-flow-state.service";
import { resolveCampaignId } from "@/lib/campaign-route";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = await resolveCampaignId(id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const state = await getCampaignFlowState(campaignId, auth.user.userId);
    return NextResponse.json({ state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load campaign flow state";
    const status = message === "Not enrolled in this campaign" ? 403 : 500;
    return NextResponse.json({ error: message, state: getDefaultCampaignFlowState() }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = await resolveCampaignId(id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: { state?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const state = await saveCampaignFlowState(campaignId, auth.user.userId, body.state);
    return NextResponse.json({ saved: true, state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist campaign flow state";
    const status = message === "Not enrolled in this campaign" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
