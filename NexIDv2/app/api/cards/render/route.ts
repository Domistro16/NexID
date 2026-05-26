import { NextResponse } from "next/server";
import { cardRenderSchema, jsonError } from "@/lib/server/validation";
import { renderCardAsset } from "@/lib/services/cardRenderService";
import type { JsonInput } from "@/lib/types/json";

export async function POST(request: Request) {
  try {
    const body = cardRenderSchema.parse(await request.json());
    const card = await renderCardAsset({ ...body, payload: body.payload as JsonInput | undefined });
    return NextResponse.json({ card });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
