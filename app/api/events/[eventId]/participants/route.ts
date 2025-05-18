import { NextResponse } from 'next/server';
import { and, desc, eq, isNotNull, or, gt } from 'drizzle-orm';
import { auth, CustomUser } from '@/lib/auth';
import { typedDb as db } from '@/lib/utils.server';
import { eventParticipants, users } from '@/db/schema';

export async function GET(
  request: Request,
  { params }: { params: { eventId: string } }
) {
  const session = await auth();
  if (!session?.user || (session.user as CustomUser).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pM = await params;
  const { eventId } = pM;
  if (!eventId) {
    return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const participants = await db.query.eventParticipants.findMany({
      where: eq(eventParticipants.eventId, eventId),
      with: {
        user: {
          columns: { id: true, username: true, image: true },
        },
        mutedByAdmin: {
          columns: { username: true },
        },
        bannedByAdmin: {
          columns: { username: true },
        },
      },
      orderBy: [desc(eventParticipants.lastSeenAt)],
    });

    const categorizedParticipants = {
      active: participants
        .filter(p => p.lastSeenAt > fiveMinutesAgo && !p.isBanned && (!p.mutedUntil || p.mutedUntil <= new Date()))
        .map(p => ({
          id: p.user.id,
          username: p.user.username,
          image: p.user.image,
        })),
      muted: participants
        .filter(p => p.mutedUntil && p.mutedUntil > new Date())
        .map(p => ({
          id: p.user.id,
          username: p.user.username,
          image: p.user.image,
          mutedUntil: p.mutedUntil!.toISOString(),
          mutedBy: p.mutedByAdmin?.username || 'Unknown Admin',
        })),
      banned: participants
        .filter(p => p.isBanned)
        .map(p => ({
          id: p.user.id,
          username: p.user.username,
          image: p.user.image,
          bannedAt: p.bannedAt?.toISOString(),
          bannedBy: p.bannedByAdmin?.username || 'Unknown Admin',
        })),
    };

    console.log('Categorized Participants:', categorizedParticipants);
    return NextResponse.json(categorizedParticipants);

  } catch (error) {
    console.error(`API Error: Failed to fetch participants for event ${eventId}:`, error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}