import { NextRequest, NextResponse } from 'next/server';
import { events as eventsTable } from '@/db/schema';
import { typedDb as db } from '@/lib/utils.server';
import { eq } from 'drizzle-orm';
import { auth, CustomSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await auth();

  // Authorization: Only admins can create events
  if (!session?.user || (session.user as CustomSession["user"]).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
  }

  try {
    await db.update(eventsTable).set({ isActive: false }).where(eq(eventsTable.isActive, true));
    const newEvent = await db.insert(eventsTable).values({
      name: name,
      isActive: true,
      codeName: `event-${Date.now()}`,
      description: `Event created at ${new Date().toISOString()}`,
    }).returning({ id: eventsTable.id, name: eventsTable.name, isActive: eventsTable.isActive });

    if (!newEvent[0]) {
      throw new Error("Failed to create event in database.");
    }
    return NextResponse.json(newEvent[0], { status: 201 });

  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}