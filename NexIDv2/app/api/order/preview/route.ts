import { NextResponse } from "next/server";
import { jsonError, orderPreviewSchema } from "@/lib/server/validation";
import { previewOrder } from "@/lib/services/orderPreviewService";

export async function POST(request: Request) {
  try {
    const body = orderPreviewSchema.parse(await request.json());
    const { narrative: _narrative, ...preview } = await previewOrder(body);
    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
