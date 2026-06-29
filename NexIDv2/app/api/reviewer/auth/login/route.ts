import { NextResponse } from "next/server";
import { jsonError, proofFlowReviewerAccessLoginSchema } from "@/lib/server/validation";
import {
  loginReviewerWithAccessKey,
  reviewerSessionCookieName,
  reviewerSessionCookieOptions
} from "@/lib/services/reviewerAccessService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = proofFlowReviewerAccessLoginSchema.parse(await request.json());
    const session = await loginReviewerWithAccessKey(body);
    const identity = {
      id: session.reviewer.id,
      walletAddress: session.reviewer.walletAddress,
      displayName: session.reviewer.displayName,
      primaryIdName: session.reviewer.primaryIdName,
      primaryDomainName: session.reviewer.primaryDomainName,
      pointsTotal: session.reviewer.pointsTotal
    };
    const response = NextResponse.json({
      ok: true,
      reviewer: identity,
      prover: identity
    });
    response.cookies.set(reviewerSessionCookieName(), session.token, reviewerSessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 401 });
  }
}
