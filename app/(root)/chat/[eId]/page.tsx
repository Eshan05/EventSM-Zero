'use client';

import { BannedList, MutedList, ParticipantList } from '@/app/(root)/chat/[eId]/participants';
import LinesLoader from '@/components/linesLoader';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Credenza,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
  CredenzaBody,
} from "@/components/ui/credenza";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LiaUsersSolid } from "react-icons/lia";
import { BiUserVoice } from "react-icons/bi";
import Emojis from '@/components/ui/emoji';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatComposerEditor, type ChatComposerHandle } from '@/components/chat/chat-composer-editor';
import { CustomUser } from '@/lib/auth';
import { useZero } from '@/lib/zero/zero';
import { ActiveParticipant, BannedParticipant, CategorizedParticipants, MutedParticipant } from '@/types/participants';
import { useQuery } from '@rocicorp/zero/react';
import { formatDistanceToNow } from 'date-fns';
import { BanIcon, ClockIcon, EyeIcon, LoaderCircleIcon, MicOffIcon, ReplyIcon, SendHorizontalIcon, TimerIcon, Trash2Icon, UserIcon, XIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { toast } from 'sonner';
import { BlockedWordsAdminButton } from '@/components/chat/blocked-words-admin';
import { useIsMobile } from '@/hooks/use-mobile';
import Link from 'next/link';
import { MenuIcon, MoreVerticalIcon } from 'lucide-react';

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

export default function ChatPage({ params }: { params: Promise<{ eId: string }> }) {
  const { eId } = use(params);
  const { data: session, status: authStatus } = useSession();
  const z = useZero();
  const isMobile = useIsMobile();

  const composerRef = useRef<ChatComposerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentEvent, setCurrentEvent] = useState<ChatEvent | null>(null);
  const [composerMarkdown, setComposerMarkdown] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isUserListDialogOpen, setIsUserListDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);

  const [userToMute, setUserToMute] = useState<{ id: string; username: string } | null>(null);
  const [isMuteDialogOpen, setIsMuteDialogOpen] = useState(false);
  const [userToBan, setUserToBan] = useState<{ id: string; username: string } | null>(null);
  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [isParticipantsDialogOpen, setIsParticipantsDialogOpen] = useState(false);

  // 👇 ADD STATE FOR SLOW MODE UI 👇
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [isSlowModeUserDialogOpen, setIsSlowModeUserDialogOpen] = useState(false);
  const [userForSlowMode, setUserForSlowMode] = useState<{ id: string, username: string } | null>(null);
  const [userSlowModeSeconds, setUserSlowModeSeconds] = useState<string>('5');

  const isZeroClientAvailable = !!z;
  const isAdmin = (session?.user as CustomUser)?.role === 'admin';

  const addErrorMessage = useCallback((message: string) => {
    setErrorMessages(prev => [...prev, message]);
    setTimeout(() => setErrorMessages(prev => prev.filter(m => m !== message)), 5000);
  }, []);

  const onMute = useCallback((userId: string, username: string) => {
    setIsParticipantsDialogOpen(false); // Close participant list
    setTimeout(() => { // Use timeout to prevent dialog animation clash
      setUserToMute({ id: userId, username });
      setIsMuteDialogOpen(true);
    }, 150);
  }, []);

  const onBan = useCallback((userId: string, username: string) => {
    setIsParticipantsDialogOpen(false);
    setTimeout(() => {
      setUserToBan({ id: userId, username });
      setIsBanDialogOpen(true);
    }, 150);
  }, []);

  const onUnmute = useCallback((userId: string, username: string) => {
    const promise = z.mutate.unmuteUser({ userId, eventId: eId }).server;
    toast.promise(promise, {
      loading: `Unmuting ${username}...`,
      success: () => `${username} has been unmuted.`,
      error: (err) => `Failed to unmute: ${err.message}`,
    });
  }, [z, eId]);

  const onUnban = useCallback((userId: string, username: string) => {
    const promise = z.mutate.unbanUser({ userId, eventId: eId }).server;
    toast.promise(promise, {
      loading: `Unbanning ${username}...`,
      success: () => `${username} has been unbanned.`,
      error: (err) => `Failed to unban: ${err.message}`,
    });
  }, [z, eId]);

  const handleMuteConfirm = useCallback(async (durationInSeconds: number) => {
    if (!z || !userToMute) return;
    setIsMuteDialogOpen(false);

    const promise = z.mutate.muteUser({
      userId: userToMute.id,
      eventId: eId,
      durationInSeconds: durationInSeconds,
    }).server;

    toast.promise(promise, {
      loading: `Muting ${userToMute.username}...`,
      success: () => {
        setUserToMute(null);
        return `${userToMute.username} has been muted in this event.`;
      },
      error: (err) => {
        setUserToMute(null);
        return `Failed to mute: ${err.message}`;
      },
    });
  }, [z, userToMute, eId]);

  const handleBanConfirm = useCallback(async () => {
    if (!z || !userToBan) return;
    setIsBanDialogOpen(false);

    const promise = z.mutate.banUser({
      userId: userToBan.id,
      eventId: eId,
    }).server;

    toast.promise(promise, {
      loading: `Banning ${userToBan.username}...`,
      success: () => {
        setUserToBan(null);
        return `${userToBan.username} has been banned from this event.`;
      },
      error: (err) => {
        setUserToBan(null);
        return `Failed to ban: ${err.message}`;
      },
    });
  }, [z, userToBan, eId]);

  const handleSetEventSlowMode = (seconds: number) => {
    toast.promise(z.mutate.setEventSlowMode({ eventId: eId, seconds }).server, {
      loading: 'Setting slow mode...',
      success: `Event slow mode set to ${seconds}s.`,
      error: (err) => `Failed: ${err.message}`,
    });
  };

  // Handlers for setting per-user slow mode
  const openUserSlowModeDialog = (userId: string, username: string) => {
    setUserForSlowMode({ id: userId, username });
    setIsSlowModeUserDialogOpen(true);
  }

  const handleSetUserSlowMode = () => {
    if (!userForSlowMode) return;
    const seconds = parseInt(userSlowModeSeconds, 10);
    if (isNaN(seconds) || seconds < 0) {
      toast.error('Please enter a valid non-negative number.');
      return;
    }

    toast.promise(z.mutate.setUserSlowMode({ eventId: eId, userId: userForSlowMode.id, seconds }).server, {
      loading: `Setting cooldown for ${userForSlowMode.username}...`,
      success: `Custom cooldown set to ${seconds}s.`,
      error: (err) => `Failed: ${err.message}`,
    });
    setIsSlowModeUserDialogOpen(false);
  };

  useEffect(() => {
    if (authStatus === 'authenticated' && eId) {
      fetch(`/api/events/${eId}`)
        .then(async res => {
          if (res.status === 403) {
            setIsBanned(true);
            return null;
          }
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ message: `HTTP error ${res.status}` }));
            throw new Error(errBody.message || `Failed to fetch event details: ${res.status}`);
          }
          return res.json();
        })
        .then(eventData => {
          setCurrentEvent(eventData);
        })
        .catch((err: Error) => {
          console.error(`Error fetching event ${eId}:`, err);
          addErrorMessage(`Error loading event: ${err.message}`);
        });
    }
  }, [authStatus, eId, addErrorMessage]);

  const [rawMessages, messagesResultDetails] = useQuery(
    z?.query.messages.where('eventId', '=', eId).orderBy('createdAt', 'asc')
  );
  const [rawUsers, usersResultDetails] = useQuery(z?.query.users.orderBy('username', 'asc'));
  const [participantsStatus, participantsResultDetails] = useQuery(
    z?.query.eventParticipants.where('eventId', '=', eId)
  );

  const [eventDetails] = useQuery(z?.query.events.where('id', '=', eId));
  const eventSlowMode = eventDetails?.[0]?.slowModeSeconds ?? 0;

  useEffect(() => {
    console.log('ZERO DATA: messages query update:', { data: rawMessages, details: messagesResultDetails });
    console.log('ZERO DATA: users query update:', { data: rawUsers, details: usersResultDetails });
  }, [rawMessages, messagesResultDetails, rawUsers, usersResultDetails]);

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownEndsAt(null);
        setCooldownTime(0);
      } else {
        setCooldownTime(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEndsAt]);

  const userStatusMap = useMemo(() => {
    const map = new Map<string, { isBanned: boolean; mutedUntil: number | null }>();
    if (!participantsStatus) return map;
    for (const p of participantsStatus) {
      map.set(p.userId, { isBanned: p.isBanned ?? false, mutedUntil: p.mutedUntil ?? null });
    }
    return map;
  }, [participantsStatus]);

  const isMessagesDataComplete = messagesResultDetails && messagesResultDetails.type === 'complete';
  const isUsersDataComplete = usersResultDetails && usersResultDetails.type === 'complete';

  const categorizedParticipants = useMemo(() => {
    const initial: CategorizedParticipants = { active: [], all: [], muted: [], banned: [] };
    if (!participantsStatus || !rawUsers) return initial;

    const usersMap = new Map<string, { username: string; image: string | null }>();
    for (const user of rawUsers) {
      usersMap.set(user.id!, { username: user.username, image: user.image });
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const result: CategorizedParticipants = { active: [], all: [], muted: [], banned: [] };

    for (const p of participantsStatus) {
      const user = usersMap.get(p.userId);
      if (!user) continue;

      const isActive = (p.lastSeenAt ?? 0) > fiveMinutesAgo;

      const participantData = {
        id: p.userId,
        username: user.username,
        image: user.image,
        isActive: isActive,
      };

      if (p.isBanned) {
        const bannedByAdmin = usersMap.get(p.bannedByUserId || '');
        result.banned.push({
          ...participantData,
          bannedAt: p.bannedAt ? new Date(p.bannedAt).toISOString() : 'Unknown',
          bannedBy: bannedByAdmin?.username || 'Unknown',
        });
        continue;
      }

      if (p.mutedUntil && p.mutedUntil > Date.now()) {
        const mutedByAdmin = usersMap.get(p.mutedByUserId || '');
        result.muted.push({
          ...participantData,
          mutedUntil: p.mutedUntil ? new Date(p.mutedUntil).toISOString() : 'Unknown',
          mutedBy: mutedByAdmin?.username || 'Unknown',
        });
        // Muted users are not in 'active' or 'all' lists
      } else {
        // If not muted or banned, add to the 'All' list
        result.all.push(participantData);
        // If also active, add to the 'Active' list
        if (isActive) {
          result.active.push(participantData);
        }
      }
    }

    result.active.sort((a, b) => a.username.localeCompare(b.username));
    result.all.sort((a, b) => a.username.localeCompare(b.username));
    result.muted.sort((a, b) => a.username.localeCompare(b.username));
    result.banned.sort((a, b) => a.username.localeCompare(b.username));

    return result;
  }, [participantsStatus, rawUsers]);

  // Refined loading condition
  const isInitialDataLoading =
    (authStatus === 'authenticated' && currentEvent && z) &&
    (messagesResultDetails?.type !== 'complete' || usersResultDetails?.type !== 'complete');

  const isParticipantListLoading = (participantsResultDetails?.type !== 'complete');

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

  const handleMuteClick = (userId: string, username: string) => {
    if (!userId) {
      toast.error("Cannot mute user: User ID is missing.");
      return;
    }
    setUserToMute({ id: userId, username });
    setIsMuteDialogOpen(true);
  };

  const handleBanClick = (userId: string, username: string) => {
    if (!userId) {
      toast.error("Cannot ban user: User ID is missing.");
      return;
    }
    setUserToBan({ id: userId, username });
    setIsBanDialogOpen(true);
  };


  const handleEmojiSelect = useCallback((emojiObject: { emoji: string; label: string; }) => {
    composerRef.current?.insertText(emojiObject.emoji);
  }, []);

  const handleOpenParticipantDialog = () => {
    setIsUserListDialogOpen(true);
  };

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
        .then(() => {
          console.log("CLIENT: Server confirmed addMessage.");
          const userStatus = participantsStatus?.find(p => p.userId === session?.user?.id);
          const userCooldown = userStatus?.customCooldownSeconds ?? -1;
          const effectiveCooldown = userCooldown >= 0 ? userCooldown : eventSlowMode;
          if (effectiveCooldown > 0) {
            setCooldownEndsAt(Date.now() + effectiveCooldown * 1000);
            setCooldownTime(effectiveCooldown);
          }
        })
        .catch((err: Error) => {
          console.error("CLIENT: Server REJECTED addMessage:", err);
          addErrorMessage(`Server error sending message: ${err.message}`);

          // If the server rejects because of slow mode, re-sync the client timer
          const slowModeMatch = err.message.match(/Please wait (\d+)s/);
          if (slowModeMatch) {
            const remainingSeconds = parseInt(slowModeMatch[1], 10);
            setCooldownEndsAt(Date.now() + remainingSeconds * 1000);
            setCooldownTime(remainingSeconds);
          }
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
    composerRef.current?.clear();
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
  if (isBanned) {
    return <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
      <div className="text-center p-8 border border-destructive/50 bg-destructive/10 rounded-lg">
        <BanIcon className="mx-auto h-16 w-16 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">You have been banned from this chat event.</p>
      </div>
    </div>
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
      <div className={`flex flex-col flex-1 ${isMobile ? 'max-w-full' : 'max-w-2xl'} mx-auto w-full h-full`}>
        {/* Header */}
        <header className="-mt-1 shrink-0 border-reflect bg-background/60 flex items-center justify-between py-1 px-4 rounded-b-xl backdrop-blur-md border-b border-muted/20 z-20 sticky top-0">
          <div className="flex flex-col min-w-0">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/events" className="text-xs font-semibold opacity-70">Events</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-sm font-bold truncate max-w-[150px]">
                    {isMessagesDataComplete && isUsersDataComplete ? currentEvent?.name : 'Syncing...'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {!isMobile && isAdmin && (
              <div className="flex items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="md-icon">
                      <TimerIcon className={`size-4 ${eventSlowMode > 0 ? 'text-yellow-500' : ''}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium px-2">Event Slow Mode</h4>
                      <div className="grid grid-cols-3 gap-1">
                        {[0, 5, 15, 30, 60, 300].map(sec => (
                          <Button key={sec} variant={eventSlowMode === sec ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => handleSetEventSlowMode(sec)}>
                            {sec === 0 ? 'Off' : `${sec}s`}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <BlockedWordsAdminButton />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge variant={isMessagesDataComplete && isUsersDataComplete ? 'success-2' : 'secondary'} className="text-tiny h-5 px-1.5 font-medium">
                {isMessagesDataComplete && isUsersDataComplete ? 'Live' : 'Syncing'}
              </Badge>

              {/* Avatar Group */}
              {activeUsers.length > 0 && (
                <div
                  className="flex -space-x-3 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={handleOpenParticipantDialog}
                >
                  {activeUsers.slice(0, 3).map(user => (
                    <Avatar key={user.id} className="size-7 border-2 border-background ring-1 ring-muted/20">
                      {user.image ? (
                        <img src={user.image} alt={user.username || 'User'} className="object-cover w-full h-full rounded-full" />
                      ) : (
                        <span className="flex items-center justify-center w-full h-full text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                    </Avatar>
                  ))}
                  {activeUsers.length > 3 && (
                    <div className="size-7 bg-muted text-muted-foreground flex items-center justify-center rounded-full border-2 border-background text-[10px] font-bold">
                      +{activeUsers.length - 3}
                    </div>
                  )}
                </div>
              )}

              {isMobile && isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreVerticalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Admin Tools</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <TimerIcon className="size-4 mr-2" />
                      <span>Slow Mode</span>
                      <div className="ml-auto flex gap-1">
                        {[0, 5, 15].map(sec => (
                          <Button
                            key={sec}
                            variant={eventSlowMode === sec ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 w-8 p-0 text-[10px]"
                            onClick={() => handleSetEventSlowMode(sec)}
                          >
                            {sec}s
                          </Button>
                        ))}
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      {/* We need to trigger the BlockedWordsAdminButton logic here, or just render it as an item. 
                          The button itself is a component, so we can't easily nest it perfectly without refactoring it.
                          But let's keep it simple for now. */}
                      <div className="p-0">
                        <BlockedWordsAdminButton />
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-2' : 'p-4'} pb-28 ${isMobile ? 'space-y-2' : 'space-y-4'} no-scrollbar scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent`}>
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
              <div key={message.id} className="flex items-start gap-2 mb-1 last:mb-0 group">
                <Avatar className={`${isMobile ? 'size-7' : 'size-8'} shrink-0 mt-0.5`}>
                  {message.userImage ? (
                    <img src={message.userImage} alt={message.username} className="object-cover w-full h-full rounded-full" />
                  ) : (
                    <span className={`flex items-center justify-center w-full h-full ${isMobile ? 'text-sm' : 'text-lg'} font-semibold bg-primary text-primary-foreground rounded-full`}>
                      {message.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-xs text-primary/90">{message.username}</span>
                    <span className="text-tiny text-muted-foreground opacity-70">
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
                        className={`px-2 py-0.5 rounded-md transition-all
                          ${message.isDeleted ? 'opacity-50 italic bg-destructive/5 text-muted-foreground line-through' : 'bg-secondary/30 border border-muted/10'}
                          group-hover:border-muted/30 group-hover:bg-secondary/40
                          ${contextMenuMessageId === message.id ? 'ring-2 ring-primary/30 bg-secondary/50 border-primary/20' : ''}
                        `}
                      >
                        {message.isDeleted ? (
                          <span className="text-xs">[Message deleted]</span>
                        ) : (
                          <div className="text-sm prose-sm dark:prose-invert max-w-none">
                            <MarkdownRenderer markdown={message.text} />
                          </div>
                        )}
                      </div>
                    </ContextMenuTrigger>

                    {!message.isDeleted && (
                      <ContextMenuContent className="w-56">
                        <ContextMenuItem className="px-2 text-tiny text-muted-foreground">
                          <ClockIcon className="size-3 mr-2" />
                          {message.createdAt ? new Date(message.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'medium'
                          }) : 'N/A'}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => handleReplyClick(message.id, message.username || 'User')}>
                          <ReplyIcon className="size-4" />Reply
                        </ContextMenuItem>
                        {isAdmin && !message.isDeleted && z && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuLabel className="text-tiny font-medium opacity-50">Admin Actions</ContextMenuLabel>
                            <ContextMenuItem
                              className="text-yellow-500 focus:text-yellow-600 focus:bg-yellow-500/10"
                              onSelect={() => handleMuteClick(message.userId!, message.username)}
                            >
                              <MicOffIcon className="size-4" />
                              <span>Mute User</span>
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-blue-500 focus:text-blue-600 focus:bg-blue-500/10"
                              onSelect={() => openUserSlowModeDialog(message.userId!, message.username)}
                            >
                              <TimerIcon className="size-4" />
                              <span>Set Slow Mode</span>
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              onSelect={() => handleBanClick(message.userId!, message.username)}
                            >
                              <BanIcon className="size-4" />
                              <span>Ban User</span>
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              onSelect={() => handleDelete(message.id)}
                            >
                              <Trash2Icon className="size-4" />
                              <span>Delete Message</span>
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    )}
                  </ContextMenu>

                  {totalReplies > 0 && (
                    <div className="mt-1 ml-3 border-l-2 border-muted/20 pl-2 space-y-0.5">
                      {previewReplies.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors line-clamp-1"
                          onClick={() => setOpenThreadRootId(message.id)}
                        >
                          <span className="font-bold text-foreground/80">{r.username}:</span> {r.text}
                        </button>
                      ))}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-tiny font-bold text-primary hover:bg-primary/10"
                          onClick={() => setOpenThreadRootId(message.id)}
                        >
                          {totalReplies} repl{totalReplies === 1 ? 'y' : 'ies'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Dialogs */}
        <Credenza open={isMuteDialogOpen} onOpenChange={setIsMuteDialogOpen}>
          <CredenzaContent>
            <CredenzaHeader>
              <CredenzaTitle>Mute {userToMute?.username || 'User'}</CredenzaTitle>
              <CredenzaDescription>
                Select a duration to prevent this user from sending messages in this event.
              </CredenzaDescription>
            </CredenzaHeader>
            <CredenzaBody className="grid grid-cols-2 gap-2 py-4">
              <Button variant="outline" onClick={() => handleMuteConfirm(60)}>1 Minute</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(300)}>5 Minutes</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(900)}>15 Minutes</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(3600)}>1 Hour</Button>
              <Button variant="destructive" className="col-span-2" onClick={() => handleMuteConfirm(86400)}>24 Hours</Button>
            </CredenzaBody>
            <CredenzaFooter>
              <Button variant="ghost" onClick={() => setIsMuteDialogOpen(false)}>Cancel</Button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>

        <Credenza open={isBanDialogOpen} onOpenChange={setIsBanDialogOpen}>
          <CredenzaContent>
            <CredenzaHeader>
              <CredenzaTitle>Ban {userToBan?.username || 'User'}</CredenzaTitle>
              <CredenzaDescription>
                Are you sure you want to ban this user? They will be unable to send or see messages.
              </CredenzaDescription>
            </CredenzaHeader>
            <CredenzaFooter className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setIsBanDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleBanConfirm}>Confirm Ban</Button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>

        <Credenza open={isUserListDialogOpen} onOpenChange={setIsUserListDialogOpen}>
          <CredenzaContent className="max-h-[85vh]">
            <CredenzaHeader>
              <CredenzaTitle>Event Participants</CredenzaTitle>
              <CredenzaDescription>
                {isAdmin ? 'Manage and view all participants.' : 'Users currently active in this chat.'}
              </CredenzaDescription>
            </CredenzaHeader>
            <CredenzaBody className="no-scrollbar overflow-y-auto">
              {isAdmin ? (
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 items-center mb-4 h-9">
                    <TabsTrigger value="all" className="gap-1.5 focus-visible:ring-0">
                      <LiaUsersSolid className="size-4" />
                      <Badge variant='outline' className='rounded-full h-4 min-w-4 p-0 flex items-center justify-center text-tiny'>{categorizedParticipants.all.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="active" className="gap-1.5 focus-visible:ring-0">
                      <BiUserVoice className="size-4" />
                      <Badge variant='success-2' className='rounded-full h-4 min-w-4 p-0 flex items-center justify-center text-tiny'>{categorizedParticipants.active.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="muted" className="gap-1.5 focus-visible:ring-0">
                      <MicOffIcon className="size-4" />
                      <Badge variant='yellow' className='rounded-full h-4 min-w-4 p-0 flex items-center justify-center text-tiny'>{categorizedParticipants.muted.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="banned" className="gap-1.5 focus-visible:ring-0">
                      <BanIcon className="size-4" />
                      <Badge variant='destructive-2' className='rounded-full h-4 min-w-4 p-0 flex items-center justify-center text-tiny'>{categorizedParticipants.banned.length}</Badge>
                    </TabsTrigger>
                  </TabsList>
                  {isParticipantListLoading ? <LinesLoader /> : (
                    <div className="max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
                      <TabsContent value="all" className="mt-0">
                        <ParticipantList users={categorizedParticipants.all ?? []} onMute={onMute} onBan={onBan} onSetSlowMode={openUserSlowModeDialog} />
                      </TabsContent>
                      <TabsContent value="active" className="mt-0">
                        <ParticipantList users={categorizedParticipants.active ?? []} onMute={onMute} onBan={onBan} onSetSlowMode={openUserSlowModeDialog} />
                      </TabsContent>
                      <TabsContent value="muted" className="mt-0">
                        <MutedList users={categorizedParticipants?.muted ?? []} onUnmute={onUnmute} onMute={onMute} />
                      </TabsContent>
                      <TabsContent value="banned" className="mt-0">
                        <BannedList users={categorizedParticipants?.banned ?? []} onUnban={onUnban} />
                      </TabsContent>
                    </div>
                  )}
                </Tabs>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <ParticipantList users={activeUsers} />
                </div>
              )}
            </CredenzaBody>
            <CredenzaFooter>
              <Button variant="outline" className="w-full" onClick={() => setIsUserListDialogOpen(false)}>Close</Button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>
      </div>
      <section className={`fixed inset-x-0 bottom-0 shrink-0 w-full mx-auto ${isMobile ? 'p-1 pb-1' : 'p-2'}`}>
        {replyToId && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-7 w-full md:max-w-md sm:max-w-sm max-w-[90%] p-1 px-3 text-[11px] bg-background/90 backdrop-blur-md text-foreground border border-muted/20 border-b-0 rounded-t-lg flex justify-between items-center z-10">
            <div className='flex items-center gap-2 overflow-hidden'>
              <ReplyIcon className="size-3 shrink-0 text-primary" />
              <span className="font-bold opacity-60">Replying to:</span>
              <span className="font-medium italic truncate">{combinedMessages.find(m => m.id === replyToId)?.text || '...'}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setReplyToId(null)} className="size-5 hover:bg-destructive/10 hover:text-destructive"><XIcon className="size-3" /></Button>
          </div>
        )}
        <div className="flex border-reflect relative rounded-xl p-1 backdrop-blur-xl bg-background/60 shadow-2xl border border-muted/20 mx-auto w-full max-w-3xl -mb-4 lg:-mb-5 overflow-hidden">
          <div className="flex relative p-1 items-start gap-1 flex-1">
            <ChatComposerEditor
              ref={composerRef}
              placeholder="Message..."
              disabled={isSending || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
              onMarkdownChange={setComposerMarkdown}
              onSubmit={() => void handleSendMessage()}
              className="flex-1 min-w-0 bg-transparent! no-scrollbar focus-visible:ring-0 focus-visible:ring-offset-0 border-none shadow-none resize-none text-sm py-1.5 min-h-9"
            />
            <div className='flex items-center self-end gap-1 mb-2 sticky right-0'>
              <Button type='button' variant="ghost" size="icon" onClick={() => setIsPreviewDialogOpen(true)} className="size-8">
                <EyeIcon className="size-4" />
              </Button>
              <Emojis onEmojiSelectAction={handleEmojiSelect} />
              <Button
                type="button"
                onClick={() => void handleSendMessage()}
                disabled={isSending || cooldownTime > 0 || !composerMarkdown.trim() || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
                size="icon"
                variant={composerMarkdown.trim() ? 'default' : 'ghost'}
                className={`size-8 shrink-0 transition-all ${composerMarkdown.trim() ? 'scale-100 opacity-100' : 'scale-90 opacity-50'}`}
              >
                {isSending && composerMarkdown.trim() ? (
                  <LoaderCircleIcon className="animate-spin size-4" />
                ) : cooldownTime > 0 ? (
                  <span className="text-tiny font-bold font-mono">{cooldownTime}</span>
                ) : (
                  <SendHorizontalIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Markdown Preview Dialog */}
      <Credenza open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <CredenzaContent className="sm:max-w-md">
          <CredenzaHeader>
            <CredenzaTitle>Markdown Preview</CredenzaTitle>
            <CredenzaDescription>How your message will look.</CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="max-h-[60vh] overflow-y-auto pr-2 pb-6">
            <MarkdownRenderer
              markdown={composerMarkdown}
              className="prose-sm dark:prose-invert"
            />
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Thread Dialog */}
      <Credenza
        open={openThreadRootId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenThreadRootId(null);
        }}
      >
        <CredenzaContent className="sm:max-w-2xl max-h-[90vh]">
          <CredenzaHeader>
            <CredenzaTitle>Thread</CredenzaTitle>
            <CredenzaDescription>Replies in this thread.</CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="no-scrollbar overflow-y-auto">
            {openThreadRootId && (
              <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-3 pb-4 no-scrollbar">
                {(() => {
                  const root = messageById.get(openThreadRootId);
                  if (!root) return <div className="text-sm text-muted-foreground">Loading thread…</div>;

                  const renderNode = (node: MessageForUI, depth: number): ReactElement => {
                    const kids = childrenByParentId.get(node.id) ?? [];
                    return (
                      <div key={node.id} className={`${depth > 0 ? 'mt-2' : ''}`} style={{ paddingLeft: depth > 0 ? (isMobile ? 12 : 20) : 0 }}>
                        <div className="flex items-start gap-2 group">
                          <Avatar className={`${depth === 0 ? 'size-8' : 'size-6'} shrink-0 mt-0.5`}>
                            {node.userImage ? (
                              <img src={node.userImage} alt={node.username} className="object-cover w-full h-full rounded-full" />
                            ) : (
                              <span className={`flex items-center justify-center w-full h-full ${depth === 0 ? 'text-sm' : 'text-[10px]'} font-bold bg-primary text-primary-foreground rounded-full`}>
                                {node.username?.[0]?.toUpperCase() || '?'}
                              </span>
                            )}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-primary">{node.username}</span>
                              <span className="text-[10px] text-muted-foreground opacity-60">
                                {node.createdAt !== null ? new Date(node.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <ContextMenu
                              onOpenChange={(isOpen) => {
                                if (isOpen) setContextMenuMessageId(node.id);
                                else setContextMenuMessageId(null);
                              }}
                            >
                              <ContextMenuTrigger asChild>
                                <div
                                  className={`rounded-md border border-muted/10 px-2 py-1 bg-secondary/20 hover:bg-secondary/30 transition-all text-sm
                                      ${contextMenuMessageId === node.id ? 'ring-2 ring-primary/30 border-primary/20' : ''}
                                    `}
                                >
                                  <MarkdownRenderer markdown={node.text} />
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-56">
                                <ContextMenuItem className="px-2 text-[10px] text-muted-foreground">
                                  <ClockIcon className="size-3 mr-2" />
                                  {node.createdAt ? new Date(node.createdAt).toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'medium'
                                  }) : 'N/A'}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => handleReplyClick(node.id, node.username || 'User')}>
                                  <ReplyIcon className="size-3 mr-2" />Reply
                                </ContextMenuItem>
                                {isAdmin && z && (
                                  <>
                                    <ContextMenuSeparator />
                                    <ContextMenuLabel className="text-[10px] font-bold uppercase tracking-wider opacity-50">Admin Actions</ContextMenuLabel>
                                    <ContextMenuItem
                                      className="text-yellow-500 focus:text-yellow-600 focus:bg-yellow-500/10"
                                      onSelect={() => handleMuteClick(node.userId!, node.username)}
                                    >
                                      <MicOffIcon className="size-4 mr-2" />
                                      <span>Mute User</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      className="text-blue-500 focus:text-blue-600 focus:bg-blue-500/10"
                                      onSelect={() => openUserSlowModeDialog(node.userId!, node.username)}
                                    >
                                      <TimerIcon className="size-4 mr-2" />
                                      <span>Set Slow Mode</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                      onSelect={() => handleBanClick(node.userId!, node.username)}
                                    >
                                      <BanIcon className="size-4 mr-2" />
                                      <span>Ban User</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                      onSelect={() => handleDelete(node.id)}
                                    >
                                      <Trash2Icon className="size-4 mr-2" />
                                      <span>Delete Message</span>
                                    </ContextMenuItem>
                                  </>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          </div>
                        </div>
                        {kids.length > 0 && (
                          <div className={`mt-2 space-y-2 border-l-2 border-muted/10 ml-3`}>
                            {kids.map((k) => renderNode(k, depth + 1))}
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
          </CredenzaBody>
          <CredenzaFooter>
            <Button variant="outline" className="w-full" onClick={() => setOpenThreadRootId(null)}>Close Thread</Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>

      <Credenza open={isSlowModeUserDialogOpen} onOpenChange={(isOpen) => {
        setIsSlowModeUserDialogOpen(isOpen);
        if (!isOpen) {
          setUserSlowModeSeconds('5'); // Reset to default on close
        }
      }}>
        <CredenzaContent className="sm:max-w-sm">
          <CredenzaHeader>
            <CredenzaTitle className="text-sm">Slow Mode: {userForSlowMode?.username}</CredenzaTitle>
            <CredenzaDescription className="text-xs">
              Override event slow mode. 0 to remove.
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="py-2">
            <Input
              type="number"
              placeholder="Seconds (e.g., 5, 30, 60)"
              value={userSlowModeSeconds}
              onChange={(e) => setUserSlowModeSeconds(e.target.value)}
              className="h-9"
            />
          </CredenzaBody>
          <CredenzaFooter className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setIsSlowModeUserDialogOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSetUserSlowMode}>Set</Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>
    </div>
  );
}

