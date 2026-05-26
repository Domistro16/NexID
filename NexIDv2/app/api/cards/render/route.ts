import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { cardRenderSchema, jsonError } from "@/lib/server/validation";
import { renderCardAsset } from "@/lib/services/cardRenderService";

export async function POST(request: Request) {
  try {
    const body = cardRenderSchema.parse(await request.json());
    const card = await renderCardAsset({ ...body, payload: body.payload as Prisma.InputJsonValue | undefined });
    return NextResponse.json({ card });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
