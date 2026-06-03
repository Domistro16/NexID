import { NextResponse } from "next/server";
import { jsonError, routeCheckSchema } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { routeCheckNexMindMarket } from "@/lib/services/nexmind/nexmindRoutingService";
import { recordRouteDecision } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = routeCheckSchema.parse(await request.json());
    const user = await getSessionUser();
    const decision = await routeCheckNexMindMarket({ draft: body.draft, user });
    const market = await recordRouteDecision({ draftId: body.draftId, draft: body.draft, decision });
    return NextResponse.json({ decision, market });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
