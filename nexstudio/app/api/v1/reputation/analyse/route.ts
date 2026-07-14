import { getPrisma } from "@/lib/db";
import { json, problem } from "@/lib/http";
import { requireSession, requireTrustedOrigin } from "@/lib/route-auth";
import { analyseXTweets, getXMe, getXTweets } from "@/lib/x-provider";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireSession(request); if (auth.response) return auth.response;
  const originError = requireTrustedOrigin(request, auth.id); if (originError) return originError;
  const prisma = getPrisma()!; const account = auth.session.user.xAccounts[0];
  if (!account) return problem(auth.id, 409, "X_CONNECTION_REQUIRED", "Connect X first", "Reputation analysis uses the X account you explicitly connect.");
  try {
    const [me, tweets] = await Promise.all([getXMe(account.accessTokenEncrypted), getXTweets(account.providerUserId, account.accessTokenEncrypted)]);
    const analysis = analyseXTweets(tweets);
    const existing = await prisma.reputationProfile.findFirst({ where: { userId: auth.session.userId }, orderBy: { updatedAt: "desc" } });
    const slug = `${me.username.toLowerCase()}-${auth.session.userId.slice(0, 8)}`;
    const profile = existing
      ? await prisma.reputationProfile.update({ where: { id: existing.id }, data: { handle: me.username, status: existing.status === "ENHANCED_CARD_READY" ? "ENHANCED_CARD_READY" : "BASE_CARD_READY", baseProfile: { identity: me, analysis }, lastXRefreshAt: new Date() } })
      : await prisma.reputationProfile.create({ data: { userId: auth.session.userId, handle: me.username, status: "BASE_CARD_READY", baseProfile: { identity: me, analysis }, publicSlug: slug, publicSettings: { published: false } } });
    await prisma.reputationEvidence.deleteMany({ where: { profileId: profile.id, sourceType: "X_POST" } });
    if (analysis.standout.length) await prisma.reputationEvidence.createMany({ data: analysis.standout.map((post) => ({ profileId: profile.id, sourceType: "X_POST", sourceUrl: `https://x.com/${me.username}/status/${post.id}`, sourceDate: post.createdAt ? new Date(post.createdAt) : null, excerpt: post.text.slice(0, 500), supports: { metrics: post.metrics }, confidence: 100, status: "VERIFIED" })) });
    return json(profile, auth.id);
  } catch (error) { return problem(auth.id, 502, "X_ANALYSIS_FAILED", "X analysis could not complete", error instanceof Error ? error.message : "X data could not be read."); }
}
