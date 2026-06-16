import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { getReviewerWorkbench } from "@/lib/services/reviewerWorkbenchService";
import { requireReviewerAuthUser } from "@/lib/services/reviewerAccessService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireReviewerAuthUser();
    const workbench = await getReviewerWorkbench(user);
    return NextResponse.json({ workbench });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error.includes("authentication") ? 401 : 400 });
  }
}
