import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { env } from "@/lib/env";
import { json, problem, requestId, zodProblem } from "@/lib/http";
import { createSession, setSessionCookie, ensurePersonalWorkspace } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = z.object({
  accessToken: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1).max(100).optional()
});

export async function POST(request: Request) {
  const id = requestId(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return zodProblem(id, parsed.error);
  
  const { accessToken, workspaceName } = parsed.data;
  
  // Verify the access token with Supabase GoTrue
  const userResponse = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apiKey: env.supabaseAnonKey
    }
  }).catch(() => null);
  
  if (!userResponse || !userResponse.ok) {
    return problem(id, 401, "SUPABASE_TOKEN_INVALID", "Invalid Supabase session token", "The authentication token could not be verified with Supabase.");
  }
  
  const supabaseUser = await userResponse.json();
  const email = supabaseUser.email?.toLowerCase();
  
  if (!email) {
    return problem(id, 400, "EMAIL_REQUIRED", "Email is required", "Your Supabase account does not have a verified email address.");
  }
  
  const prisma = getPrisma()!;
  let user = await prisma.user.findUnique({ where: { email } });
  
  const isTwitter = supabaseUser.app_metadata?.provider === "twitter" || 
                    supabaseUser.identities?.some((ident: any) => ident.provider === "twitter");
  const metadata = supabaseUser.user_metadata || {};
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        handle: metadata.user_name || email.split("@")[0],
        displayName: metadata.full_name || email.split("@")[0],
        avatarUrl: metadata.avatar_url || null,
        settings: {}
      }
    });
    await ensurePersonalWorkspace(user.id, workspaceName || user.displayName);
  }
  
  if (isTwitter && metadata.user_name) {
    const { encryptSecret } = await import("@/lib/secrets");
    const encryptedAccess = encryptSecret(accessToken);
    await prisma.xAccount.upsert({
      where: { providerUserId: supabaseUser.id },
      update: {
        userId: user.id,
        handle: metadata.user_name,
        accessTokenEncrypted: encryptedAccess,
        scopes: [],
        connectedAt: new Date(),
        revokedAt: null
      },
      create: {
        userId: user.id,
        providerUserId: supabaseUser.id,
        handle: metadata.user_name,
        accessTokenEncrypted: encryptedAccess,
        scopes: []
      }
    });
  }

  
  const session = await createSession(user.id, request);
  const nextResponse = json({ success: true, user: { id: user.id, email: user.email } }, id);
  setSessionCookie(nextResponse as NextResponse, session.token, session.expiresAt, request);
  return nextResponse;
}
