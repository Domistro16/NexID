import { NextResponse } from "next/server";
import { productionSmokeCheck } from "@/lib/services/productionQaService";

export async function GET() {
  const result = await productionSmokeCheck();
  return NextResponse.json(result, { status: result.ok ? 200 : 424 });
}
