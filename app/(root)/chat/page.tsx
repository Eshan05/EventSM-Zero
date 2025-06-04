'use client';

import LinesLoader from '@/components/linesLoader';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Emojis from '@/components/ui/emoji';
import { Separator } from '@/components/ui/separator';
import { ChatComposerEditor, type ChatComposerHandle } from '@/components/chat/chat-composer-editor';
import { CustomUser } from '@/lib/auth';
import { useZero } from '@/lib/zero/zero';
import { useQuery } from '@rocicorp/zero/react';
import { LoaderCircleIcon, ReplyIcon, SendHorizontalIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from 'sonner';
import { BlockedWordsAdminButton } from '@/components/chat/blocked-words-admin';

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
  role: 'user' | 'admin' | null;
  image: string | null;
}

interface MessageForUI extends RawZeroMessage {
  username: string;
  userImage: string | null;
}


export default function ChatPage() {
  const { data: session, status: authStatus } = useSession();
  const z = useZero();
  const isAdmin = (session?.user as CustomUser | undefined)?.role === 'admin';
  const [currentEvent, setCurrentEvent] = useState<ChatEvent | null>(null);
  const [composerMarkdown, setComposerMarkdown] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isUserListDialogOpen, setIsUserListDialogOpen] = useState(false);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);

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

  const [rawMessages, messagesResultDetails] = useQuery(
    z?.query.messages.where('eventId', '=', currentEvent?.id ?? '__none__').orderBy('createdAt', 'asc')
  );
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

  const combinedMessages = useMemo((): readonly MessageForUI[] => {
    if (!currentEvent?.id || !rawMessages || !rawUsers) return [];

    const messagesForCurrentEvent = rawMessages.filter(
      (msg): msg is typeof msg & { id: string; userId: string } =>
        msg.eventId === currentEvent.id && !msg.isDeleted && typeof msg.id === 'string' && typeof msg.userId === 'string'
    );

    const usersMap = new Map<string, RawZeroUser>(
      rawUsers
        .filter((user): user is RawZeroUser & { id: string } => typeof user.id === 'string')
        .map(user => [user.id, user] as [string, RawZeroUser])
    );

    return messagesForCurrentEvent.map((msg) => {
      const user = usersMap.get(msg.userId);
      return {
        id: msg.id,
        userId: msg.userId,
        eventId: msg.eventId,
        text: msg.text,
        replyToMessageId: msg.replyToMessageId,
        isDeleted: !!msg.isDeleted,
        createdAt: msg.createdAt,
        deletedAt: msg.deletedAt,
        deletedByUserId: msg.deletedByUserId,
        username: user?.username || 'Unknown User',
        userImage: user?.image || null,
      } satisfies MessageForUI;
    });
  }, [rawMessages, rawUsers, currentEvent?.id]);

  const messageById = useMemo(() => {
    const map = new Map<string, MessageForUI>();
    for (const m of combinedMessages) map.set(m.id, m);
    return map;
  }, [combinedMessages]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, MessageForUI[]>();
    for (const m of combinedMessages) {
      if (!m.replyToMessageId) continue;
      const arr = map.get(m.replyToMessageId) ?? [];
      arr.push(m);
      map.set(m.replyToMessageId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return map;
  }, [combinedMessages]);

  const topLevelMessages = useMemo(
    () => combinedMessages.filter(m => !m.replyToMessageId),
    [combinedMessages]
  );

  const replyCountByRootId = useMemo(() => {
    const memo = new Map<string, number>();
    const dfs = (id: string): number => {
      const existing = memo.get(id);
      if (existing !== undefined) return existing;
      const kids = childrenByParentId.get(id) ?? [];
      let count = kids.length;
      for (const k of kids) count += dfs(k.id);
      memo.set(id, count);
      return count;
    };
    for (const root of topLevelMessages) dfs(root.id);
    return memo;
  }, [childrenByParentId, topLevelMessages]);

  const [openThreadRootId, setOpenThreadRootId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const getRootId = useCallback((messageId: string) => {
    let current = messageById.get(messageId);
    const seen = new Set<string>();
    while (current?.replyToMessageId && !seen.has(current.replyToMessageId)) {
      seen.add(current.replyToMessageId);
      const parent = messageById.get(current.replyToMessageId);
      if (!parent) break;
      current = parent;
    }
    return current?.id ?? messageId;
  }, [messageById]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [combinedMessages]);

  useEffect(() => {
    if (!openThreadRootId) return;
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combinedMessages, openThreadRootId]);

  const handleEmojiSelect = useCallback((emojiObject: { emoji: string; label: string; }) => {
    composerRef.current?.insertText(emojiObject.emoji);
  }, []);

  const handleSendMessage = async () => {
    const textToSend = (composerRef.current?.getMarkdown() ?? composerMarkdown).trim();
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

      composerRef.current?.clear();
      setComposerMarkdown('');
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
    setOpenThreadRootId(getRootId(messageId));
    composerRef.current?.focus();
    composerRef.current?.insertText(`@${username} `);
  };

  const handleDelete = (messageId: string) => {
    setIsDeleting(true);
    const promise = new Promise((resolve, reject) => {
      toast('Are you sure you want to delete this message? This cannot be undone.', {
        duration: 5000,
        action: {
          label: 'Delete',
          onClick: () => {
            z.mutate.deleteMessage({ messageId: messageId });
          },
        },
        cancel: {
          label: 'Cancel',
          onClick: () => {
            reject('Deletion cancelled');
          },
        },
      });
    });

    promise.finally(() => setIsDeleting(false));
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
        <header className="-mt-1 shrink-0 border-reflect bg-transparent flex items-center justify-between p-3 pt-4 rounded-b-xl backdrop-blur-md border-b border-muted/30">
          <div className="grid auto-rows-min items-start gap-1">
            {(isMessagesDataComplete && isUsersDataComplete) ? <h1 className="text-xl line-clamp-1 font-bold tracking-tight">{currentEvent?.name || 'Loading Event...'}</h1>
              : <AnimatedShinyText className='text-xl font-bold tracking-tight'> <span>{'Syncing'}</span></AnimatedShinyText>}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <BlockedWordsAdminButton />}
            <Badge variant={isMessagesDataComplete && isUsersDataComplete ? 'success-2' : 'secondary'} className='small-caps'>
              {isMessagesDataComplete && isUsersDataComplete ? 'Synced' :
                (messagesResultDetails?.type !== 'complete' || usersResultDetails?.type !== 'complete') ? 'Error' : 'Syncing...'}
            </Badge>
            {/* Avatar Group and User List Dialog Trigger */}
            {activeUsers.length > 0 && (
              <div
                className="flex -space-x-4 overflow-hidden cursor-pointer"
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
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
          {(!isMessagesDataComplete || !isUsersDataComplete) && (
            <div className="text-center text-destructive-foreground bg-destructive/80 p-3 rounded-md">
              Error loading chat data: Data not complete or failed to load.&rdquo;
            </div>
          )}
          {topLevelMessages.length === 0 && !isInitialDataLoading && isMessagesDataComplete && isUsersDataComplete && (
            <div className="text-center text-muted-foreground pt-10">
              No messages yet. Be the first to say something!
            </div>
          )}
          {topLevelMessages.map((message) => {
            const directReplies = childrenByParentId.get(message.id) ?? [];
            const previewReplies = directReplies.slice(0, 2);
            const totalReplies = replyCountByRootId.get(message.id) ?? 0;
            const moreCount = Math.max(0, totalReplies - previewReplies.length);

            return (
              <div key={message.id} className="flex items-start gap-2 mb-2 last:mb-0">
                <Avatar className="size-8 shrink-0 mt-1">
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
                    <span className="font-semibold text-sm text-primary">{message.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {message.createdAt !== null ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <ContextMenu
                    onOpenChange={(isOpen) => {
                      if (isOpen) setContextMenuMessageId(message.id);
                      else setContextMenuMessageId(null);
                    }}
                  >
                    <ContextMenuTrigger asChild>
                      <div
                        className={`px-2 py-px rounded-sm transition-colors hover:bg-secondary
                          border border-muted/20
                          ${contextMenuMessageId === message.id ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
                        `}
                      >
                        <MarkdownRenderer markdown={message.text} />
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-64">
                      <ContextMenuItem className="px-2 text-xs text-muted-foreground">
                        <SendHorizontalIcon />{message.createdAt ? new Date(message.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'medium'
                        }) : 'N/A'}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleReplyClick(message.id, message.username || 'User')}>
                        <ReplyIcon />Reply
                      </ContextMenuItem>
                      {((session.user && (session.user as CustomUser).role === 'admin') || false) && z && (
                        <ContextMenuItem className="text-destructive" onClick={() => handleDelete(message.id)}>
                          <Trash2Icon className='text-destructive' />Delete Message
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>

                  {totalReplies > 0 && (
                    <div className="mt-2 ml-4 border-l border-muted/40 pl-3 space-y-1">
                      {previewReplies.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors line-clamp-1"
                          onClick={() => setOpenThreadRootId(message.id)}
                        >
                          <span className="font-medium text-foreground/90">{r.username}:</span> {r.text}
                        </button>
                      ))}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setOpenThreadRootId(message.id)}
                        >
                          View thread ({totalReplies} repl{totalReplies === 1 ? 'y' : 'ies'})
                        </Button>
                        {moreCount > 0 && (
                          <span className="text-xs text-muted-foreground">+{moreCount} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Area and Reply Indicator */}
      </div>
      <section className="fixed inset-x-0 bottom-0 shrink-0 w-full mx-auto p-2 pb-0">
        {replyToId && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-7 w-full md:max-w-md sm:max-w-sm max-w-[75%] p-2 text-sm bg-card/80 text-foreground border border-muted/30 rounded-t-md flex justify-between items-center">
            <div className='flex-center-2'>
              <ReplyIcon className="w-4 h-4" /> <span className="font-medium italic">{combinedMessages.find(m => m.id === replyToId)?.text.substring(0, 20) || '...'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReplyToId(null)} className="p-1 h-auto text-xs"><XIcon className="w-4 h-4" /></Button>
          </div>
        )}
        <div className="flex border-reflect relative rounded-t-lg p-1 pb-0 backdrop-blur-lg flex-col top-0 shadow-lg border border-muted/30 mx-auto w-full max-w-3xl translate-y-1">
          <div className="flex relative p-1 items-start gap-2">
            <ChatComposerEditor
              ref={composerRef}
              placeholder="Type your message here..."
              className="flex-1 min-w-0"
              disabled={
                isSending ||
                !currentEvent?.id ||
                !isZeroClientAvailable ||
                ((!isMessagesDataComplete || !isUsersDataComplete) && combinedMessages.length > 0)
              }
              onMarkdownChange={setComposerMarkdown}
              onSubmit={() => {
                void handleSendMessage();
              }}
            />
            <aside className='flex gap-1.5'>
              <Emojis onEmojiSelectAction={handleEmojiSelect} />
              {composerMarkdown.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="md-icon"
                  onClick={() => setIsPreviewDialogOpen(true)}
                  className="shrink-0 grid place-items-center"
                >
                  <span className="text-xs">Preview</span>
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  void handleSendMessage();
                }}
                disabled={
                  isSending ||
                  !composerMarkdown.trim() ||
                  !currentEvent?.id ||
                  !isZeroClientAvailable ||
                  ((!isMessagesDataComplete || !isUsersDataComplete) && combinedMessages.length > 0)
                }
                size="md-icon"
                variant={'outline'}
                className="shrink-0 grid place-items-center"
              >
                {isSending && composerMarkdown.trim() ? (
                  <LoaderCircleIcon className="animate-spin h-4 w-4" />
                ) : (
                  <SendHorizontalIcon className="h-4 w-4" />
                )}
              </Button>
            </aside>
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
          <MarkdownRenderer
            markdown={composerMarkdown}
            className="max-h-[60vh] overflow-y-auto pr-2"
          />
        </DialogContent>
      </Dialog>

      {/* Thread Dialog */}
      <Dialog
        open={openThreadRootId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenThreadRootId(null);
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Thread</DialogTitle>
            <DialogDescription>Replies in this thread.</DialogDescription>
          </DialogHeader>
          {openThreadRootId && (
            <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-3">
              {(() => {
                const root = messageById.get(openThreadRootId);
                if (!root) return <div className="text-sm text-muted-foreground">Loading thread…</div>;

                const renderNode = (node: MessageForUI, depth: number): ReactElement => {
                  const kids = childrenByParentId.get(node.id) ?? [];
                  return (
                    <div key={node.id} style={{ paddingLeft: depth * 14 }}>
                      <div className="flex items-start gap-2">
                        <Avatar className="size-7 shrink-0 mt-1">
                          {node.userImage ? (
                            <img src={node.userImage} alt={node.username} className="object-cover w-full h-full rounded-full" />
                          ) : (
                            <span className="flex items-center justify-center w-full h-full text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                              {node.username?.[0]?.toUpperCase() || '?'}
                            </span>
                          )}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-primary">{node.username}</span>
                            <span className="text-xs text-muted-foreground">
                              {node.createdAt !== null ? new Date(node.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <div className="mt-1 rounded border border-muted/20 px-2 py-1 hover:bg-secondary transition-colors">
                                <MarkdownRenderer markdown={node.text} />
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56">
                              <ContextMenuItem onClick={() => handleReplyClick(node.id, node.username || 'User')}>
                                <ReplyIcon />Reply
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </div>
                      </div>
                      {kids.length > 0 && (
                        <div className="mt-2 space-y-3">
                          {kids.map(k => renderNode(k, depth + 1))}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {renderNode(root, 0)}
                    <div ref={threadEndRef} />
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}