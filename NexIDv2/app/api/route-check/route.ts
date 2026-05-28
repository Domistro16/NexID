import { NextResponse } from "next/server";
import { jsonError, routeCheckSchema } from "@/lib/server/validation";
import { routeCheckMarket } from "@/lib/services/routeMatcherService";
import { recordRouteDecision } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = routeCheckSchema.parse(await request.json());
    const decision = await routeCheckMarket(body.draft);
    const market = await recordRouteDecision({ draftId: body.draftId, draft: body.draft, decision });
    return NextResponse.json({ decision, market });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
