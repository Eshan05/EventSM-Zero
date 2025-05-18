import { NextRequest, NextResponse } from 'next/server';
import { events as eventsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { typedDb as db } from '@/lib/utils.server';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = params;
  if (!eventId) {
    return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
  }

  try {
    const event = await db.query.events.findFirst({
      where: eq(eventsTable.id, eventId),
      columns: {
        id: true,
        name: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error(`API Error: Failed to fetch event ${eventId}:`, error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}