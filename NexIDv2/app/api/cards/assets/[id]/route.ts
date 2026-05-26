import { NextResponse } from "next/server";
import { getCardAsset, renderCardSvg } from "@/lib/services/cardRenderService";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cleanId = id.replace(/\.svg$/i, "");
  const card = await getCardAsset(cleanId);
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return new NextResponse(renderCardSvg({ title: card.title, type: card.type, payload: card.payload }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
