export interface ActiveParticipant {
  id: string;
  username: string;
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
  muted: MutedParticipant[];
  banned: BannedParticipant[];
}