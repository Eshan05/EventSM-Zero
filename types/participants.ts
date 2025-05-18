export interface ActiveParticipant {
  id: string;
  username: string;
  isActive?: boolean;
  image: string | null;
}
export interface MutedParticipant extends ActiveParticipant {
  mutedUntil: string;
  mutedBy: string;
}
export interface BannedParticipant extends ActiveParticipant {
  bannedAt?: string;
  bannedBy: string;
}
export interface CategorizedParticipants {
  active: ActiveParticipant[];
  all: ActiveParticipant[];
  muted: MutedParticipant[];
  banned: BannedParticipant[];
}