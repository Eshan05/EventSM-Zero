'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function CreateEventPage() {
  const [eventName, setEventName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!eventName.trim()) {
      alert('Event name cannot be empty.');
      return;
    }

    setIsLoading(true);
    try {
      // Assuming an API endpoint /api/admin/events/create exists
      const response = await fetch('/api/admin/events/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: eventName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create event');
      }

      const newEvent = await response.json();
      alert(`Event '${newEvent.name}' created successfully.`);
      setEventName('');
      // Optionally redirect to a list of events or the new event page
      // router.push(`/admin/events/${newEvent.id}`);

    } catch (error) {
      console.error('Error creating event:', error);
      alert(`Error creating event: ${error instanceof Error ? error.message : 'An unexpected error occurred.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create New Chat Event</CardTitle>
          <CardDescription>Fill in the details to create a new chat event.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateEvent} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="eventName">Event Name</Label>
              <Input
                id="eventName"
                type="text"
                placeholder="e.g., Weekly Team Sync"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {/* Add more fields here if needed, e.g., description, start time */}
          </form>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" form="createEventForm" disabled={isLoading || !eventName.trim()}>
            {isLoading ? 'Creating...' : 'Create Event'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
} 