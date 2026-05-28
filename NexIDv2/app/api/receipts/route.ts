import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { resolveIdentityLabel } from "@/lib/identity";
import { createReceiptForPosition } from "@/lib/services/receiptService";
import { jsonError, receiptPostSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = receiptPostSchema.parse(await request.json());
    const receipt = await createReceiptForPosition({
      positionId: body.positionId,
      userId: user.id,
      identity: body.identity ?? resolveIdentityLabel(user),
      narrativeId: "",
      side: "fade",
      amount: 1
    });
    return NextResponse.json({ receipt });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
