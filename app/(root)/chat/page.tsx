'use client';

import LinesLoader from '@/components/linesLoader';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Emojis from '@/components/ui/emoji';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CustomUser } from '@/lib/auth';
import { useZero } from '@/lib/zero/zero';
import { useQuery } from '@rocicorp/zero/react';
import { Bold, Code, Italic, List, LoaderCircleIcon, ReplyIcon, SendHorizontalIcon, SendIcon, Underline, XIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatEvent {
  id: string;
  name: string | null;
  createdAt: string;
}

interface RawZeroMessage {
  id: string;
  userId: string | null;
  eventId: string;
  text: string;
  replyToMessageId: string | null;
  isDeleted: boolean;
  createdAt: number | null;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);

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
      if (msg.eventId === currentEvent.id && msg.userId !== null) {
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
      .filter((msg) => msg.eventId === currentEvent.id && !msg.isDeleted && msg.userId !== null);
    // .sort((a, b) => a.createdAt - b.createdAt); // Already sorted by query

    const usersMap = new Map<string, RawZeroUser>(
      rawUsers
        .filter((user) => typeof user.id === 'string' && user.id !== null)
        .map(user => [user.id, user] as [string, RawZeroUser])
    );

    return messagesForCurrentEvent.map((msg) => {
      const user = usersMap.get(msg.userId as string);
      const messageForUI: MessageForUI = {
        // @ts-expect-error FML
        id: msg.id,
        userId: msg.userId === null ? 'unknown' : msg.userId,
        eventId: msg.eventId,
        text: msg.text,
        replyToMessageId: msg.replyToMessageId,
        isDeleted: !!msg.isDeleted,
        createdAt: msg.createdAt,
        deletedAt: msg.deletedAt,
        deletedByUserId: msg.deletedByUserId,
        username: user?.username || 'Unknown User',
        userImage: user?.image || null,
      };
      return messageForUI;
    });
  }, [rawMessages, rawUsers, currentEvent?.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [combinedMessages]);

  const handleFormatClick = useCallback((format: 'bold' | 'italic' | 'underline' | 'code' | 'list') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const prefix = textarea.value.substring(0, start);
    const suffix = textarea.value.substring(end);
    let newText = textarea.value;
    let cursorPosition = start;

    switch (format) {
      case 'bold':
        newText = `${prefix}**${selectedText}**${suffix}`;
        cursorPosition = start + 2 + selectedText.length;
        break;
      case 'italic':
        newText = `${prefix}*${selectedText}*${suffix}`;
        cursorPosition = start + 1 + selectedText.length;
        break;
      case 'underline':
        newText = `${prefix}<u>${selectedText}</u>${suffix}`;
        cursorPosition = start + 3 + selectedText.length;
        break;
      case 'code':
        // For inline code
        newText = `${prefix}\`${selectedText}\`${suffix}`;
        cursorPosition = start + 1 + selectedText.length;
        break;
      case 'list':
        // Simple unordered list item
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        if (start === lineStart) { // If at the start of a line
          newText = `${prefix}- ${selectedText}${suffix}`;
          cursorPosition = start + 2 + selectedText.length;
        } else { // Insert on a new line
          newText = `${prefix}\n- ${selectedText}${suffix}`;
          cursorPosition = start + 3 + selectedText.length;
        }
        break;
    }

    setNewMessageText(newText);
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = cursorPosition;
    });
  }, [setNewMessageText]);

  const handleEmojiSelect = useCallback((emojiObject: { emoji: string; label: string; }) => {
    const emoji = emojiObject.emoji;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prefix = textarea.value.substring(0, start);
    const suffix = textarea.value.substring(end);

    const newText = `${prefix}${emoji}${suffix}`;
    const newCursorPosition = start + emoji.length;

    setNewMessageText(newText);
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = newCursorPosition;
    });
  }, [setNewMessageText]);

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
    <div className="flex flex-col h-screen bg-background text-foreground">
      {errorMessages.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-2 space-y-2">
          {errorMessages.map((msg, idx) => (
            <div key={idx} className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm shadow-lg" role="alert">
              <span className="block sm:inline">{msg}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col flex-1 max-w-2xl mx-auto w-full h-full">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 bg-card/80 backdrop-blur-md border-b border-muted/30">
          <div className="grid auto-rows-min items-start gap-1">
            <h1 className="text-2xl font-bold tracking-tight">{currentEvent?.name || 'Loading Event...'}</h1>
            <p className="text-[.9rem] text-muted-foreground">Welcome to the modern chat experience.&rdquo;</p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
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
          {/* Render Grouped Messages */}
          {combinedMessages.reduce<Array<Array<MessageForUI>>>((groups, message, index) => {
            if (index === 0 || message.userId !== combinedMessages[index - 1].userId) {
              groups.push([message]);
            } else {
              groups[groups.length - 1].push(message);
            }
            return groups;
          }, []).map((messageGroup, groupIndex) => (
            <div key={groupIndex} className="flex items-start gap-3 mb-4 last:mb-0">
              {/* Avatar for the first message in the group */}
              <Avatar className="size-9 shrink-0 mt-1">
                {messageGroup[0].userImage ? (
                  <img src={messageGroup[0].userImage} alt={messageGroup[0].username} className="object-cover w-full h-full rounded-full" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-lg font-semibold bg-primary text-primary-foreground rounded-full">
                    {messageGroup[0].username?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                {/* Username and timestamp for the first message in the group */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-primary">{messageGroup[0].username}</span>
                  <span className="text-xs text-muted-foreground">
                    {messageGroup[0].createdAt !== null ? new Date(messageGroup[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                {/* Render messages within the group */}
                <div className="flex flex-col gap-1">
                  {messageGroup.map((message, messageIndex) => (
                    <div
                      key={message.id}
                      className={`py-1 px-3 rounded-lg ${message.isDeleted ? 'opacity-60 italic bg-destructive/10' : 'bg-card shadow-sm'} border border-muted/20`}
                    >
                      {message.replyToMessageId && (
                        <div className="mt-1 text-xs text-muted-foreground border-l-2 border-muted pl-2 mb-1">
                          Replying to: <span className="italic">{combinedMessages.find(m => m.id === message.replyToMessageId)?.text || 'original message'}</span>
                        </div>
                      )}
                      <ReactMarkdown
                        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                        components={{
                          p: ({ node, ...props }) => <p className="text-foreground mt-1 break-words whitespace-pre-line markdown" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc list-inside" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal list-inside" {...props} />,
                          li: ({ node, ...props }) => <li {...props} />,
                          code: ({ node, className, children, ...props }) => {
                            const CodeWrapper = 'code';
                            const codeClasses = "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm prose-code:before:hidden prose-code:after:hidden"
                            return (
                              <CodeWrapper className={codeClasses}>
                                {children}
                              </CodeWrapper>
                            );
                          },
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                      {/* Action buttons only on the last message in the group */}
                      {messageIndex === messageGroup.length - 1 && (
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
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Area and Reply Indicator */}
      </div>
      <section className="flex-shrink-0 w-full mx-auto p-2 pb-0 fixed bottom-0 ">
        {replyToId && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-7 w-full md:max-w-md sm:max-w-sm max-w-3/4 p-2 text-sm bg-card/80 text-foreground border border-muted/30 rounded-t-md flex justify-between items-center">
            <div className='flex-center-2'>
              <ReplyIcon className="w-4 h-4" /> <span className="font-medium italic">{combinedMessages.find(m => m.id === replyToId)?.text.substring(0, 20) || '...'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReplyToId(null)} className="p-1 h-auto text-xs"><XIcon className="w-4 h-4" /></Button>
          </div>
        )}
        <div className="flex border-reflect relative rounded-t-lg p-1 pb-0 backdrop-blur-lg flex-col top-0 shadow-lg border border-muted/30 lg:w-1/2 2xl:w-xl mx-auto w-[90%] md:w-2/3 sm:w-3/4 translate-y-1">
          <div className="flex relative p-1 items-start gap-2">
            <Textarea
              id="messageInput"
              ref={textareaRef}
              value={newMessageText}
              onChange={(e) => setNewMessageText(e.target.value)}
              placeholder="Type your message here..."
              className="flex-1 !bg-transparent no-scrollbar focus-visible:ring-0 focus-visible:ring-offset-0 border-none shadow-none resize-none text-base py-2 h-12"
              disabled={isSending || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e as React.FormEvent);
                }
              }}
            />
            <aside className='flex gap-1.5'>
              <Emojis />
              <Button
                type="submit"
                disabled={isSending || !newMessageText.trim() || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
                size="md-icon"
                variant={'outline'}
                className="flex-shrink-0 grid place-items-center"
              >
                {isSending && newMessageText.trim() ? (
                  <LoaderCircleIcon className="animate-spin h-4 w-4" />
                ) : (
                  <SendHorizontalIcon className="h-4 w-4" />
                )}
              </Button>
            </aside>
          </div>

          {/* Formatting, Emoji, and Preview Row */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1">
              <ToggleGroup type="multiple" size="sm" className="gap-1">
                <ToggleGroupItem value="bold" aria-label="Toggle bold" onClick={() => handleFormatClick('bold')} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground size-7 p-1">
                  <Bold className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Toggle italic" onClick={() => handleFormatClick('italic')} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground size-7 p-1">
                  <Italic className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline" aria-label="Toggle underline" onClick={() => handleFormatClick('underline')} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground size-7 p-1">
                  <Underline className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="code" aria-label="Toggle code" onClick={() => handleFormatClick('code')} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground size-7 p-1">
                  <Code className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Toggle list" onClick={() => handleFormatClick('list')} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground size-7 p-1">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {newMessageText.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPreviewDialogOpen(true)}
                className="text-xs px-2"
              >
                Preview
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* User List Dialog */}
      <Dialog open={isUserListDialogOpen} onOpenChange={setIsUserListDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Active Users ({activeUsers.length})</DialogTitle>
            <DialogDescription>Current users in this chat.</DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Markdown Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Markdown Preview</DialogTitle>
            <DialogDescription>How your message will look.</DialogDescription>
          </DialogHeader>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
              components={{
                p: ({ node, ...props }) => <p className="text-foreground break-words whitespace-pre-line" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc list-inside" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal list-inside" {...props} />,
                li: ({ node, ...props }) => <li {...props} />,
                code: ({ node, className, children, ...props }) => {
                  const CodeWrapper = 'code';
                  const codeClasses = "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm prose-code:before:hidden prose-code:after:hidden"
                  return (
                    <CodeWrapper className={codeClasses}>
                      {children}
                    </CodeWrapper>
                  );
                },
              }}
            >
              {newMessageText}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}