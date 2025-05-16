'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useZero } from '@/lib/zero/zero';
import { useQuery, type QueryResult as ZeroQueryResultDetails } from '@rocicorp/zero/react';
import { CustomUser } from '@/lib/auth';
import LinesLoader from '@/components/linesLoader';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ChatEvent {
  id: string;
  name: string | null;
  createdAt: string;
}

interface RawZeroMessage {
  id: string;
  userId: string;
  eventId: string;
  text: string;
  replyToMessageId: string | null;
  isDeleted: boolean;
  createdAt: number;
  deletedAt?: number | null;
  deletedByUserId?: string | null;
}

interface RawZeroUser {
  id: string;
  username: string;
  role: string | null;
  image: string | null;
}

interface MessageForUI extends RawZeroMessage {
  username: string;
  userImage: string | null;
}


export default function ChatPage() {
  const { data: session, status: authStatus } = useSession();
  const z = useZero();
  const [currentEvent, setCurrentEvent] = useState<ChatEvent | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isUserListDialogOpen, setIsUserListDialogOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isZeroClientAvailable = !!z;

  const addErrorMessage = useCallback((message: string) => {
    setErrorMessages(prev => [...prev, message]);
    setTimeout(() => setErrorMessages(prev => prev.filter(m => m !== message)), 5000);
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetch('/api/chat/active')
        .then(async res => {
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ message: `HTTP error ${res.status}` }));
            throw new Error(errBody.message || `Failed to fetch active event: ${res.status}`);
          }
          return res.json();
        })
        .then((eventData: ChatEvent) => {
          setCurrentEvent(eventData);
        })
        .catch((err: Error) => {
          console.error("Error fetching active event:", err);
          addErrorMessage(`Error fetching active event: ${err.message}`);
        });
    }
  }, [authStatus, addErrorMessage]);

  // Correctly use useQuery:
  // It returns a readonly tuple: readonly [T[], QueryResultDetails]
  // We destructure it into const variables.
  const [rawMessages, messagesResultDetails] = useQuery(z?.query.messages.orderBy('createdAt', 'asc'));
  const [rawUsers, usersResultDetails] = useQuery(z?.query.users.orderBy('username', 'asc'));

  useEffect(() => {
    console.log('ZERO DATA: messages query update:', { data: rawMessages, details: messagesResultDetails });
  }, [rawMessages, messagesResultDetails]);

  useEffect(() => {
    console.log('ZERO DATA: users query update:', { data: rawUsers, details: usersResultDetails });
  }, [rawUsers, usersResultDetails]);

  const isMessagesDataComplete = messagesResultDetails && messagesResultDetails.type === 'complete';
  const isUsersDataComplete = usersResultDetails && usersResultDetails.type === 'complete';

  // Refined loading condition
  const isInitialDataLoading =
    (authStatus === 'authenticated' && currentEvent && z) &&
    (messagesResultDetails?.type !== 'complete' || usersResultDetails?.type !== 'complete');

  // Determine active users based on messages in the current event
  const activeUsers = useMemo((): RawZeroUser[] => {
    if (!currentEvent?.id || !rawMessages || !rawUsers) {
      return [];
    }

    const userIdsInEvent = new Set<string>();
    rawMessages.forEach(msg => {
      if (msg.eventId === currentEvent.id) {
        userIdsInEvent.add(msg.userId);
      }
    });

    const usersInEvent = rawUsers.filter(user => user.id !== null && userIdsInEvent.has(user.id));
    if (usersInEvent.length === 0) return [];
    // Sort users alphabetically by username
    usersInEvent.sort((a, b) => (a.username || '').localeCompare(b.username || ''));

    return usersInEvent.map(user => ({ ...user, id: user.id as string }));
  }, [currentEvent?.id, rawMessages, rawUsers]);

  const combinedMessages = useMemo((): readonly MessageForUI[] => { // Return readonly array
    if (!currentEvent?.id || !rawMessages || !rawUsers) {
      return [];
    }

    const messagesForCurrentEvent = rawMessages
      .filter((msg) => msg.eventId === currentEvent.id && !msg.isDeleted);
    // .sort((a, b) => a.createdAt - b.createdAt); // Already sorted by query

    const usersMap = new Map<string, RawZeroUser>(
      rawUsers
        .filter((user) => typeof user.id === 'string' && user.id !== null)
        .map(user => [user.id, user] as [string, RawZeroUser])
    );

    return messagesForCurrentEvent.map((msg): MessageForUI => {
      const user = usersMap.get(msg.userId);
      // @ts-expect-error KYS
      return {
        ...msg,
        isDeleted: !!msg.isDeleted,
        username: user?.username || 'Unknown User',
        userImage: user?.image || null,
      };
    });
  }, [rawMessages, rawUsers, currentEvent?.id, activeUsers]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [combinedMessages]);


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = newMessageText.trim();
    const eventIdToSend = currentEvent?.id;

    if (!z) {
      addErrorMessage("Chat service not ready. Please wait.");
      return;
    }
    if (!textToSend) return;
    if (!eventIdToSend) {
      addErrorMessage("No active event to send message to.");
      return;
    }
    if (isSending) return;

    setIsSending(true);
    try {
      const mutation = z.mutate.addMessage({
        text: textToSend,
        replyToId: replyToId === null ? undefined : replyToId,
        eventId: eventIdToSend,
      });

      await mutation.client
        .then(() => console.log("CLIENT: Optimistic update for addMessage completed."))
        .catch(err => {
          console.error("CLIENT: Optimistic update for addMessage FAILED:", err);
          addErrorMessage(`Local error sending message: ${err.message}`);
        });

      setNewMessageText('');
      setReplyToId(null);

      await mutation.server
        .then(() => console.log("CLIENT: Server confirmed addMessage."))
        .catch(err => {
          console.error("CLIENT: Server REJECTED addMessage:", err);
          addErrorMessage(`Server error sending message: ${err.message}`);
        });

    } catch (err: unknown) {
      let message = 'Unknown error';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      }
      console.error("Error invoking message mutation:", err);
      addErrorMessage(`Failed to send message: ${message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyClick = (messageId: string, username: string) => {
    setReplyToId(messageId);
    setNewMessageText(`@${username} `);
    document.getElementById('messageInput')?.focus();
  };

  // --- Render Loading and Error States ---
  if (authStatus === 'loading') return <LinesLoader />;
  if (authStatus === 'unauthenticated' || !session) return <div className="p-4 text-center">Please sign in to join the chat.</div>;

  if (!isZeroClientAvailable) {
    console.log("ChatPage: Zero client (z) is not available from useZero(). Waiting or error in provider.");
    return <LinesLoader />;
  }
  if (!currentEvent && authStatus === 'authenticated') {
    return <LinesLoader />;
  }
  // Show loader if Z is available, event is available, but data is still loading from Zero
  if (isInitialDataLoading) {
    return <LinesLoader />;
  }


  return (
    <main className="flex flex-col h-screen bg-background text-foreground">
      {errorMessages.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-2 space-y-2">
          {errorMessages.map((msg, idx) => (
            <div key={idx} className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm shadow-lg" role="alert">
              <span className="block sm:inline">{msg}</span>
            </div>
          ))}
        </div>
      )}
      <Card className="flex flex-col flex-1 max-w-2xl mx-auto w-full h-full shadow-xl border-muted/40">
        <CardHeader className="flex-row flex gap-4 items-center justify-between bg-card/80 sticky top-0 z-10 border-b border-muted/30 p-4">
          <section className="grid auto-rows-min grid-rows-[auto_auto] items-start gap-1">
            <CardTitle className="text-2xl font-bold tracking-tight">Chat: {currentEvent?.name || 'Loading Event...'}</CardTitle>
            <CardDescription className="text-[.9rem]">Welcome to the modern chat experience.&rdquo;</CardDescription>
          </section>
          <Badge variant={isMessagesDataComplete && isUsersDataComplete ? 'default' : 'secondary'}>
            {isMessagesDataComplete && isUsersDataComplete ? 'Synced' :
              (messagesResultDetails?.type !== 'complete' || usersResultDetails?.type !== 'complete') ? 'Error' : 'Syncing...'}
          </Badge>
          {/* Avatar Group and User List Dialog Trigger */}
          {activeUsers.length > 0 && (
            <div
              className="flex -space-x-2 overflow-hidden cursor-pointer"
              onClick={() => setIsUserListDialogOpen(true)}
              title={`View ${activeUsers.length} active user(s)`}
            >
              {activeUsers.slice(0, 3).map(user => (
                <Avatar key={user.id} className="size-8 border-2 border-background">
                  {user.image ? (
                    <img src={user.image} alt={user.username || 'User'} className="object-cover w-full h-full rounded-full" />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-sm font-semibold bg-primary text-primary-foreground rounded-full">
                      {user.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </Avatar>
              ))}
              {activeUsers.length > 3 && (
                <div className="size-8 bg-muted-foreground text-muted flex items-center justify-center rounded-full border-2 border-background text-xs font-medium">
                  +{activeUsers.length - 3}
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/40 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
          {(!isMessagesDataComplete || !isUsersDataComplete) && (
            <div className="text-center text-destructive-foreground bg-destructive/80 p-3 rounded-md">
              Error loading chat data: Data not complete or failed to load.&rdquo;
            </div>
          )}
          {combinedMessages.length === 0 && !isInitialDataLoading && isMessagesDataComplete && isUsersDataComplete && (
            <div className="text-center text-muted-foreground pt-10">
              No messages yet. Be the first to say something!
            </div>
          )}
          {combinedMessages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 p-3 rounded-2xl ${message.isDeleted ? 'opacity-60 italic bg-destructive/10' : 'bg-card shadow-sm'} border border-muted/20`}
            >
              <Avatar className="size-10 shrink-0">
                {message.userImage ? (
                  <img src={message.userImage} alt={message.username} className="object-cover w-full h-full rounded-full" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-lg font-semibold bg-primary text-primary-foreground rounded-full">
                    {message.username?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-base text-primary">{message.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {message.isDeleted && <Badge variant="destructive" className="ml-auto">Deleted</Badge>}
                </div>
                {message.replyToMessageId && (
                  <div className="mt-1 text-xs text-muted-foreground border-l-2 border-muted pl-2 mb-1">
                    Replying to: <span className="italic">&quot;{combinedMessages.find(m => m.id === message.replyToMessageId)?.text.substring(0, 30) || 'original message'}{combinedMessages.find(m => m.id === message.replyToMessageId)?.text && combinedMessages.find(m => m.id === message.replyToMessageId)!.text.length > 30 ? '...' : ''}&quot;</span>
                  </div>
                )}
                <p className="text-foreground mt-1 break-words whitespace-pre-line">{message.text}</p>
                <div className="flex gap-2 mt-2">
                  {!message.isDeleted && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-primary px-0 h-auto py-0.5"
                      onClick={() => handleReplyClick(message.id, message.username || 'User')}
                    >
                      Reply
                    </Button>
                  )}
                  {((session.user && (session.user as CustomUser).role === 'admin') || false) && !message.isDeleted && z && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-destructive px-0 h-auto py-0.5"
                      onClick={() => {
                        z.mutate.deleteMessage({ messageId: message.id });
                      }}
                    >
                      Delete (Admin)
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
          )}
          <div ref={messagesEndRef} />
        </CardContent>
        <CardFooter className="sticky bottom-0 z-10 bg-card/90 border-t border-muted/30 p-4">
          <form onSubmit={handleSendMessage} className="flex flex-col gap-2 w-full">
            {replyToId && (
              <div className="absolute bottom-full left-0 w-full p-2 text-sm bg-card/80 text-foreground border-t border-l border-r rounded-t-md border-muted/30 flex justify-between items-center">
                Replying to Message ID: {replyToId}&rdquo;
                <Button variant="ghost" size="sm" onClick={() => setReplyToId(null)} className="p-1 h-auto">
                  Clear Reply
                </Button>
              </div>
            )}
            <div className="flex gap-3 w-full">
              <Input
                id="messageInput"
                type="text"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-input border-border focus:ring-primary focus:border-primary"
                disabled={isSending || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
                autoComplete="off"
                autoFocus
              />
              <Button
                type="submit"
                disabled={isSending || !newMessageText.trim() || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
                className="px-4 py-2"
              >
                {isSending ? <LinesLoader /> : 'Send'}
              </Button>
            </div>
          </form>
        </CardFooter>
      </Card>
      {/* Simple User List Dialog (replace with Shadcn Dialog) */}
      {isUserListDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4">Active Users ({activeUsers.length})</h2>
            <div className="max-h-60 overflow-y-auto space-y-3">
              {activeUsers.map(user => (
                <div key={user.id} className="flex items-center gap-3">
                  <Avatar className="size-8">
                    {user.image ? (
                      <img src={user.image} alt={user.username || 'User'} className="object-cover w-full h-full rounded-full" />
                    ) : (
                      <span className="flex items-center justify-center w-full h-full text-sm font-semibold bg-primary text-primary-foreground rounded-full">
                        {user.username?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </Avatar>
                  <span>{user.username || 'Unknown User'}</span>
                </div>
              ))}
            </div>
            <Button className="mt-6 w-full" onClick={() => setIsUserListDialogOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </main>
  );
}