import { NextResponse } from 'next/server';
import { events as eventsTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { typedDb as db } from '@/lib/utils.server';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const activeEvents = await db.query.events.findMany({
      where: eq(eventsTable.isActive, true),
      orderBy: [desc(eventsTable.createdAt)],
      columns: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json(activeEvents);

  } catch (error) {
    console.error("API Error: Failed to fetch active events:", error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}