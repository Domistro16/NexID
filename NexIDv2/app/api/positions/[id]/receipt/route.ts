import { NextResponse } from "next/server";
import { jsonError, receiptCreateSchema } from "@/lib/server/validation";
import { resolveIdentityLabel } from "@/lib/identity";
import { requireSessionUser } from "@/lib/services/authService";
import { createReceiptForPosition } from "@/lib/services/receiptService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await requireSessionUser();
    const body = receiptCreateSchema.parse(await request.json());
    const receipt = await createReceiptForPosition({
      positionId: id,
      ...body,
      userId: user.id,
      identity: resolveIdentityLabel(user)
    });
    return NextResponse.json({ receipt });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
