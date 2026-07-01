import { NextResponse } from "next/server";
import { jsonError, shapeMarketSchema } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { shapeMarket } from "@/lib/services/marketComposerService";
import { routeCheckNexMindMarket } from "@/lib/services/nexmind/nexmindRoutingService";
import { recordRouteDecision } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = shapeMarketSchema.parse(await request.json());
    const user = await getSessionUser();
    const draft = shapeMarket({ rawThesis: body.rawThesis, arenaHint: body.arenaHint });
    const decision = await routeCheckNexMindMarket({ draft, user });
    const market = await recordRouteDecision({ draft, decision });
    return NextResponse.json({ decision, market });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
