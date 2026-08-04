import { eventOptions, type EventOption } from './options';
import type { BoraEvent, BoraVote, ScheduleDay } from './types';

export interface AvailabilityResult {
  day: ScheduleDay;
  slot: string;
  names: string[];
  count: number;
}

export interface PreferenceResult {
  option: EventOption;
  count: number;
}

export function acceptedCount(votes: BoraVote[]) {
  return votes.filter((vote) => vote.response === 'accept').length;
}

export function eventStatusText(event: BoraEvent, votes: BoraVote[]) {
  if (event.votingClosed) return 'Confirmações encerradas.';
  const accepted = acceptedCount(votes);
  if (accepted >= event.threshold) return 'Meta de confirmações atingida.';
  const remaining = event.threshold - accepted;
  return remaining === 1 ? 'Falta 1 confirmação.' : `Faltam ${remaining} confirmações.`;
}

export function availabilityResults(event: BoraEvent, votes: BoraVote[]): AvailabilityResult[] {
  return event.days.flatMap((day) => day.slots.map((slot) => {
    const names = votes
      .filter((vote) => vote.response === 'accept' && (vote.availability[day.id] || []).includes(slot))
      .map((vote) => vote.voterName);
    return { day, slot, names, count: names.length };
  })).sort((left, right) => right.count - left.count);
}

export function preferenceResults(event: BoraEvent, votes: BoraVote[]): PreferenceResult[] {
  return eventOptions(event).map((option) => ({
    option,
    count: votes.filter((vote) => vote.response === 'accept' && vote.preferredOptions.includes(option.id)).length
  })).sort((left, right) => right.count - left.count);
}

export function resultDateLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: '2-digit' });
}

export function groupAvailabilityResults(items: AvailabilityResult[]) {
  return items.reduce<Array<{ label: string; items: AvailabilityResult[] }>>((groups, item) => {
    const label = resultDateLabel(item.day.date, true);
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
}
