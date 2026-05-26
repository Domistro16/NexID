import { NextResponse } from "next/server";
import { internalPointsAdjustSchema, jsonError } from "@/lib/server/validation";
import { adjustPointsAdmin } from "@/lib/services/internalAdminService";

export async function POST(request: Request) {
  try {
    const body = internalPointsAdjustSchema.parse(await request.json());
    const result = await adjustPointsAdmin(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
