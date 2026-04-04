import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { decrypt, encrypt } from "@/lib/encryption";

/**
 * GET /api/campaigns/[id]/notes
 * Return current user's encrypted notes for this campaign (decrypted in response).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  try {
    const notes = await prisma.$queryRaw<
      Array<{
        id: string;
        encryptedContent: string;
        iv: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT "id", "encryptedContent", "iv", "createdAt", "updatedAt"
      FROM "CampaignNote"
      WHERE "campaignId" = ${campaignId} AND "authorId" = ${auth.user.userId}
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json({
      notes: notes.map((note) => {
        try {
          return {
            id: note.id,
            content: decrypt(note.encryptedContent, note.iv),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          };
        } catch {
          return {
            id: note.id,
            content: "[Decryption failed]",
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          };
        }
      }),
    });
  } catch (error) {
    console.error("GET campaign notes error:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

/**
 * POST /api/campaigns/[id]/notes
 * Save a new encrypted note for the current user in this campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const content = String(body?.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Note content is required" }, { status: 400 });
    }
    if (content.length > 4000) {
      return NextResponse.json({ error: "Note is too long" }, { status: 400 });
    }

    const { encrypted, iv } = encrypt(content);
    const noteId = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "CampaignNote" ("id", "campaignId", "authorId", "encryptedContent", "iv", "createdAt", "updatedAt")
      VALUES (${noteId}, ${campaignId}, ${auth.user.userId}, ${encrypted}, ${iv}, NOW(), NOW())
    `;

    return NextResponse.json({
      note: {
        id: noteId,
        content,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("POST campaign note error:", error);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}

/**
 * DELETE /api/campaigns/[id]/notes?noteId=...
 * Delete a note owned by the current user.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const noteId = request.nextUrl.searchParams.get("noteId");
  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  }

  try {
    await prisma.$executeRaw`
      DELETE FROM "CampaignNote"
      WHERE "id" = ${noteId} AND "campaignId" = ${campaignId} AND "authorId" = ${auth.user.userId}
    `;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE campaign note error:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
