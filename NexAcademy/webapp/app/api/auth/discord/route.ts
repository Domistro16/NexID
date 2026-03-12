import { NextRequest, NextResponse } from "next/server";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`
    : "http://localhost:3000/api/auth/discord/callback";

/**
 * GET /api/auth/discord
 * Redirects the user to Discord OAuth2 authorization page.
 * The `state` param carries the auth token so we can identify the user on callback.
 */
export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");
    const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";

    if (!token) {
        return NextResponse.json({ error: "Missing auth token" }, { status: 400 });
    }

    const state = Buffer.from(JSON.stringify({ token, returnTo })).toString("base64url");

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "identify guilds",
        state,
    });

    return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
}
