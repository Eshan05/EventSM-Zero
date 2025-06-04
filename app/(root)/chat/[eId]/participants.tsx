'use client';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ActiveParticipant, BannedParticipant, CategorizedParticipants, MutedParticipant } from "@/types/participants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar } from "@/components/ui/avatar";
import LinesLoader from "@/components/linesLoader";
import { formatDistanceToNow } from "date-fns";
import { ClockIcon, MoreHorizontal, UserIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ParticipantsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  eventId: string;
  onMute: (userId: string, username: string) => void;
  onUnmute: (userId: string, username: string) => void;
  onBan: (userId: string, username: string) => void;
  onUnban: (userId: string, username: string) => void;
  onSetSlowMode?: (userId: string, username: string) => void;
}

export function ParticipantsDialog({
  isOpen, onOpenChange, eventId, onMute, onUnmute, onBan, onUnban, onSetSlowMode
}: ParticipantsDialogProps) {
  const [participants, setParticipants] = useState<CategorizedParticipants | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchParticipants = useCallback(() => {
    if (!eventId) return;
    setIsLoading(true);
    fetch(`/api/events/${eventId}/participants`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setParticipants(data);
      })
      .catch(err => toast.error(`Failed to load participant list: ${err.message}`))
      .finally(() => setIsLoading(false));
  }, [eventId]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) fetchParticipants();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Event Participants</DialogTitle>
          <DialogDescription>Manage and view all participants in this event.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active ({participants?.active.length ?? 0})</TabsTrigger>
            <TabsTrigger value="muted">Muted ({participants?.muted.length ?? 0})</TabsTrigger>
            <TabsTrigger value="banned">Banned ({participants?.banned.length ?? 0})</TabsTrigger>
          </TabsList>
          {isLoading ? <LinesLoader /> : (
            <>
              <TabsContent value="active" className="max-h-96 overflow-y-auto">
                <ParticipantList users={participants?.active ?? []} onMute={onMute} onBan={onBan} />
              </TabsContent>
              <TabsContent value="muted" className="max-h-96 overflow-y-auto">
                <MutedList users={participants?.muted ?? []} onUnmute={onUnmute} onMute={onMute} />
              </TabsContent>
              <TabsContent value="banned" className="max-h-96 overflow-y-auto">
                <BannedList users={participants?.banned ?? []} onUnban={onUnban} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export const ParticipantList = ({ users, onMute, onBan, onSetSlowMode }: {
  users: ActiveParticipant[],
  onMute?: (userId: string, username: string) => void,
  onBan?: (userId: string, username: string) => void,
  onSetSlowMode?: (userId: string, username: string) => void,
}) => {
  if (users.length === 0) return <p className="text-center text-sm text-muted-foreground py-4">No users in this list.</p>;
  return (
    <div className="space-y-1 p-1">
      {users.map(user => (
        <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {user.image ? <img src={user.image} alt={user.username} /> : <UserIcon />}
            </Avatar>
            {user.isActive && (
              <div className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" title="Active now" />
            )}
            <span>{user.username}</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMute && onMute(user.id, user.username)}>Mute</DropdownMenuItem>
              {onSetSlowMode && (
                <DropdownMenuItem onClick={() => onSetSlowMode(user.id, user.username)}>
                  <ClockIcon className="mr-2 h-4 w-4" />
                  Set Slow Mode
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={() => onBan && onBan(user.id, user.username)}>Ban</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
};

export const MutedList = ({ users, onUnmute, onMute }: {
  users: MutedParticipant[],
  onUnmute: (userId: string, username: string) => void,
  onMute: (userId: string, username: string) => void,
}) => {
  if (users.length === 0) return <p className="text-center text-sm text-muted-foreground py-4">No users in this list.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Mute Expires</TableHead>
          <TableHead>Muted By</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.username}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5 text-yellow-500">
                <ClockIcon className="h-4 w-4" />
                {formatDistanceToNow(new Date(user.mutedUntil), { addSuffix: true })}
              </div>
            </TableCell>
            <TableCell>{user.mutedBy}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onUnmute(user.id, user.username)}>Unmute</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMute(user.id, user.username)}>Extend Mute</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export const BannedList = ({ users, onUnban }: {
  users: BannedParticipant[],
  onUnban: (userId: string, username: string) => void,
}) => {
  if (users.length === 0) return <p className="text-center text-sm text-muted-foreground py-4">No users in this list.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Banned At</TableHead>
          <TableHead>Banned By</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow key={user.id}>
            <TableCell className="font-medium text-destructive">{user.username}</TableCell>
            <TableCell>
              {user.bannedAt ? new Date(user.bannedAt).toLocaleString() : 'N/A'}
            </TableCell>
            <TableCell>{user.bannedBy}</TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={() => onUnban(user.id, user.username)}>Unban</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};