import { NextResponse } from "next/server";
import { checkAvailability } from "@/lib/services/idService";
import { jsonError } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await checkAvailability(url.searchParams.get("name") ?? "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 502 });
  }
}
