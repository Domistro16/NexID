import { NextResponse } from "next/server";
import { analyticsEventSchema, jsonError } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { logAnalyticsEvent } from "@/lib/services/analyticsService";
import type { JsonInput } from "@/lib/types/json";

export async function POST(request: Request) {
  try {
    const body = analyticsEventSchema.parse(await request.json());
    const user = await getSessionUser();
    const result = await logAnalyticsEvent(body.name, body.metadata as JsonInput | undefined, user?.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
