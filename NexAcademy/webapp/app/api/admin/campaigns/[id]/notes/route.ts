import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * GET /api/admin/campaigns/[id]/notes
 * Retrieve all notes for a campaign, decrypted.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    try {
        const notes = await prisma.$queryRawUnsafe<
            Array<{
                id: string;
                campaignId: number;
                authorId: string;
                encryptedContent: string;
                iv: string;
                createdAt: Date;
                updatedAt: Date;
                authorWallet: string | null;
            }>
        >(
            `SELECT n."id", n."campaignId", n."authorId", n."encryptedContent", n."iv",
              n."createdAt", n."updatedAt", u."walletAddress" AS "authorWallet"
       FROM "CampaignNote" n
       LEFT JOIN "User" u ON u."id" = n."authorId"
       WHERE n."campaignId" = $1
       ORDER BY n."createdAt" DESC`,
            campaignId,
        );

        const decryptedNotes = notes.map((note) => {
            try {
                return {
                    id: note.id,
                    campaignId: note.campaignId,
                    authorId: note.authorId,
                    authorWallet: note.authorWallet,
                    content: decrypt(note.encryptedContent, note.iv),
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt,
                };
            } catch {
                return {
                    id: note.id,
                    campaignId: note.campaignId,
                    authorId: note.authorId,
                    authorWallet: note.authorWallet,
                    content: "[Decryption failed]",
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt,
                };
            }
        });

        return NextResponse.json({ notes: decryptedNotes });
    } catch (error) {
        console.error("GET campaign notes error:", error);
        return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }
}

/**
 * POST /api/admin/campaigns/[id]/notes
 * Add a new encrypted note to a campaign.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const content = (body.content ?? "").trim();

        if (!content) {
            return NextResponse.json({ error: "Note content is required" }, { status: 400 });
        }

        const { encrypted, iv } = encrypt(content);
        const noteId = crypto.randomUUID();

        await prisma.$executeRawUnsafe(
            `INSERT INTO "CampaignNote" ("id", "campaignId", "authorId", "encryptedContent", "iv", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            noteId,
            campaignId,
            auth.user!.userId,
            encrypted,
            iv,
        );

        return NextResponse.json({
            note: {
                id: noteId,
                campaignId,
                content,
                createdAt: new Date(),
            },
        });
    } catch (error) {
        console.error("POST campaign note error:", error);
        return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/campaigns/[id]/notes
 * Delete a specific note by noteId (passed in query param).
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    const noteId = request.nextUrl.searchParams.get("noteId");

    if (!noteId) {
        return NextResponse.json({ error: "noteId is required" }, { status: 400 });
    }

    try {
        await prisma.$executeRawUnsafe(
            `DELETE FROM "CampaignNote" WHERE "id" = $1 AND "campaignId" = $2`,
            noteId,
            campaignId,
        );

        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error("DELETE campaign note error:", error);
        return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
    }
}
