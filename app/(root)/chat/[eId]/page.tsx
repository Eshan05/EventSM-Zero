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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LiaUsersSolid } from "react-icons/lia";
import { BiUserVoice } from "react-icons/bi";
import Emojis from '@/components/ui/emoji';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CustomUser } from '@/lib/auth';
import { useZero } from '@/lib/zero/zero';
import { ActiveParticipant, BannedParticipant, CategorizedParticipants, MutedParticipant } from '@/types/participants';
import { useQuery } from '@rocicorp/zero/react';
import { formatDistanceToNow } from 'date-fns';
import { BanIcon, Bold, ClockIcon, Code, Italic, List, LoaderCircleIcon, MicOffIcon, ReplyIcon, SendHorizontalIcon, TimerIcon, Trash2Icon, Underline, UserIcon, XIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

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

export default function ChatPage({ params }: { params: Promise<{ eId: string }> }) {
  const { eId } = use(params);
  const { data: session, status: authStatus } = useSession();
  const z = useZero();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentEvent, setCurrentEvent] = useState<ChatEvent | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
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

  // It returns a readonly tuple: readonly [T[], QueryResultDetails]
  // We destructure it into const variables.
  const [rawMessages, messagesResultDetails] = useQuery(z?.query.messages.orderBy('createdAt', 'asc'));
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

  const handleOpenParticipantDialog = () => {
    setIsUserListDialogOpen(true);
  };

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
    setNewMessageText(`@${username} `);
    document.getElementById('messageInput')?.focus();
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
      <div className="flex flex-col flex-1 max-w-2xl mx-auto w-full h-full">
        {/* Header */}
        <header className="-mt-1 flex-shrink-0 border-reflect bg-transparent flex items-center justify-between p-4 pt-5 rounded-b-2xl backdrop-blur-md border-b border-muted/30">
          <div className="grid auto-rows-min items-start gap-1">
            {(isMessagesDataComplete && isUsersDataComplete) ? <h1 className="text-2xl line-clamp-1 font-bold tracking-tight">{currentEvent?.name || 'Loading Event...'}</h1>
              : <AnimatedShinyText className='text-2xl font-bold tracking-tight'> <span>{'Syncing'}</span></AnimatedShinyText>}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <TimerIcon className={`h-5 w-5 ${eventSlowMode > 0 ? 'text-yellow-500' : ''}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56">
                  <div className="space-y-2">
                    <h4 className="font-medium">Event Slow Mode</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 5, 15, 30, 60, 300].map(sec => (
                        <Button key={sec} variant={eventSlowMode === sec ? 'default' : 'outline'} size="sm" onClick={() => handleSetEventSlowMode(sec)}>
                          {sec === 0 ? 'Off' : `${sec}s`}
                        </Button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Badge variant={isMessagesDataComplete && isUsersDataComplete ? 'success-2' : 'secondary'} className='small-caps'>
              {isMessagesDataComplete && isUsersDataComplete ? 'Synced' :
                (messagesResultDetails?.type !== 'complete' || usersResultDetails?.type !== 'complete') ? 'Error' : 'Syncing...'}
            </Badge>
            {/* Avatar Group and User List Dialog Trigger */}
            {activeUsers.length > 0 && (
              <div
                className="flex -space-x-4 overflow-hidden cursor-pointer"
                onClick={handleOpenParticipantDialog}
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
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4 no-scrollbar scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
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
          {combinedMessages.reduce<Array<Array<MessageForUI>>>((groups, message, index) => {
            if (index === 0 || message.userId !== combinedMessages[index - 1].userId) {
              groups.push([message]);
            } else {
              groups[groups.length - 1].push(message);
            }
            return groups;
          }, []).map((messageGroup, groupIndex) => (
            <div key={groupIndex} className="flex items-start gap-3 mb-4 last:mb-0">
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-primary">{messageGroup[0].username}</span>
                  <span className="text-xs text-muted-foreground">
                    {messageGroup[0].createdAt !== null ? new Date(messageGroup[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {messageGroup.map((message, messageIndex) => (
                    <ContextMenu
                      key={message.id}
                      onOpenChange={(isOpen) => {
                        if (isOpen) setContextMenuMessageId(message.id);
                        else setContextMenuMessageId(null);
                      }}
                    >
                      <ContextMenuTrigger asChild>
                        <div
                          className={`px-2 py-px rounded-sm transition-colors hover:bg-secondary
                            ${message.isDeleted ? 'opacity-50 italic bg-destructive/10 text-muted-foreground line-through' : ''}
                            border border-muted/20
                            ${contextMenuMessageId === message.id ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
                          `}
                        >
                          {message.isDeleted ? (
                            <span className="text-xs">[Message deleted]</span>
                          ) : (
                            <>
                              {message.replyToMessageId && (
                                <div className="my-1 text-xs text-muted-foreground border-l-2 border-muted pl-2">
                                  Replying to: <span className="italic">{combinedMessages.find(m => m.id === message.replyToMessageId)?.text.substring(0, 30) || 'original message'}...</span>
                                </div>
                              )}
                              <ReactMarkdown
                                remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                                components={{
                                  p: ({ node, ...props }) => <p className="text-foreground break-words whitespace-pre-line markdown" {...props} />,
                                  ul: ({ node, ...props }) => <ul className="list-disc list-inside ml-4" {...props} />,
                                  ol: ({ node, ...props }) => <ol className="list-decimal list-inside ml-4" {...props} />,
                                  li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                                  code: ({ node, className, children, ...props }) => (
                                    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm prose-code:before:hidden prose-code:after:hidden" {...props}>
                                      {children}
                                    </code>
                                  ),
                                  u: ({ node, children, ...props }) => <u className='underline' {...props}>{children}</u>
                                }}
                              >
                                {message.text}
                              </ReactMarkdown>
                            </>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      {!message.isDeleted && (
                        <ContextMenuContent className="w-64">
                          <ContextMenuItem className="px-2 text-xs text-muted-foreground">
                            <SendHorizontalIcon />{message.createdAt ? new Date(message.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'medium'
                            }) : 'N/A'}
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleReplyClick(message.id, message.username || 'User')}
                          >
                            <ReplyIcon />Reply
                          </ContextMenuItem>
                          {((session.user && (session.user as CustomUser).role === 'admin') || false) && !message.isDeleted && z && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                className="text-yellow-500 focus:text-yellow-600 focus:bg-yellow-500/10"
                                onSelect={() => handleMuteClick(message.userId!, message.username)}
                              >
                                <MicOffIcon />
                                <span>Mute User</span>
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-blue-500 focus:text-blue-600 focus:bg-blue-500/10"
                                onSelect={() => openUserSlowModeDialog(message.userId!, message.username)}
                              >
                                <TimerIcon />
                                <span>Set Slow Mode</span>
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onSelect={() => handleBanClick(message.userId!, message.username)}
                              >
                                <BanIcon />
                                <span>Ban User</span>
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onSelect={() => handleDelete(message.id)}
                              >
                                <Trash2Icon />
                                <span>Delete Message</span>
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Area and Reply Indicator */}
        <Dialog open={isMuteDialogOpen} onOpenChange={setIsMuteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mute {userToMute?.username || 'User'}</DialogTitle>
              <DialogDescription>
                Select a duration to prevent this user from sending messages in this event.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <Button variant="outline" onClick={() => handleMuteConfirm(60)}>1 Minute</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(300)}>5 Minutes</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(900)}>15 Minutes</Button>
              <Button variant="outline" onClick={() => handleMuteConfirm(3600)}>1 Hour</Button>
              <Button variant="destructive" className="col-span-2" onClick={() => handleMuteConfirm(86400)}>24 Hours</Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsMuteDialogOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isBanDialogOpen} onOpenChange={setIsBanDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban {userToBan?.username || 'User'}</DialogTitle>
              <DialogDescription>
                Are you sure you want to ban this user? They will be unable to send or see messages in this event. This can be undone from the admin panel.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsBanDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBanConfirm}>Confirm Ban</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isUserListDialogOpen} onOpenChange={setIsUserListDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] rounded overflow-scroll no-scrollbar">
            <DialogHeader>
              <DialogTitle>Event Participants</DialogTitle>
              <DialogDescription>
                {isAdmin ? 'Manage and view all participants.' : 'Users currently active in this chat.'}
              </DialogDescription>
            </DialogHeader>
            {isAdmin ? (
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-4 items-center">
                  <TabsTrigger value="all"><LiaUsersSolid />
                    <Badge
                      variant='outline'
                      className='rounded-full font-normal text-tiny px-1.5 aspect-square no-scrollbar'
                    >{categorizedParticipants.all.length ?? 0}</Badge></TabsTrigger>
                  <TabsTrigger value="active" className='relative'><BiUserVoice />
                    <Badge
                      variant='success-2'
                      className='rounded-full font-normal text-tiny px-1.5 aspect-square no-scrollbar'
                    >{categorizedParticipants?.active.length ?? 0}
                    </Badge></TabsTrigger>
                  <TabsTrigger value="muted"><MicOffIcon />
                    <Badge
                      variant='yellow'
                      className='rounded-full font-normal text-tiny px-1.5 aspect-square no-scrollbar'
                    >{categorizedParticipants?.muted.length ?? 0}</Badge></TabsTrigger>
                  <TabsTrigger value="banned"><BanIcon />
                    <Badge
                      variant='destructive-2'
                      className='rounded-full font-normal text-tiny px-1.5 aspect-square no-scrollbar'
                    >{categorizedParticipants?.banned.length ?? 0}</Badge></TabsTrigger>
                </TabsList>
                {isParticipantListLoading ? <LinesLoader /> : (
                  <>
                    <TabsContent value="all" className="max-h-96 overflow-y-auto">
                      <ParticipantList users={categorizedParticipants.all ?? []} onMute={onMute} onBan={onBan} onSetSlowMode={openUserSlowModeDialog} />
                    </TabsContent>
                    <TabsContent value="active" className="max-h-96 overflow-y-auto">
                      <ParticipantList users={categorizedParticipants.active ?? []} onMute={onMute} onBan={onBan} onSetSlowMode={openUserSlowModeDialog} />
                    </TabsContent>
                    <TabsContent value="muted" className="max-h-96 overflow-y-auto">
                      <MutedList users={categorizedParticipants?.muted ?? []} onUnmute={onUnmute} onMute={onMute} />
                    </TabsContent>
                    <TabsContent value="banned" className="max-h-96 overflow-y-auto">
                      <BannedList users={categorizedParticipants?.banned ?? []} onUnban={onUnban} />
                    </TabsContent>
                  </>
                )}
              </Tabs>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <ParticipantList users={activeUsers} />
              </div>
            )}
          </DialogContent>
        </Dialog>
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
        <div className="flex border-reflect relative rounded-t-lg p-1 pb-0 backdrop-blur-lg flex-col top-0 shadow-lg border border-muted/30 lg:w-1/2 2xl:w-xl mx-auto w-full md:w-2/3 sm:w-3/4 translate-y-1">
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
              <Emojis onEmojiSelectAction={handleEmojiSelect} />
              <Button
                type="submit"
                disabled={isSending || cooldownTime > 0 || !newMessageText.trim() || !currentEvent?.id || !isZeroClientAvailable || (!isMessagesDataComplete || !isUsersDataComplete && combinedMessages.length > 0)}
                size="md-icon"
                variant={'outline'}
                className="flex-shrink-0 grid place-items-center"
              >
                {isSending && newMessageText.trim() ? (
                  <LoaderCircleIcon className="animate-spin h-4 w-4" />
                ) : cooldownTime > 0 ? (
                  <span className="text-sm font-mono">{cooldownTime}</span>
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

      <Dialog open={isSlowModeUserDialogOpen} onOpenChange={(isOpen) => {
        setIsSlowModeUserDialogOpen(isOpen);
        if (!isOpen) {
          setUserSlowModeSeconds('5'); // Reset to default on close
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Custom Cooldown for {userForSlowMode?.username}</DialogTitle>
            <DialogDescription>
              Override the event-wide slow mode for this user. Enter 0 to remove their cooldown but still respect the event's slow mode.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="number"
              placeholder="Seconds (e.g., 5, 30, 60)"
              value={userSlowModeSeconds}
              onChange={(e) => setUserSlowModeSeconds(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSlowModeUserDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSetUserSlowMode}>Set Cooldown</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

