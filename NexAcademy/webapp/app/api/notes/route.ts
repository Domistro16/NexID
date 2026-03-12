import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

// Schema for saving notes
const saveNoteSchema = z.object({
    lessonId: z.string().min(1, 'Lesson ID required'),
    content: z.string(), // Can be empty string to clear notes
});

// GET /api/notes?lessonId=xxx - Get note for current user and lesson
export async function GET(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(request.url);
        const lessonId = searchParams.get('lessonId');

        if (!lessonId) {
            return NextResponse.json({ error: 'lessonId is required' }, { status: 400 });
        }

        const note = await prisma.userNote.findUnique({
            where: {
                userId_lessonId: {
                    userId: user.userId,
                    lessonId,
                },
            },
            select: {
                id: true,
                content: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            note: note || null,
        });
    } catch (error) {
        console.error('Error fetching note:', error);
        return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 });
    }
}

// PUT /api/notes - Save or update note
export async function PUT(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const body = await request.json();
        const { lessonId, content } = saveNoteSchema.parse(body);

        // Verify lesson exists
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true },
        });

        if (!lesson) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
        }

        // Upsert the note (create if doesn't exist, update if it does)
        const note = await prisma.userNote.upsert({
            where: {
                userId_lessonId: {
                    userId: user.userId,
                    lessonId,
                },
            },
            update: {
                content,
            },
            create: {
                userId: user.userId,
                lessonId,
                content,
            },
            select: {
                id: true,
                content: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            success: true,
            note,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        console.error('Error saving note:', error);
        return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
    }
}
