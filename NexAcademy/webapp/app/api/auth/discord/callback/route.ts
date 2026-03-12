import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthService } from "@/lib/services/auth.service";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`
    : "http://localhost:3000/api/auth/discord/callback";
const authService = new AuthService(prisma);

/**
 * GET /api/auth/discord/callback
 * Discord OAuth2 callback. Exchanges the code for user info,
 * then saves discordId + discordUsername to the User record.
 */
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");

    if (!code || !stateParam) {
        return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    // Decode state to get auth token and return URL
    let token: string;
    let returnTo: string;
    try {
        const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
        token = parsed.token;
        returnTo = parsed.returnTo || "/";
    } catch {
        return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    // Verify our auth token
    let userId: string;
    const decoded = authService.verifyToken(token);
    if (!decoded) {
        return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }
    userId = decoded.userId;

    // Exchange code for Discord access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
        }),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("Discord token exchange failed:", err);
        return NextResponse.json({ error: "Discord auth failed" }, { status: 400 });
    }

    const tokenData = await tokenRes.json();

    // Fetch Discord user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
        return NextResponse.json({ error: "Failed to fetch Discord user" }, { status: 400 });
    }

    const discordUser = await userRes.json();
    const discordId = discordUser.id;
    const discordUsername = discordUser.username;

    // Save to User record
    await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "discordId" = $1, "discordUsername" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
        discordId,
        discordUsername,
        userId,
    );

    // Redirect back to the campaign page
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}${returnTo}?discord=linked`);
}
