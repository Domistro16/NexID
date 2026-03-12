import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";

/**
 * POST /api/campaigns/[id]/verify-task
 * Verify a Discord task for the authenticated user.
 *
 * Body: { moduleIndex: number, verificationType: "discord-join" | "discord-post", guildId: string, channelId?: string }
 *
 * For "discord-join": checks if the user is a member of the guild.
 * For "discord-post": checks if the user has sent a message in the specified channel.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const campaignId = parseInt(id, 10);

    // Auth
    const auth = await verifyAuth(req);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Get user's discordId
    const user = await prisma.user.findUnique({
        where: { id: auth.user.userId },
        select: { discordId: true },
    });
    const discordId = user?.discordId;

    if (!discordId) {
        return NextResponse.json(
            { error: "discord_not_linked", message: "Please link your Discord account first." },
            { status: 400 },
        );
    }

    const body = await req.json();
    const { verificationType, guildId, channelId } = body;

    if (!verificationType || !guildId) {
        return NextResponse.json({ error: "Missing verificationType or guildId" }, { status: 400 });
    }

    // === DISCORD-JOIN: Check if user is a member of the guild ===
    if (verificationType === "discord-join") {
        const memberRes = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
            { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
        );

        if (memberRes.status === 404) {
            return NextResponse.json({
                verified: false,
                message: "You haven't joined the Discord server yet. Please join and try again.",
            });
        }

        if (!memberRes.ok) {
            console.error("Discord guild member check failed:", await memberRes.text());
            return NextResponse.json({ error: "Discord API error" }, { status: 500 });
        }

        return NextResponse.json({ verified: true, message: "Discord server membership verified!" });
    }

    // === DISCORD-POST: Check if user has sent a message in a specific channel ===
    if (verificationType === "discord-post") {
        if (!channelId) {
            return NextResponse.json({ error: "Missing channelId for discord-post" }, { status: 400 });
        }

        // Search recent messages in the channel for this user (last 100 messages)
        const messagesRes = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
        );

        if (!messagesRes.ok) {
            console.error("Discord channel messages fetch failed:", await messagesRes.text());
            return NextResponse.json({ error: "Discord API error" }, { status: 500 });
        }

        const messages = await messagesRes.json();
        const userMessage = messages.find(
            (msg: { author: { id: string } }) => msg.author.id === discordId,
        );

        if (!userMessage) {
            return NextResponse.json({
                verified: false,
                message: "No message found from you in the channel. Please post and try again.",
            });
        }

        return NextResponse.json({ verified: true, message: "Message verified in channel!" });
    }

    return NextResponse.json({ error: `Unknown verificationType: ${verificationType}` }, { status: 400 });
}
