import { NextResponse } from "next/server";
import { internalPositionSettleSchema, jsonError } from "@/lib/server/validation";
import { settlePositionForReceipt } from "@/lib/services/receiptService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = internalPositionSettleSchema.parse(await request.json());
    const position = await settlePositionForReceipt({
      positionId: id,
      settlementPrice: body.settlementPrice,
      source: body.source ?? "internal-admin-settlement"
    });
    return NextResponse.json({ position });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
