'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LinesLoader from '@/components/linesLoader';
import { ArrowRightIcon } from 'lucide-react';

interface Event {
  id: string;
  name: string | null;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/events')
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch events');
        }
        return res.json();
      })
      .then((data) => {
        setEvents(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LinesLoader />;
  }

  if (error) {
    return <div className="p-4 text-center text-destructive">{error}</div>;
  }

  return (
    <div className="container mx-auto max-w-2xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Join a Chat Event</CardTitle>
          <CardDescription>Select an active event to start chatting.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <ul className="space-y-4">
              {events.map((event) => (
                <li key={event.id}>
                  <Link href={`/chat/${event.id}`} passHref>
                    <Button variant="outline" className="w-full justify-between h-14 text-lg">
                      <span>{event.name || `Event ${event.id.substring(0, 8)}`}</span>
                      <ArrowRightIcon className="h-5 w-5" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-center">
              There are no active chat events right now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}