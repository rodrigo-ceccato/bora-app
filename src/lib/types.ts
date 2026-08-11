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
  timeZone?: string;
  createdByName?: string;
  notifyCreatorOnVote?: boolean;
  /** Optimistic concurrency revision supplied by the API. */
  revision?: number;
  votingClosed: boolean;
  decidedOption?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface BoraVote {
  id: string;
  eventId: string;
  participantId?: string;
  isOwn?: boolean;
  voterName: string;
  response: VoteResponse;
  preferredOptions: string[];
  availability: Record<string, string[]>;
  createdAt: string;
}

export interface BoraMessage {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  isOwn?: boolean;
}

export interface EventSummary extends BoraEvent {
  /** Total `Posso` responses, computed by the API without loading every vote. */
  confirmedCount?: number;
  /** This device participant's saved response, when the event was joined. */
  participantResponse?: VoteResponse;
}

export interface VoteSummary {
  total: number;
  responses: Record<VoteResponse, number>;
  /** Exact schedule-result counts keyed by ISO option or `dayId:HH:MM`. */
  optionCounts: Record<string, number>;
}

export interface VotePage {
  limit: number;
  returned: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface EventWithVotes {
  event: BoraEvent;
  votes: BoraVote[];
  /** The viewer's vote is returned independently so pagination cannot hide it. */
  ownVote?: BoraVote;
  isAdmin?: boolean;
  voteSummary?: VoteSummary;
  votePage?: VotePage;
  /** The public participant-name list is capped even when aggregate counts are larger. */
  votesTruncated?: boolean;
  messages?: BoraMessage[];
  /** Messages remain readable after the event, but new ones are closed. */
  messagesClosed?: boolean;
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
  timeZone?: string;
  createdByName?: string;
  notifyCreatorOnVote?: boolean;
}
