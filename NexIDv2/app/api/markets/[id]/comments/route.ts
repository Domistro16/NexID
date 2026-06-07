import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { createMarketComment, listMarketComments } from "@/lib/services/marketCommentService";
import { jsonError, marketCommentCreateSchema } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await listMarketComments(id);
  return NextResponse.json({ comments });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = marketCommentCreateSchema.parse(await request.json());
    const user = await getSessionUser().catch(() => null);
    const comment = await createMarketComment({ marketId: id, body: body.body, user });
    return NextResponse.json({ comment });
  } catch (error) {
    const message = jsonError(error);
    const status = message.error === "Market not found." ? 404 : 400;
    return NextResponse.json(message, { status });
  }
}
