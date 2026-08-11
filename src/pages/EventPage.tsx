import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonDatetime, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonPage, IonSpinner, IonTextarea, IonTitle, IonToolbar, useIonAlert, useIonRouter, useIonToast, useIonViewDidEnter } from '@ionic/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { logoWhatsapp } from 'ionicons/icons';
import { ApiRequestError, deleteEvent, deleteMessage, getEvent, getMoreEventVotes, getParticipantId, getParticipantName, saveParticipantName, submitMessage, subscribeToEvent, submitVote, updateEvent } from '../lib/store';
import { responseLabel } from '../lib/schedule';
import { localDateKey, toInstantIso, toPickerValue } from '../lib/datetime';
import { eventOptions, optionLabel } from '../lib/options';
import { invitationText as libInvitationText } from '../lib/invite';
import { calendarDetails, calendarIcs, googleCalendarUrl } from '../lib/calendar';
import { availabilityResults, eventStatusText, groupAvailabilityResults, preferenceResults, resultDateLabel, thresholdProgressPercentage } from '../lib/results';
import type { BoraEvent, EventWithVotes, VoteResponse } from '../lib/types';

type CopyFallback = { text: string; kind: 'invite' | 'organizer' };

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const scheduleTimes = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const overnightScheduleTimes = Array.from({ length: 7 }, (_, index) => `0${index + 1}:00`);
const maxThreshold = 999;
const minThreshold = 2;

function agoraDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}
function futureAgoraTime(date: string, time: string) {
  return validDateValue(date) && validTimeValue(time) && new Date(agoraDateTime(date, time)).getTime() > Date.now();
}
function pickerTime(value?: string) {
  const match = value?.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '18:00';
}
function validDateValue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === date;
}
function validTimeValue(time: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}
function earlyMorningTime(time: string) {
  return /^(?:0[1-7]):[0-5]\d$/.test(time);
}
function sortedUniqueTimes(times: string[]) {
  return Array.from(new Set(times)).sort((left, right) => left.localeCompare(right));
}
function validEditableSchedule(event: BoraEvent, earlyMoreLaterEnabled = false) {
  if (event.mode === 'agora') {
    const date = typeof event.startsAt === 'string' ? event.startsAt.slice(0, 10) : '';
    return futureAgoraTime(date, pickerTime(event.startsAt));
  }
  if (event.mode === 'mais-tarde') {
    const options = [event.startsAt, ...event.alternatives].filter((value): value is string => Boolean(value));
    return options.length > 0 && options.every((value) => Number.isFinite(new Date(value).getTime()) && new Date(value).getTime() > Date.now())
      && (earlyMoreLaterEnabled || options.every((value) => !earlyMorningTime(pickerTime(toPickerValue(value)))));
  }
  const uniqueDates = new Set(event.days.map((day) => day.date)).size === event.days.length;
  const uniqueIds = new Set(event.days.map((day) => day.id)).size === event.days.length;
  return event.days.length > 0 && uniqueDates && uniqueIds && event.days.every((day) =>
    day.id.trim() && validDateValue(day.date) && day.slots.length > 0
    && new Set(day.slots).size === day.slots.length
    && day.slots.every((slot) => futureAgoraTime(day.date, slot))
  );
}

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const query = useQuery();
  const [toast] = useIonToast();
  const [presentAlert] = useIonAlert();
  const router = useIonRouter();
  const adminToken = query.get('admin') || '';
  const [data, setData] = useState<EventWithVotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<'not-found' | 'network' | 'server' | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [name, setName] = useState(getParticipantName);
  const [preferredOptions, setPreferredOptions] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [editEvent, setEditEvent] = useState<BoraEvent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [removingMessageId, setRemovingMessageId] = useState<string | null>(null);
  const [voteValidationError, setVoteValidationError] = useState<'name' | 'options' | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [savingAdminAction, setSavingAdminAction] = useState(false);
  const [adminSection, setAdminSection] = useState<'overview' | 'manage'>('overview');
  const [showAllResults, setShowAllResults] = useState(false);
  const [loadingMoreVotes, setLoadingMoreVotes] = useState(false);
  const [expandedResultDays, setExpandedResultDays] = useState<Record<string, boolean>>({});
  const [overnightEditDays, setOvernightEditDays] = useState<Record<string, boolean>>({});
  const [overnightEditWeekDates, setOvernightEditWeekDates] = useState<Record<string, boolean>>({});
  const [editCalendarOpen, setEditCalendarOpen] = useState(false);
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [copyFallback, setCopyFallback] = useState<CopyFallback | null>(null);
  const hydratedVote = useRef(false);
  const contentRef = useRef<HTMLIonContentElement>(null);
  const nameInputRef = useRef<HTMLIonInputElement>(null);
  const editOpenerRef = useRef<HTMLElement | null>(null);
  const editTitleRef = useRef<HTMLIonInputElement>(null);
  const editCalendarOpenerRef = useRef<HTMLElement | null>(null);
  const editCalendarInputRef = useRef<HTMLIonInputElement>(null);
  const copyOpenerRef = useRef<HTMLElement | null>(null);
  const copyTextareaRef = useRef<HTMLIonTextareaElement>(null);

  const isAdmin = Boolean(data?.isAdmin);
  const wasJustCreated = query.get('created') === '1';
  const temporaryAdminAccess = query.get('adminAccess') === 'temporary';
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  useIonViewDidEnter(() => {
    if (wasJustCreated) void contentRef.current?.scrollToTop(0);
  });

  useEffect(() => {
    if (!wasJustCreated || !data?.event.id) return;
    const frame = window.requestAnimationFrame(() => { void contentRef.current?.scrollToTop(0); });
    return () => window.cancelAnimationFrame(frame);
  }, [wasJustCreated, data?.event.id]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let hasLoadedData = false;
    hydratedVote.current = false;
    setData(null);
    setLoadFailure(null);
    setLoading(true);

    async function refresh() {
      try {
        const result = await getEvent(slug, adminToken);
        if (!active) return;
        if (!result) {
          setData(null);
          setLoadFailure('not-found');
          return;
        }
        hasLoadedData = true;
        setData(result);
        setLoadFailure(null);
        const ownVote = result?.ownVote || result?.votes.find((vote) => vote.isOwn || vote.participantId === getParticipantId());
        if (!hydratedVote.current && result) {
          if (ownVote && !getParticipantName()) {
            setName(ownVote.voterName);
            saveParticipantName(ownVote.voterName);
          }
          if (result.event.mode === 'mais-tarde') {
            setPreferredOptions(ownVote?.preferredOptions || (result.event.startsAt ? [result.event.startsAt] : []));
          }
          if (result.event.mode === 'marcar' && ownVote) {
            setAvailability(ownVote.availability);
          }
          hydratedVote.current = true;
        }
        if (result && !unsubscribe) unsubscribe = subscribeToEvent(result.event.id, () => { void refresh(); });
      } catch (error) {
        if (active && !hasLoadedData) setLoadFailure(error instanceof ApiRequestError ? 'server' : 'network');
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [slug, adminToken, loadAttempt]);

  const counts = useMemo(() => {
    if (data?.voteSummary) return data.voteSummary.responses;
    const votes = data?.votes || [];
    return {
      accept: votes.filter((vote) => vote.response === 'accept').length,
      maybe: votes.filter((vote) => vote.response === 'maybe').length,
      decline: votes.filter((vote) => vote.response === 'decline').length
    };
  }, [data]);

  const availabilitySummary = useMemo(() => data ? availabilityResults(data.event, data.votes, data.voteSummary?.optionCounts) : [], [data]);
  const timePreferences = useMemo(() => data?.event.mode === 'mais-tarde' ? preferenceResults(data.event, data.votes, data.voteSummary?.optionCounts) : [], [data]);
  const decidedCalendar = useMemo(() => data ? calendarDetails(data.event) : null, [data]);
  const tomorrowKey = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return localDateKey(next);
  }, []);
  const groupedAvailability = useMemo(() => {
    return groupAvailabilityResults(availabilitySummary);
  }, [availabilitySummary]);

  async function loadMoreVotes() {
    const cursor = data?.votePage?.nextCursor;
    if (!data || !cursor || loadingMoreVotes) return;
    setLoadingMoreVotes(true);
    try {
      const page = await getMoreEventVotes(slug, cursor, adminToken);
      if (!page) throw new Error('Este Bora não está mais disponível.');
      setData((current) => {
        if (!current || current.event.id !== page.event.id) return current;
        const existing = new Set(current.votes.map((vote) => vote.id));
        const votes = [...current.votes, ...page.votes.filter((vote) => !existing.has(vote.id))];
        return {
          ...current,
          votes,
          ownVote: current.ownVote || page.ownVote,
          votePage: page.votePage,
          votesTruncated: Boolean(page.votePage?.hasMore)
        };
      });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível carregar mais nomes.', color: 'warning', duration: 3000 });
    } finally {
      setLoadingMoreVotes(false);
    }
  }
  const maxAvailabilityCount = availabilitySummary[0]?.count || 0;

  function updateName(value: string) {
    setName(value);
    if (value.trim()) setVoteValidationError((current) => current === 'name' ? null : current);
    saveParticipantName(value);
  }

  function toggleSlot(dayId: string, slot: string) {
    setVoteValidationError((current) => current === 'options' ? null : current);
    setAvailability((current) => {
      const selected = current[dayId] || [];
      const next = selected.includes(slot) ? selected.filter((item) => item !== slot) : [...selected, slot];
      return { ...current, [dayId]: next };
    });
  }

  function downloadCalendar() {
    if (!data || !decidedCalendar) return;
    const file = new Blob([calendarIcs(data.event, decidedCalendar)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.event.slug}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function togglePreferredOption(optionId: string) {
    setVoteValidationError((current) => current === 'options' ? null : current);
    setPreferredOptions((current) => current.includes(optionId)
      ? current.filter((item) => item !== optionId)
      : [...current, optionId]);
  }

  function openEdit() {
    if (!data) return;
    editOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const pickerStart = toPickerValue(data.event.startsAt);
    const startDate = pickerStart?.slice(0, 10) || '';
    setOvernightEditDays(Object.fromEntries(data.event.days.filter((day) => day.slots.some((slot) => overnightScheduleTimes.includes(slot))).map((day) => [day.id, true])));
    setOvernightEditWeekDates(data.event.mode === 'mais-tarde' && startDate && [data.event.startsAt, ...data.event.alternatives].some((value) => value && earlyMorningTime(pickerTime(toPickerValue(value)))) ? { [startDate]: true } : {});
    setEditSubmitted(false);
    setEditEvent({ ...data.event, startsAt: pickerStart, days: data.event.days.map((day) => ({ ...day, slots: [...day.slots] })), alternatives: [...data.event.alternatives] });
  }

  function updateEdit(patch: Partial<BoraEvent>) {
    setEditEvent((current) => current ? { ...current, ...patch } : current);
  }

  function editAgoraDay(value = editEvent?.startsAt) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return localDateKey();
  }

  function updateEditAgoraDay(date: string) {
    setEditEvent((current) => current ? { ...current, startsAt: agoraDateTime(date, pickerTime(current.startsAt)) } : current);
  }

  function updateEditAgoraTime(value: string | string[] | null | undefined) {
    if (typeof value !== 'string') return;
    const match = value.match(/T(\d{2}:\d{2})/);
    if (!match) return;
    setEditEvent((current) => current ? { ...current, startsAt: agoraDateTime(editAgoraDay(current.startsAt), match[1]) } : current);
  }

  function changeEditThreshold(delta: number) {
    setEditEvent((current) => current ? { ...current, threshold: Math.min(maxThreshold, Math.max(minThreshold, Math.round(current.threshold) + delta)) } : current);
  }

  function updateEditMoreLaterStart(value: string | string[] | null | undefined) {
    if (typeof value !== 'string') return;
    const date = value.slice(0, 10);
    if (earlyMorningTime(pickerTime(value)) && !overnightEditWeekDates[date]) {
      toast({ message: 'Mostre os horários da madrugada deste dia antes de escolher um horário entre 01:00 e 07:00.', color: 'warning', duration: 3000 });
      return;
    }
    updateEdit({ startsAt: value });
  }

  function toggleEditWeekOvernightTimes() {
    const date = editEvent?.startsAt?.slice(0, 10);
    if (!date) return;
    if (overnightEditWeekDates[date] && editEvent && [editEvent.startsAt, ...editEvent.alternatives].some((value) => value && earlyMorningTime(pickerTime(toPickerValue(value))))) {
      toast({ message: 'Altere os horários da madrugada antes de ocultá-los.', color: 'warning', duration: 2600 });
      return;
    }
    setOvernightEditWeekDates((current) => ({ ...current, [date]: !current[date] }));
  }

  function updateEditDay(dayId: string, patch: Partial<BoraEvent['days'][number]>) {
    setEditEvent((current) => current ? {
      ...current,
      days: current.days.map((day) => day.id === dayId ? { ...day, ...patch } : day)
    } : current);
  }

  function updateEditDayDate(dayId: string, date: string) {
    const day = editEvent?.days.find((item) => item.id === dayId);
    updateEditDay(dayId, { date, label: resultDateLabel(date), slots: day?.slots.filter((slot) => futureAgoraTime(date, slot)) || [] });
  }

  function toggleEditSlot(dayId: string, slot: string, checked: boolean) {
    const day = editEvent?.days.find((item) => item.id === dayId);
    if (!day) return;
    if (checked && !futureAgoraTime(day.date, slot)) {
      toast({ message: 'Não é possível oferecer um horário que já passou.', color: 'warning', duration: 2400 });
      return;
    }
    updateEditDay(dayId, { slots: checked ? sortedUniqueTimes([...day.slots, slot]) : day.slots.filter((item) => item !== slot) });
  }

  function addEditDay() {
    setEditEvent((current) => {
      if (!current) return current;
      const sortedDays = [...current.days].sort((left, right) => left.date.localeCompare(right.date));
      const lastDate = sortedDays[sortedDays.length - 1]?.date || localDateKey();
      const nextDate = new Date(`${lastDate}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      const date = localDateKey(nextDate);
      return { ...current, days: [...current.days, { id: `day_${Date.now()}`, label: resultDateLabel(date), date, slots: [] }] };
    });
  }

  function duplicateEditDay(dayId: string) {
    const duplicateId = `day_${Date.now()}`;
    const sourceHasOvernight = Boolean(editEvent?.days.find((day) => day.id === dayId)?.slots.some((slot) => overnightScheduleTimes.includes(slot)));
    setEditEvent((current) => {
      const source = current?.days.find((day) => day.id === dayId);
      if (!current || !source) return current;
      const nextDate = new Date(`${source.date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      const date = localDateKey(nextDate);
      return { ...current, days: [...current.days, { ...source, id: duplicateId, date, label: resultDateLabel(date), slots: source.slots.filter((slot) => futureAgoraTime(date, slot)) }] };
    });
    if (sourceHasOvernight) setOvernightEditDays((current) => ({ ...current, [duplicateId]: true }));
  }

  function useSameEditTimes() {
    setEditEvent((current) => {
      const slots = current?.days.find((day) => day.slots.length)?.slots;
      return current && slots ? { ...current, days: current.days.map((day) => ({ ...day, slots: slots.filter((slot) => futureAgoraTime(day.date, slot) && (overnightEditDays[day.id] || !overnightScheduleTimes.includes(slot))) })) } : current;
    });
  }

  function setResultDayExpanded(day: string, expanded: boolean) {
    setExpandedResultDays((current) => current[day] === expanded ? current : { ...current, [day]: expanded });
  }

  function removeEditDay(dayId: string) {
    setEditEvent((current) => current ? { ...current, days: current.days.filter((day) => day.id !== dayId) } : current);
    setOvernightEditDays((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== dayId)));
  }

  function toggleEditOvernightTimes(dayId: string) {
    const enabled = !overnightEditDays[dayId];
    setOvernightEditDays((current) => ({ ...current, [dayId]: enabled }));
    if (!enabled) {
      const day = editEvent?.days.find((item) => item.id === dayId);
      if (day) updateEditDay(dayId, { slots: day.slots.filter((slot) => !overnightScheduleTimes.includes(slot)) });
    }
  }

  async function saveEdit() {
    if (!data || !editEvent) return;
    setEditSubmitted(true);
    const threshold = Number(editEvent.threshold);
    const editWeekDate = editEvent.startsAt?.slice(0, 10) || '';
    const scheduleValid = validEditableSchedule(editEvent, Boolean(overnightEditWeekDates[editWeekDate]));
    if (!editEvent.title.trim() || !editEvent.place.trim() || !Number.isInteger(threshold) || threshold < minThreshold || !scheduleValid) {
      toast({ message: 'Revise título, local, mínimo e horários antes de salvar.', color: 'danger', duration: 2800 });
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateEvent(adminToken, {
        ...editEvent,
        startsAt: editEvent.startsAt ? toInstantIso(editEvent.startsAt) : undefined,
        title: editEvent.title.trim(),
        place: editEvent.place.trim(),
        description: editEvent.description?.trim(),
        threshold
      });
      setData((current) => current ? { ...current, event: updated } : current);
      setEditEvent(null);
      setEditSubmitted(false);
      toast({ message: 'Evento atualizado!', color: 'success', duration: 1800 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar as alterações.', color: 'danger', duration: 2800 });
    } finally {
      setSavingEdit(false);
    }
  }

  async function vote(response: VoteResponse) {
    if (!data) return;
    if (data.event.votingClosed) {
      toast({ message: 'Esta votação foi encerrada.', color: 'warning', duration: 2200 });
      return;
    }
    if (!name.trim()) {
      setVoteValidationError('name');
      void nameInputRef.current?.setFocus();
      return;
    }
    const selectedSlots = Object.values(availability).flat();
    if (data.event.mode === 'mais-tarde' && response !== 'decline' && preferredOptions.length === 0) {
      setVoteValidationError('options');
      toast({ message: 'Marque pelo menos um horário ou selecione “Não posso”.', color: 'danger', duration: 2600 });
      return;
    }
    if (data.event.mode === 'marcar' && response !== 'decline' && selectedSlots.length === 0) {
      setVoteValidationError('options');
      toast({ message: 'Marque pelo menos um horário ou selecione “Não posso”.', color: 'danger', duration: 2600 });
      return;
    }
    saveParticipantName(name);
    setVoteValidationError(null);
    setSubmittingVote(true);
    try {
      const decided = data.event.decidedOption;
      const decidedDay = decided?.match(/^(.*):(\d{2}:\d{2})$/)?.slice(1);
      await submitVote(data.event, {
        voterName: name.trim(),
        response,
        preferredOptions: data.event.mode === 'mais-tarde' && response !== 'decline' ? (decided ? [decided] : preferredOptions) : [],
        availability: data.event.mode === 'marcar' && response !== 'decline'
          ? (decidedDay ? { [decidedDay[0]]: [decidedDay[1]] } : availability) : {}
      });
      const refreshed = await getEvent(slug, adminToken);
      setData(refreshed);
      setVoteSubmitted(true);
      setEditingVote(false);
      toast({ message: 'Voto registrado!', color: 'success', duration: 2200 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível votar.', color: 'danger', duration: 2600 });
    } finally {
      setSubmittingVote(false);
    }
  }

  async function toggleVoting() {
    if (!data || !isAdmin) return;
    setSavingAdminAction(true);
    try {
      const updated = await updateEvent(adminToken, { ...data.event, votingClosed: !data.event.votingClosed });
      setData((current) => current ? { ...current, event: updated } : current);
      toast({
        message: updated.votingClosed ? 'Confirmações encerradas.' : 'Confirmações abertas.',
        color: 'success',
        duration: 1800
      });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível atualizar a votação.', color: 'danger', duration: 2600 });
    } finally {
      setSavingAdminAction(false);
    }
  }

  async function decideOption(optionId: string) {
    if (!data || !isAdmin) return;
    setSavingAdminAction(true);
    try {
      const updated = await updateEvent(adminToken, { ...data.event, decidedOption: optionId });
      setData((current) => current ? { ...current, event: updated } : current);
      toast({ message: 'Horário definido.', color: 'success', duration: 2200 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível definir o horário.', color: 'danger', duration: 2600 });
    } finally {
      setSavingAdminAction(false);
    }
  }

  async function clearDecision() {
    if (!data || !isAdmin) return;
    setSavingAdminAction(true);
    try {
      const updated = await updateEvent(adminToken, { ...data.event, decidedOption: undefined, decidedAt: undefined });
      setData((current) => current ? { ...current, event: updated } : current);
      toast({ message: 'Decisão removida.', color: 'success', duration: 2200 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível reabrir a votação.', color: 'danger', duration: 2600 });
    } finally {
      setSavingAdminAction(false);
    }
  }

  function confirmDelete() {
    if (!data || !isAdmin) return;
    presentAlert({
      header: 'Excluir este Bora?',
      message: 'O evento e todos os votos serão apagados. Essa ação não pode ser desfeita.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            void (async () => {
              setSavingAdminAction(true);
              try {
                await deleteEvent(adminToken, data.event);
                router.push('/home', 'back', 'replace');
              } catch (error) {
                toast({ message: error instanceof Error ? error.message : 'Não foi possível excluir o evento.', color: 'danger', duration: 2600 });
                setSavingAdminAction(false);
              }
            })();
          }
        }
      ]
    });
  }

  async function sendMessage() {
    if (!data || submittingMessage) return;
    const body = messageBody.trim();
    if (!body) {
      toast({ message: 'Escreva um recado antes de enviar.', color: 'warning', duration: 2200 });
      return;
    }
    setSubmittingMessage(true);
    try {
      const message = await submitMessage(data.event, body, isAdmin ? adminToken : undefined);
      setData((current) => current ? { ...current, messages: [...(current.messages || []), message] } : current);
      setMessageBody('');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível enviar o recado.', color: 'danger', duration: 2800 });
    } finally {
      setSubmittingMessage(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!data || removingMessageId) return;
    setRemovingMessageId(messageId);
    try {
      await deleteMessage(data.event, messageId, isAdmin ? adminToken : undefined);
      setData((current) => current ? { ...current, messages: (current.messages || []).filter((message) => message.id !== messageId) } : current);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível remover o recado.', color: 'danger', duration: 2800 });
    } finally {
      setRemovingMessageId(null);
    }
  }

  async function copyText(url: string, message: string, kind: CopyFallback['kind'] = 'invite') {
    copyOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (!navigator.clipboard) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(url);
      toast({ message, color: 'success', duration: 1800 });
    } catch {
      setCopyFallback({ text: url, kind });
      toast({ message: kind === 'organizer' ? 'A cópia automática falhou. Selecione e guarde o link de organizador exibido.' : 'A cópia automática falhou. O convite seguro está pronto para você copiar.', color: 'warning', duration: 3600 });
    }
  }

  function invitationText() {
    if (!data) return 'Bora combinar?';
    return libInvitationText(data.event);
  }

  function invitationUrl() {
    return `${window.location.origin}/e/${slug}`;
  }

  function organizerUrl() {
    return `${window.location.origin}/e/${slug}?admin=${encodeURIComponent(adminToken)}`;
  }

  async function shareLink() {
    const url = invitationUrl();
    const text = invitationText();
    const message = `${text}\n${url}`;
    if (!navigator.share) return copyText(message, 'Convite copiado!');
    try { await navigator.share({ title: data?.event.title || 'Bora', text, url }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast({ message: 'Não foi possível compartilhar o convite.', color: 'danger', duration: 2800 }); }
  }

  function shareOnWhatsApp() {
    const message = `${invitationText()}\n${invitationUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <IonPage><IonContent className="ion-padding center"><IonSpinner /><p>Carregando...</p></IonContent></IonPage>;
  }

  if (!data) {
    if (loadFailure === 'network') {
      return <IonPage><IonContent className="ion-padding center"><main><h1>Não foi possível carregar este Bora</h1><p>Confira sua conexão e tente novamente.</p><IonButton onClick={() => setLoadAttempt((current) => current + 1)}>Tentar novamente</IonButton><IonButton fill="clear" routerLink="/home">Voltar para o início</IonButton></main></IonContent></IonPage>;
    }
    if (loadFailure === 'server') {
      return <IonPage><IonContent className="ion-padding center"><main><h1>Este Bora está temporariamente indisponível</h1><p>O servidor respondeu com um erro. Tente novamente em instantes.</p><IonButton onClick={() => setLoadAttempt((current) => current + 1)}>Tentar novamente</IonButton><IonButton fill="clear" routerLink="/home">Voltar para o início</IonButton></main></IonContent></IonPage>;
    }
    return <IonPage><IonContent className="ion-padding center"><main><h1>Evento não encontrado</h1><p>Este link pode estar incorreto ou o evento pode ter sido excluído.</p><IonButton routerLink="/home">Voltar para o início</IonButton></main></IonContent></IonPage>;
  }

  const { event, votes } = data;
  const preferredTimeOptions = event.mode === 'mais-tarde' ? eventOptions(event) : [];
  const ownVote = data.ownVote || votes.find((vote) => vote.isOwn || vote.participantId === getParticipantId());
  const showVoteConfirmation = !isAdmin && !editingVote && Boolean(voteSubmitted || ownVote);
  const canPostMessage = isAdmin || Boolean(ownVote);
  const confirmationProgress = thresholdProgressPercentage(counts.accept, event.threshold);
  const editWeekDate = editEvent?.startsAt?.slice(0, 10) || '';
  const editScheduleValid = editEvent ? validEditableSchedule(editEvent, Boolean(overnightEditWeekDates[editWeekDate])) : true;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" text="Voltar" /></IonButtons>
          <IonTitle>{event.title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent ref={contentRef} className="ion-padding event-page">
        <section className="event-layout">
          {isAdmin && wasJustCreated && (
            <IonCard className="success-card ready-card">
              <IonCardContent>
                <div className="ready-card-copy">
                  <strong>Seu Bora está pronto!</strong>
                  <p>Agora é só chamar a galera.</p>
                </div>
                <div className="card-actions ready-card-actions">
                  <IonButton className="action-button action-button-primary" onClick={shareOnWhatsApp}><IonIcon slot="start" icon={logoWhatsapp} aria-hidden="true" />Compartilhar no WhatsApp</IonButton>
                  <IonButton className="action-button action-button-secondary" fill="outline" onClick={() => void copyText(`${invitationText()}\n${invitationUrl()}`, 'Convite copiado!')}>Copiar convite</IonButton>
                  {canShare && <IonButton className="action-button action-button-ghost" fill="clear" onClick={() => void shareLink()}>Mais opções</IonButton>}
                </div>
              </IonCardContent>
            </IonCard>
          )}
          {isAdmin && temporaryAdminAccess && (
            <IonCard className="temporary-admin-warning" role="alert">
              <IonCardContent>
                <div>
                  <strong>Acesso de organizador temporário</strong>
                  <p>Este navegador não conseguiu guardar seus controles. Copie e salve o link de organizador agora para não perder o acesso de edição.</p>
                </div>
                <IonButton color="warning" onClick={() => void copyText(organizerUrl(), 'Link de organizador copiado!', 'organizer')}>Copiar link de organizador</IonButton>
              </IonCardContent>
            </IonCard>
          )}
          <IonCard className="event-summary">
            <IonCardContent>
              <div className="event-kicker">
                <span>{event.mode === 'agora' ? 'Bora agora' : event.mode === 'mais-tarde' ? 'Bora essa semana' : 'Bora marcar'}</span>
                {event.votingClosed && <span className="closed-pill">Encerrado</span>}
              </div>
              <h1>{event.title}</h1>
              {event.decidedOption && <p className="decided-message"><strong>✓ Definido:</strong> {optionLabel(event, event.decidedOption)}</p>}
              <div className="event-facts">
                <p><span aria-hidden="true">📍</span><span><small>Local</small><strong>{event.place}</strong></span></p>
                {event.startsAt && <p><span aria-hidden="true">🗓️</span><span><small>Quando</small><strong>{new Date(event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span></p>}
              </div>
              {event.description && <p className="event-description">{event.description}</p>}
              <div className="status-block">
                <div className="status-heading">
                  <strong>{counts.accept} de {event.threshold} {event.threshold === 1 ? 'pessoa confirmou' : 'pessoas confirmaram'}</strong>
                </div>
                <div className="threshold-progress" role="progressbar" aria-label="Progresso das confirmações" aria-valuemin={0} aria-valuemax={Math.max(1, event.threshold)} aria-valuenow={Math.min(Math.max(0, counts.accept), Math.max(1, event.threshold))} aria-valuetext={`${counts.accept} de ${event.threshold} confirmações`}>
                  <span style={{ width: `${confirmationProgress}%` }} />
                </div>
                <p>{eventStatusText(event, votes, counts.accept)}</p>
              </div>
            </IonCardContent>
          </IonCard>

          {decidedCalendar && <IonCard className="calendar-card">
            <IonCardContent>
              <span className="section-eyebrow">{event.mode === 'agora' ? 'Bora marcado' : 'Plano confirmado'}</span>
              <h2>Coloque na sua agenda</h2>
              <p>{event.mode === 'agora' ? new Date(event.startsAt!).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : optionLabel(event, event.decidedOption)} · {event.place}</p>
              <div className="card-actions calendar-actions">
                <IonButton className="action-button action-button-primary" href={googleCalendarUrl(event, decidedCalendar)} target="_blank" rel="noopener">Adicionar ao Google Agenda</IonButton>
                <IonButton className="action-button action-button-secondary" fill="outline" onClick={downloadCalendar}>Baixar arquivo .ics</IonButton>
              </div>
            </IonCardContent>
          </IonCard>}

          {isAdmin && (
            <nav className="admin-nav" aria-label="Seções da administração">
              <button type="button" className={adminSection === 'overview' ? 'active' : ''} aria-pressed={adminSection === 'overview'} onClick={() => setAdminSection('overview')}>Resumo</button>
              <button type="button" className={adminSection === 'manage' ? 'active' : ''} aria-pressed={adminSection === 'manage'} onClick={() => setAdminSection('manage')}>Gerenciar</button>
            </nav>
          )}

          <div>
            {!isAdmin && (
              <IonCard className={`vote-card ${showVoteConfirmation ? 'vote-card-complete' : ''}`}>
                <IonCardContent>
                  {showVoteConfirmation ? (
                    <div className="vote-confirmation">
                      <span className="confirmation-icon" aria-hidden="true">✓</span>
                      <div>
                        <h2>Voto registrado</h2>
                        <p>
                        {ownVote
                          ? `${responseLabel(ownVote.response)}${ownVote.preferredOptions.length ? ` · pode ${ownVote.preferredOptions.map((option) => optionLabel(event, option)).join(', ')}` : ''}`
                          : 'Sua resposta foi salva.'}
                        </p>
                      </div>
                      {!event.votingClosed && <IonButton fill="clear" onClick={() => setEditingVote(true)}>Alterar</IonButton>}
                    </div>
                  ) : (
                    <>
                      <div className="vote-heading">
                        <span className="section-eyebrow">Sua resposta</span>
                        {event.decidedOption ? <><h2>Confirme sua presença</h2><p className="decision-attendance"><strong>Horário definido</strong><span>{optionLabel(event, event.decidedOption)}</span></p></> : <><h2>{event.mode === 'agora' ? 'Você topa?' : event.mode === 'mais-tarde' ? 'Qual horário funciona?' : 'Quando você pode?'}</h2><p>Leva menos de um minuto.</p></>}
                      </div>
                      <IonItem className={`name-field ${voteValidationError === 'name' ? 'ion-invalid' : ''}`} lines="none"><IonLabel position="stacked">Seu nome</IonLabel><IonInput ref={nameInputRef} value={name} aria-label="Seu nome" aria-invalid={voteValidationError === 'name'} aria-describedby={voteValidationError === 'name' ? 'vote-name-error' : undefined} maxlength={80} onIonInput={(e) => updateName(e.detail.value || '')} placeholder="Ana" required /></IonItem>
                      {voteValidationError === 'name' && <IonNote id="vote-name-error" className="field-error" color="danger" role="alert">Informe seu nome para responder.</IonNote>}

                      {!event.decidedOption && event.mode === 'mais-tarde' && (
                        <div className="time-options" aria-describedby={voteValidationError === 'options' ? 'vote-options-error' : undefined}>
                          <h3>Marque todos os horários que funcionam</h3>
                          {preferredTimeOptions.map((option) => (
                            <IonItem key={option.id} lines="none">
                              <IonCheckbox checked={preferredOptions.includes(option.id)} aria-label={`Marcar ${option.primary ? 'horário principal, ' : ''}${option.label}`} onIonChange={() => togglePreferredOption(option.id)} />
                              <IonLabel className="ion-margin-start">{option.primary ? `Principal · ${option.label}` : option.label}</IonLabel>
                            </IonItem>
                          ))}
                          {voteValidationError === 'options' && <IonNote id="vote-options-error" className="field-error" color="danger" role="alert">Marque pelo menos um horário ou escolha “Não posso”.</IonNote>}
                        </div>
                      )}

                      {!event.decidedOption && event.mode === 'marcar' && (
                        <div aria-describedby={voteValidationError === 'options' ? 'vote-availability-error' : undefined}>
                          <h3>Marque os horários em que você pode</h3>
                          <p className="scroll-hint">Deslize para ver mais dias.</p>
                          <div className="day-scroll">
                            {event.days.map((day) => (
                              <div className="day-card" key={day.id}>
                                <h4>{day.label}</h4>
                                <p>{new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}</p>
                                {day.slots.map((slot) => {
                                  const selected = (availability[day.id] || []).includes(slot);
                                  return <button type="button" key={slot} className={selected ? 'slot selected' : 'slot'} aria-pressed={selected} aria-label={`${day.label}, ${slot}`} onClick={() => toggleSlot(day.id, slot)}>{slot}</button>;
                                })}
                              </div>
                            ))}
                          </div>
                          {voteValidationError === 'options' && <IonNote id="vote-availability-error" className="field-error" color="danger" role="alert">Marque pelo menos um horário ou escolha “Não posso”.</IonNote>}
                        </div>
                      )}

                      <div className="vote-actions" aria-label="Registrar voto">
                        <IonButton className="response-yes" disabled={event.votingClosed || submittingVote} onClick={() => void vote('accept')}><span><b aria-hidden="true">🙌</b>{submittingVote ? 'Salvando...' : 'Posso'}</span></IonButton>
                        <IonButton className="response-maybe" fill="outline" disabled={event.votingClosed || submittingVote} onClick={() => void vote('maybe')}><span><b aria-hidden="true">🤔</b>Talvez</span></IonButton>
                        <IonButton className="response-no" fill="clear" disabled={event.votingClosed || submittingVote} onClick={() => void vote('decline')}><span><b aria-hidden="true">😔</b>Não posso</span></IonButton>
                      </div>
                      {event.votingClosed && <p className="closed-message">As confirmações foram encerradas pelo organizador.</p>}
                    </>
                  )}
                </IonCardContent>
              </IonCard>
            )}

            {isAdmin && adminSection === 'manage' && (
              <section className="admin-manage" aria-labelledby="manage-title">
                <div className="admin-section-heading">
                  <span className="section-eyebrow">Organizador</span>
                  <h2 id="manage-title">Gerenciar evento</h2>
                  <p>Compartilhe, edite ou controle a votação.</p>
                </div>
                <div className="manage-grid">
                <IonCard className="manage-section share-section">
                  <IonCardContent>
                    <span className="section-eyebrow">Convidar pessoas</span>
                    <h3>Compartilhe o convite com a galera.</h3>
                    <p className="muted">O link de convite não dá acesso aos controles do organizador.</p>
                    <div className="card-actions share-actions">
                      <IonButton className="action-button action-button-primary" expand="block" onClick={shareOnWhatsApp}><IonIcon slot="start" icon={logoWhatsapp} aria-hidden="true" />Compartilhar no WhatsApp</IonButton>
                      <IonButton className="action-button action-button-secondary" expand="block" fill="outline" onClick={() => void copyText(`${invitationText()}\n${invitationUrl()}`, 'Convite copiado!')}>Copiar convite</IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
                <IonCard className="manage-section details-section">
                  <IonCardContent>
                    <span className="section-eyebrow">Informações</span>
                    <h3>Detalhes do evento</h3>
                    <dl className="event-details-list"><div><dt>Quando</dt><dd>{event.startsAt ? new Date(event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : event.mode === 'marcar' ? 'Dias e horários a combinar' : 'Data a combinar'}</dd></div><div><dt>Local</dt><dd>{event.place}</dd></div><div><dt>Meta de confirmações</dt><dd>{event.threshold} confirmações</dd></div></dl>
                    <div className="card-actions card-actions-single">
                      <IonButton className="action-button action-button-primary" onClick={openEdit}>Editar detalhes do evento</IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
                <IonCard className="manage-section responses-section">
                  <IonCardContent>
                    <span className="section-eyebrow">Respostas</span>
                    <h3>{event.votingClosed ? 'Confirmações encerradas' : 'Confirmações abertas'}</h3>
                    <p className="muted">{event.votingClosed ? 'Convidados não podem enviar nem alterar respostas.' : 'Convidados ainda podem responder ao convite.'}</p>
                    {event.decidedOption && <div className="decision-summary">
                      <strong>Horário definido</strong><span>{optionLabel(event, event.decidedOption)}</span>
                    </div>}
                    <div className="card-actions response-actions">
                      <IonButton className={`action-button ${event.votingClosed ? 'action-button-primary' : 'action-button-secondary'}`} fill={event.votingClosed ? 'solid' : 'outline'} onClick={() => void toggleVoting()} disabled={savingAdminAction}>{event.votingClosed ? 'Reabrir confirmações' : 'Encerrar confirmações'}</IonButton>
                      {event.decidedOption && <IonButton className="action-button action-button-secondary" fill="outline" onClick={() => void clearDecision()} disabled={savingAdminAction}>Remover decisão</IonButton>}
                    </div>
                  </IonCardContent>
                </IonCard>
                </div>
                <IonCard className="danger-zone">
                  <IonCardContent>
                    <div>
                      <h3>Excluir evento</h3>
                      <p>Apaga o evento e todos os votos permanentemente.</p>
                    </div>
                    <IonButton className="action-button action-button-destructive" color="danger" onClick={confirmDelete} disabled={savingAdminAction}>Excluir evento</IonButton>
                  </IonCardContent>
                </IonCard>
              </section>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'marcar' && (
                <IonCard>
                <IonCardHeader><IonCardTitle>Melhores horários</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {availabilitySummary.length === 0 && <p>Nenhuma disponibilidade enviada ainda.</p>}
                  {availabilitySummary.length > 0 && <p className="results-note">Respostas “Posso” e “Talvez” entram na contagem dos horários selecionados.</p>}
                  {groupedAvailability.map((group) => {
                    const selected = group.items.find((item) => `${item.day.id}:${item.slot}` === event.decidedOption);
                    const open = expandedResultDays[group.label] ?? (event.decidedOption ? Boolean(selected) : group.items.some((item) => item.count === maxAvailabilityCount));
                    return <details className={`result-date-group ${event.decidedOption && !selected ? 'result-date-group-muted' : ''}`} key={group.label} open={open} onToggle={(item) => setResultDayExpanded(group.label, item.currentTarget.open)}>
                    <summary><span>{group.label}</span><span>{selected ? <>Escolhido · {selected.slot}</> : <>{group.items.length} horário{group.items.length === 1 ? '' : 's'}</>} <b aria-hidden="true">⌄</b></span></summary>
                    <div className="result-date-content">
                    {group.items.map((item) => {
                      const percentage = thresholdProgressPercentage(item.count, event.threshold);
                      const isBestTime = maxAvailabilityCount > 0 && item.count === maxAvailabilityCount;
                      return <div className={`result-row ${`${item.day.id}:${item.slot}` === event.decidedOption ? 'result-row-chosen' : ''}`} key={`${item.day.id}-${item.slot}`}>
                        <strong>{item.slot}</strong>
                        {`${item.day.id}:${item.slot}` === event.decidedOption && <IonBadge color="success">Escolhido</IonBadge>}
                        <IonBadge className={isBestTime ? 'result-count-best' : ''} color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count} de {event.threshold}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={`${item.day.label}, ${item.slot}`} aria-valuemin={0} aria-valuemax={Math.max(1, event.threshold)} aria-valuenow={Math.min(Math.max(0, item.count), Math.max(1, event.threshold))} aria-valuetext={`${item.count} de ${event.threshold} disponíveis`}><span style={{ width: `${percentage}%` }} /></div>
                        <span>{item.count === 1 ? '1 pessoa disponível' : `${item.count} pessoas disponíveis`}{item.names.length ? ` · ${item.names.join(', ')}` : ''}</span>
                        {isAdmin && !event.decidedOption && <IonButton size="small" fill="outline" onClick={() => void decideOption(`${item.day.id}:${item.slot}`)} disabled={savingAdminAction}>Escolher este horário</IonButton>}
                      </div>;
                    })}
                    </div>
                  </details>;
                  })}
                </IonCardContent>
              </IonCard>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'mais-tarde' && (
              <IonCard>
                <IonCardHeader><IonCardTitle>Horários preferidos</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {(event.decidedOption ? timePreferences : (showAllResults ? timePreferences : timePreferences.slice(0, 3))).map((item) => {
                    const percentage = thresholdProgressPercentage(item.count, event.threshold);
                    return (
                      <div className={`result-row ${item.option.id === event.decidedOption ? 'result-row-chosen' : ''}`} key={item.option.id}>
                        <strong>{item.option.primary ? `Horário principal · ${item.option.label}` : item.option.label}</strong>
                        {item.option.id === event.decidedOption && <IonBadge color="success">Escolhido</IonBadge>}
                        <IonBadge color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count} de {event.threshold}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={item.option.label} aria-valuemin={0} aria-valuemax={Math.max(1, event.threshold)} aria-valuenow={Math.min(Math.max(0, item.count), Math.max(1, event.threshold))} aria-valuetext={`${item.count} de ${event.threshold} preferências`}>
                          <span style={{ width: `${percentage}%` }} />
                        </div>
                        <span>{item.count === 1 ? '1 pessoa pode' : `${item.count} pessoas podem`}</span>
                        {isAdmin && !event.decidedOption && <IonButton size="small" fill="outline" onClick={() => void decideOption(item.option.id)} disabled={savingAdminAction}>Escolher este horário</IonButton>}
                      </div>
                    );
                  })}
                  {timePreferences.length > 3 && <IonButton fill="clear" onClick={() => setShowAllResults((current) => !current)}>{showAllResults ? 'Ver menos horários' : `Ver mais horários (${timePreferences.length - 3})`}</IonButton>}
                </IonCardContent>
              </IonCard>
            )}

            {(!isAdmin || adminSection === 'overview') && <IonCard className="votes-card">
              <IonCardHeader>
                <IonCardTitle>Quem respondeu</IonCardTitle>
                <div className="count-row" aria-label="Resumo dos votos">
                  <span className="count-pill accept">🙌 {counts.accept}</span>
                  <span className="count-pill maybe">🤔 {counts.maybe}</span>
                  <span className="count-pill decline">😔 {counts.decline}</span>
                </div>
              </IonCardHeader>
              <IonCardContent>
                {votes.length === 0 && <p>Ninguém votou ainda. Seja a primeira pessoa.</p>}
                {data.votesTruncated && <IonNote className="votes-truncated-note" color="medium" role="status">Os totais e as barras incluem todas as respostas. A lista abaixo mostra apenas uma parte dos nomes mais recentes.</IonNote>}
                <IonList>
                  {votes.map((vote) => (
                    <IonItem key={vote.id}>
                      <IonLabel>
                        <h3>{vote.voterName}</h3>
                        <p>{responseLabel(vote.response)}{vote.preferredOptions.length ? ` · pode ${vote.preferredOptions.map((option) => optionLabel(event, option)).join(', ')}` : ''}</p>
                      </IonLabel>
                    </IonItem>
                  ))}
                </IonList>
                {data.votePage?.hasMore && data.votePage.nextCursor && <IonButton fill="outline" onClick={() => void loadMoreVotes()} disabled={loadingMoreVotes}>
                  {loadingMoreVotes ? 'Carregando nomes…' : 'Carregar mais nomes'}
                </IonButton>}
              </IonCardContent>
            </IonCard>}

            {(!isAdmin || adminSection === 'overview') && <IonCard className="messages-card">
              <IonCardHeader><IonCardTitle>Recados</IonCardTitle></IonCardHeader>
              <IonCardContent>
                {(data.messages || []).length === 0 ? <p className="muted">Ainda não tem recados.</p> : (
                  <IonList className="message-list" aria-label="Recados do evento">
                    {(data.messages || []).map((message) => (
                      <IonItem key={message.id} className="message-item">
                        <IonLabel>
                          <h3>{message.authorName}</h3>
                          <p className="message-body">{message.body}</p>
                          <small>{new Date(message.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
                        </IonLabel>
                        {(isAdmin || message.isOwn) && <IonButton slot="end" fill="clear" color="medium" size="small" aria-label={`Excluir recado de ${message.authorName}`} disabled={removingMessageId === message.id} onClick={() => void removeMessage(message.id)}>{removingMessageId === message.id ? 'Removendo…' : 'Excluir'}</IonButton>}
                      </IonItem>
                    ))}
                  </IonList>
                )}
                {data.messagesClosed ? <p className="muted message-closed-note">Este Bora já aconteceu. Os recados continuam disponíveis para leitura.</p> : !canPostMessage ? (
                  <p className="muted message-closed-note">{event.votingClosed ? <>As confirmações estão encerradas.<br />Apenas quem já participa deste Bora pode deixar recados.</> : 'Responda a este Bora antes de deixar um recado.'}</p>
                ) : (
                  <div className="message-composer">
                    <IonTextarea value={messageBody} maxlength={500} autoGrow aria-label="Escrever um recado" placeholder="Escrever um recado..." onIonInput={(item) => setMessageBody(item.detail.value || '')} disabled={submittingMessage} />
                    <div className="message-composer-actions"><IonNote color="medium">{messageBody.trim().length}/500</IonNote><IonButton onClick={() => void sendMessage()} disabled={submittingMessage || !messageBody.trim()}>{submittingMessage ? 'Enviando…' : 'Enviar'}</IonButton></div>
                  </div>
                )}
              </IonCardContent>
            </IonCard>}
          </div>

        </section>

        <IonModal
          isOpen={Boolean(editEvent)}
          onDidPresent={() => void editTitleRef.current?.setFocus()}
          onDidDismiss={() => {
            setEditEvent(null);
            window.requestAnimationFrame(() => editOpenerRef.current?.focus());
          }}
          className="event-editor-modal"
        >
          <IonHeader>
            <IonToolbar>
              <IonTitle>Editar Bora</IonTitle>
              <IonButtons slot="end"><IonButton onClick={() => setEditEvent(null)}>Fechar</IonButton></IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding form-page">
            {editEvent && (
              <div className="event-editor">
                <section className="create-intro">
                  <span className="section-eyebrow">Editar convite</span>
                  <h1>Editar Bora</h1>
                  <p>Atualize os detalhes que seus convidados vão receber.</p>
                </section>
                <IonCard className="create-card event-editor-card"><IonCardContent>
                <section aria-label="Detalhes do convite">
                  <IonItem className={editSubmitted && !editEvent.title.trim() ? 'ion-invalid' : ''}><IonLabel position="stacked">Nome do evento *</IonLabel><IonInput ref={editTitleRef} value={editEvent.title} aria-label="Nome do evento" aria-invalid={editSubmitted && !editEvent.title.trim()} aria-describedby={editSubmitted && !editEvent.title.trim() ? 'edit-title-error' : undefined} onIonInput={(item) => updateEdit({ title: item.detail.value || '' })} required /></IonItem>
                  {editSubmitted && !editEvent.title.trim() && <IonNote id="edit-title-error" className="field-error" color="danger">Informe o nome do evento.</IonNote>}
                  <IonItem className={editSubmitted && !editEvent.place.trim() ? 'ion-invalid' : ''}><IonLabel position="stacked">Local *</IonLabel><IonInput value={editEvent.place} aria-label="Local" aria-invalid={editSubmitted && !editEvent.place.trim()} aria-describedby={editSubmitted && !editEvent.place.trim() ? 'edit-place-error' : undefined} onIonInput={(item) => updateEdit({ place: item.detail.value || '' })} required /></IonItem>
                  {editSubmitted && !editEvent.place.trim() && <IonNote id="edit-place-error" className="field-error" color="danger">Informe o local.</IonNote>}
                  <IonItem><IonLabel position="stacked">Descrição <span className="optional-label">(opcional)</span></IonLabel><IonTextarea value={editEvent.description || ''} aria-label="Descrição opcional" onIonInput={(item) => updateEdit({ description: item.detail.value || '' })} /></IonItem>
                </section>
                <section className="threshold-control" aria-labelledby="editor-threshold-title">
                  <div><strong id="editor-threshold-title">Quantas pessoas precisam confirmar?</strong><small>Incluindo você</small></div>
                  <div className="stepper">
                    <button type="button" onClick={() => changeEditThreshold(-1)} disabled={editEvent.threshold <= minThreshold} aria-label="Diminuir confirmações">−</button>
                    <input value={editEvent.threshold} inputMode="numeric" aria-label="Número mínimo de confirmações" aria-invalid={editSubmitted && (!Number.isInteger(editEvent.threshold) || editEvent.threshold < minThreshold || editEvent.threshold > maxThreshold)} onChange={(item) => updateEdit({ threshold: Math.min(maxThreshold, Math.max(minThreshold, Number(item.target.value.replace(/\D/g, '')) || minThreshold)) })} />
                    <button type="button" onClick={() => changeEditThreshold(1)} disabled={editEvent.threshold >= maxThreshold} aria-label="Aumentar confirmações">+</button>
                  </div>
                </section>
                {editEvent.mode === 'agora' && <section className="schedule-section">
                  <h2>Quando?</h2><p className="muted">Escolha o dia e um horário no futuro.</p>
                  <div className="agora-day-picker" role="group" aria-label="Dia do Bora">
                    <button type="button" className={editAgoraDay() === localDateKey() ? 'selected' : ''} aria-pressed={editAgoraDay() === localDateKey()} onClick={() => updateEditAgoraDay(localDateKey())}>Hoje</button>
                    <button type="button" className={editAgoraDay() === tomorrowKey ? 'selected' : ''} aria-pressed={editAgoraDay() === tomorrowKey} onClick={() => updateEditAgoraDay(tomorrowKey)}>Amanhã</button>
                  </div>
                  <div className="agora-date-summary"><p className="schedule-summary">{(editAgoraDay() === localDateKey() ? 'Hoje' : editAgoraDay() === tomorrowKey ? 'Amanhã' : resultDateLabel(editAgoraDay(), true))} às {pickerTime(editEvent.startsAt)}</p><IonButton fill="clear" size="small" onClick={() => { editCalendarOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditCalendarOpen(true); }}>Outra data</IonButton></div>
                  <IonItem><IonLabel position="stacked">Horário</IonLabel><IonDatetime presentation="time" hourCycle="h23" value={editEvent.startsAt} aria-label="Horário do Bora" onIonChange={(item) => updateEditAgoraTime(item.detail.value)} /></IonItem>
                  {editAgoraDay() === localDateKey() && !futureAgoraTime(localDateKey(), pickerTime(editEvent.startsAt)) && <IonNote className="field-error" color="danger">Escolha um horário futuro para hoje.</IonNote>}
                </section>}
                {editEvent.mode === 'mais-tarde' && <section className="schedule-section"><h2>Escolha o dia e horário</h2><IonItem><IonDatetime value={editEvent.startsAt} aria-label="Data e horário principal" onIonChange={(item) => updateEditMoreLaterStart(item.detail.value)} /></IonItem><IonButton fill="clear" size="small" onClick={toggleEditWeekOvernightTimes} aria-expanded={Boolean(overnightEditWeekDates[editWeekDate])} aria-controls="edit-week-overnight-note">{overnightEditWeekDates[editWeekDate] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton>{overnightEditWeekDates[editWeekDate] && <p id="edit-week-overnight-note" className="muted">Horários entre 01:00 e 07:00 liberados para este dia.</p>}</section>}

                {editEvent.mode === 'marcar' && (
                  <section className="schedule-section mark-section" aria-labelledby="edit-schedule-title">
                    <div className="section-heading-row"><div><h2 id="edit-schedule-title">Dias e horários</h2><p className="muted">Abra cada dia para ajustar os horários.</p></div><IonButton fill="outline" size="small" onClick={useSameEditTimes}>Usar os mesmos horários</IonButton></div>
                    {editEvent.days.map((day) => (
                      <details key={day.id} className="day-accordion" open={editEvent.days.length === 1}>
                        <summary><span><strong>{resultDateLabel(day.date, true)}</strong><small>{day.slots.length === 0 ? 'Sem horários' : `${day.slots.length} horário${day.slots.length === 1 ? '' : 's'}`}</small></span><span aria-hidden="true">⌄</span></summary>
                        <div className="day-accordion-content">
                          <IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" min={localDateKey()} value={day.date} aria-label={`Data de ${resultDateLabel(day.date, true)}`} onIonInput={(item) => updateEditDayDate(day.id, item.detail.value || day.date)} /></IonItem>
                          <div className="time-chip-grid" role="group" aria-label={`Horários de ${resultDateLabel(day.date, true)}`}>{(overnightEditDays[day.id] ? [...overnightScheduleTimes, ...scheduleTimes] : scheduleTimes).map((slot) => <button type="button" key={slot} className={day.slots.includes(slot) ? 'selected' : ''} aria-pressed={day.slots.includes(slot)} onClick={() => toggleEditSlot(day.id, slot, !day.slots.includes(slot))}>{day.slots.includes(slot) ? '✓ ' : ''}{slot}</button>)}</div>
                          <div className="day-actions"><IonButton fill="clear" size="small" onClick={() => duplicateEditDay(day.id)}>Duplicar dia</IonButton><IonButton fill="clear" size="small" onClick={() => toggleEditOvernightTimes(day.id)} aria-expanded={Boolean(overnightEditDays[day.id])}>{overnightEditDays[day.id] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton><IonButton color="danger" fill="clear" size="small" onClick={() => removeEditDay(day.id)}>Remover dia</IonButton></div>
                        </div>
                      </details>
                    ))}
                    <IonButton fill="outline" onClick={addEditDay}>+ Adicionar dia</IonButton>
                  </section>
                )}

                {editSubmitted && !editScheduleValid && <IonNote className="field-error" color="danger" role="alert">Revise as datas e os horários. Cada opção deve ser válida, futura e sem duplicação.</IonNote>}

                <IonButton expand="block" size="large" onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar alterações'}</IonButton>
                </IonCardContent></IonCard>
              </div>
            )}
          </IonContent>
        </IonModal>
        <IonModal
          isOpen={editCalendarOpen}
          onDidPresent={() => void editCalendarInputRef.current?.setFocus()}
          onDidDismiss={() => {
            setEditCalendarOpen(false);
            window.requestAnimationFrame(() => editCalendarOpenerRef.current?.focus());
          }}
        >
          <IonHeader><IonToolbar><IonTitle>Alterar data</IonTitle><IonButtons slot="end"><IonButton onClick={() => setEditCalendarOpen(false)}>Fechar</IonButton></IonButtons></IonToolbar></IonHeader>
          <IonContent className="ion-padding"><IonItem><IonLabel position="stacked">Data</IonLabel><IonInput ref={editCalendarInputRef} type="date" aria-label="Data do Bora" min={localDateKey()} value={editAgoraDay()} onIonInput={(event) => { const date = event.detail.value || editAgoraDay(); updateEditAgoraDay(date); setEditCalendarOpen(false); }} /></IonItem></IonContent>
        </IonModal>
        <IonModal
          isOpen={Boolean(copyFallback)}
          onDidPresent={() => {
            void copyTextareaRef.current?.setFocus().then(async () => (await copyTextareaRef.current?.getInputElement())?.select());
          }}
          onDidDismiss={() => {
            setCopyFallback(null);
            window.requestAnimationFrame(() => copyOpenerRef.current?.focus());
          }}
          className="copy-fallback-modal"
        >
          <IonHeader><IonToolbar><IonTitle>{copyFallback?.kind === 'organizer' ? 'Guardar link de organizador' : 'Copiar convite seguro'}</IonTitle><IonButtons slot="end"><IonButton onClick={() => setCopyFallback(null)}>Fechar</IonButton></IonButtons></IonToolbar></IonHeader>
          <IonContent className="ion-padding form-page">
            <section className="copy-fallback-content">
              <h2>A cópia automática não funcionou</h2>
              <p>{copyFallback?.kind === 'organizer' ? 'Selecione, copie e guarde o link abaixo. Quem tiver esse link poderá editar ou excluir o evento.' : 'Selecione e copie o texto abaixo. Ele usa o link público do convite e não inclui os controles do organizador.'}</p>
              <IonTextarea ref={copyTextareaRef} value={copyFallback?.text || ''} aria-label={copyFallback?.kind === 'organizer' ? 'Link de organizador' : 'Texto do convite seguro'} readonly autoGrow rows={8} />
            </section>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}
