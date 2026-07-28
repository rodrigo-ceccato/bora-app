export type BoraMode = 'agora' | 'mais-tarde' | 'marcar';
export type VoteResponse = 'accept' | 'decline' | 'maybe';

export interface ScheduleDay {
  id: string;
  label: string;
  date: string;
  slots: string[];
}

export interface BoraEvent {
  id: string;
  slug: string;
  adminToken?: string;
  mode: BoraMode;
  title: string;
  place: string;
  description?: string;
  threshold: number;
  startsAt?: string;
  alternatives: string[];
  days: ScheduleDay[];
  createdByName?: string;
  votingClosed: boolean;
  createdAt: string;
}

export interface BoraVote {
  id: string;
  eventId: string;
  participantId?: string;
  isOwn?: boolean;
  voterName: string;
  response: VoteResponse;
  preferredOption?: string;
  availability: Record<string, string[]>;
  createdAt: string;
}

export interface EventWithVotes {
  event: BoraEvent;
  votes: BoraVote[];
  isAdmin?: boolean;
}

export interface EventDraft {
  mode: BoraMode;
  title: string;
  place: string;
  description?: string;
  threshold: number;
  startsAt?: string;
  alternatives: string[];
  days: ScheduleDay[];
  createdByName?: string;
}
