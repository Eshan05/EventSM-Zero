import { NextRequest, NextResponse } from 'next/server';
import { events as eventsTable } from '@/db/schema'; // Adjust path to your Drizzle schema
import { eq, desc } from 'drizzle-orm';
import { typedDb as db } from '@/lib/utils.server'; // Adjust path to your database utils
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // 1. Authenticate the user making the request
  const session = await auth(); // Get the session using the auth() helper from NextAuth.js

  if (!session?.user?.id) {
    // If no session or user ID, they are not authenticated
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Query the database for the currently active event
    // An event is considered "active" if its `isActive` flag is true.
    // If multiple events could somehow be marked active, we take the most recently created one.
    const activeEvent = await db.query.events.findFirst({
      where: eq(eventsTable.isActive, true), // Filter by isActive = true
      orderBy: [desc(eventsTable.createdAt)], // Order by creation date descending to get the latest
      columns: { // Select the columns you want to return to the client
        id: true,
        name: true,
        isActive: true, // Good to return to confirm
        createdAt: true, // Might be useful for client display
      },
    });

    // 3. Handle the case where no active event is found
    if (!activeEvent) {
      return NextResponse.json(
        { error: 'No active chat event found. An admin may need to create or activate one.' },
        { status: 404 } // Not Found
      );
    }

    // 4. Return the active event data
    // Ensure the data structure matches what your client expects (e.g., ChatEvent interface)
    return NextResponse.json({
      id: activeEvent.id,
      name: activeEvent.name,
      // isActive: activeEvent.isActive, // Client might not need this if it assumes fetched event is active
      createdAt: activeEvent.createdAt.toISOString(), // Convert Date to ISO string for JSON
    });

  } catch (error) {
    console.error("API Error: Failed to fetch active event:", error);
    // Generic error for unexpected issues
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching the active event.' },
      { status: 500 }
    );
  }
}

// You typically only need a GET request for this endpoint.
// POST, PUT, DELETE for events would be handled by admin-specific routes.