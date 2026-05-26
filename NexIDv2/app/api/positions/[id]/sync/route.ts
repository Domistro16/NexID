import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { syncPositionExecution } from "@/lib/services/positionService";
import { jsonError } from "@/lib/server/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const position = await syncPositionExecution(id, user.id);
    return NextResponse.json({ position });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
