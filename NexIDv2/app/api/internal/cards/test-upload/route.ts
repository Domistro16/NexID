import { NextResponse } from "next/server";
import { renderCardAsset } from "@/lib/services/cardRenderService";

export async function POST() {
  const card = await renderCardAsset({
    type: "receipt",
    title: "NexID S3 smoke card",
    payload: { Result: "+48%", Proof: "QA", Status: "Uploaded" }
  });
  return NextResponse.json({ card });
}
