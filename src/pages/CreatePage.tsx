import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonModal, IonNote, IonPage, IonTextarea, IonTitle, IonToolbar, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createEvent, getParticipantName, saveParticipantName } from '../lib/store';
import { localDateKey, toInstantIso } from '../lib/datetime';
import { uid } from '../lib/schedule';
import type { BoraMode, ScheduleDay } from '../lib/types';

const modeDetails: Record<BoraMode, { title: string; description: string }> = {
  agora: { title: 'Bora agora', description: 'Combine algo para acontecer agora ou em breve.' },
  'mais-tarde': { title: 'Bora essa semana', description: 'Escolha um dia e alguns horários para a galera votar.' },
  marcar: { title: 'Bora marcar', description: 'Ofereça vários dias e horários para encontrar a melhor combinação.' }
};

const timeChoices = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const overnightTimeChoices = Array.from({ length: 7 }, (_, index) => `0${index + 1}:00`);
const maxThreshold = 999;

function dateTimeValue(date: string, time: string) {
  return `${date}T${time}:00`;
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

function dayLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: '2-digit' });
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function weekDates(anchor = new Date()) {
  const first = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return localDateKey(day);
  });
}

function futureTime(date: string, time: string) {
  return validDateValue(date) && validTimeValue(time) && new Date(dateTimeValue(date, time)).getTime() > Date.now();
}

function oneHourFromNow() {
  const result = new Date();
  result.setHours(result.getHours() + 1);
  return {
    date: localDateKey(result),
    time: `${String(result.getHours()).padStart(2, '0')}:${String(result.getMinutes()).padStart(2, '0')}`
  };
}

function sortedTimes(times: string[]) {
  return Array.from(new Set(times)).sort((left, right) => left.localeCompare(right));
}

function newDay(date = localDateKey(), slots: string[] = []): ScheduleDay {
  return { id: uid('day'), label: dayLabel(date), date, slots: sortedTimes(slots) };
}

export default function CreatePage() {
  const router = useIonRouter();
  const location = useLocation();
  const [toast] = useIonToast();
  const requestedMode = new URLSearchParams(location.search).get('mode');
  const mode: BoraMode = requestedMode === 'mais-tarde' || requestedMode === 'marcar' ? requestedMode : 'agora';
  const initialAgora = oneHourFromNow();
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [placeInTitle, setPlaceInTitle] = useState(false);
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState(3);
  const [createdByName, setCreatedByName] = useState(getParticipantName);
  const [agoraDate, setAgoraDate] = useState(initialAgora.date);
  const [agoraTime, setAgoraTime] = useState(initialAgora.time);
  const [weekDate, setWeekDate] = useState(() => localDateKey());
  const [weekTimes, setWeekTimes] = useState<string[]>([]);
  const [overnightWeekDates, setOvernightWeekDates] = useState<Record<string, boolean>>({});
  const [timeDraft, setTimeDraft] = useState('18:00');
  const [days, setDays] = useState<ScheduleDay[]>(() => [newDay()]);
  const [overnightDays, setOvernightDays] = useState<Record<string, boolean>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const calendarOpenerRef = useRef<HTMLIonButtonElement>(null);
  const calendarInputRef = useRef<HTMLIonInputElement>(null);
  const timeOpenerRef = useRef<HTMLButtonElement>(null);
  const firstQuickTimeRef = useRef<HTMLButtonElement>(null);

  useIonViewWillEnter(() => {
    if (mode === 'agora') {
      const nextStart = oneHourFromNow();
      setAgoraDate(nextStart.date);
      setAgoraTime(nextStart.time);
    }
  }, [mode]);

  const week = useMemo(() => weekDates(), []);
  const today = localDateKey();
  const tomorrowKey = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return localDateKey(next);
  }, []);
  const sortedDays = useMemo(() => [...days].sort((left, right) => left.date.localeCompare(right.date)), [days]);
  const hasDuplicateDates = new Set(days.map((day) => day.date)).size !== days.length;
  const hasDuplicateDayIds = new Set(days.map((day) => day.id)).size !== days.length;
  const markScheduleValid = days.length > 0 && !hasDuplicateDates && !hasDuplicateDayIds && days.every((day) =>
    day.id.trim() && validDateValue(day.date) && day.slots.length > 0
    && new Set(day.slots).size === day.slots.length
    && day.slots.every((slot) => futureTime(day.date, slot))
  );
  const weekScheduleValid = validDateValue(weekDate) && weekTimes.length > 0 && new Set(weekTimes).size === weekTimes.length
    && weekTimes.every((time) => futureTime(weekDate, time) && (!earlyMorningTime(time) || overnightWeekDates[weekDate]));
  const agoraValid = futureTime(agoraDate, agoraTime);
  const detail = modeDetails[mode];

  function changeThreshold(next: number) {
    setThreshold(Math.min(maxThreshold, Math.max(1, Number.isFinite(next) ? Math.round(next) : 1)));
  }

  function updateCreatedByName(value: string) {
    setCreatedByName(value);
    saveParticipantName(value);
  }

  function updatePlaceInTitle(enabled: boolean) {
    // Keep the typed place intact so turning this off always restores it.
    setPlaceInTitle(enabled);
  }

  function selectAgoraDay(next: 'hoje' | 'amanha') {
    if (next === 'hoje') {
      setAgoraDate(today);
      if (!futureTime(today, agoraTime)) {
        toast({ message: 'Escolha um horário futuro para hoje.', color: 'warning', duration: 2400 });
      }
      return;
    }
    setAgoraDate(tomorrowKey);
  }

  function updateAgoraTime(time: string) {
    setAgoraTime(time);
    if (!validTimeValue(time)) return;

    // A time earlier than now means the next occurrence is after midnight.
    // The day chip stays visible, so switching to tomorrow is never silent.
    if (agoraDate === today && !futureTime(today, time)) {
      setAgoraDate(tomorrowKey);
    }
  }

  function updateAgoraDate(date: string) {
    setAgoraDate(date);
  }

  function selectAgoraTime(value: string | string[] | null | undefined) {
    if (typeof value !== 'string') return;
    const match = value.match(/T(\d{2}:\d{2})/);
    if (match) updateAgoraTime(match[1]);
  }

  function pickQuickTime(hours: number) {
    const next = new Date();
    next.setHours(next.getHours() + hours);
    setAgoraDate(localDateKey(next));
    setAgoraTime(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
    setTimePickerOpen(false);
  }

  function addWeekTime(time = timeDraft) {
    if (!validTimeValue(time)) {
      toast({ message: 'Digite um horário válido entre 00:00 e 23:59.', color: 'warning', duration: 2400 });
      return;
    }
    if (earlyMorningTime(time) && !overnightWeekDates[weekDate]) {
      toast({ message: 'Mostre os horários da madrugada deste dia antes de adicionar um horário entre 01:00 e 07:00.', color: 'warning', duration: 3000 });
      return;
    }
    if (!futureTime(weekDate, time)) {
      toast({ message: 'Escolha um horário futuro para este dia.', color: 'warning', duration: 2400 });
      return;
    }
    setWeekTimes((current) => sortedTimes([...current, time]));
  }

  function selectWeekDate(date: string) {
    setWeekDate(date);
    if (!overnightWeekDates[date]) {
      setWeekTimes((current) => current.filter((time) => !earlyMorningTime(time)));
    }
  }

  function toggleWeekOvernightTimes() {
    const enabled = !overnightWeekDates[weekDate];
    setOvernightWeekDates((current) => ({ ...current, [weekDate]: enabled }));
    if (!enabled) setWeekTimes((times) => times.filter((time) => !earlyMorningTime(time)));
  }

  function addRelativeWeekTime(hours: number) {
    if (!validTimeValue(timeDraft)) {
      toast({ message: 'Digite um horário válido primeiro.', color: 'warning', duration: 2400 });
      return;
    }
    const [hour, minute] = timeDraft.split(':').map(Number);
    const totalMinutes = hour * 60 + minute + hours * 60;
    if (totalMinutes >= 24 * 60) {
      toast({ message: 'Esse atalho passaria da meia-noite. Escolha o dia seguinte para evitar ambiguidade.', color: 'warning', duration: 2800 });
      return;
    }
    addWeekTime(`${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`);
  }

  function updateDay(dayId: string, patch: Partial<ScheduleDay>) {
    setDays((current) => current.map((day) => day.id === dayId ? { ...day, ...patch } : day));
  }

  function toggleDayTime(dayId: string, slot: string) {
    const day = days.find((item) => item.id === dayId);
    if (!day) return;
    if (!day.slots.includes(slot) && !futureTime(day.date, slot)) {
      toast({ message: 'Não é possível oferecer um horário que já passou.', color: 'warning', duration: 2400 });
      return;
    }
    updateDay(dayId, { slots: day.slots.includes(slot) ? day.slots.filter((item) => item !== slot) : sortedTimes([...day.slots, slot]) });
  }

  function addDay() {
    const last = sortedDays[sortedDays.length - 1]?.date || today;
    const next = new Date(`${last}T12:00:00`);
    next.setDate(next.getDate() + 1);
    setDays((current) => [...current, newDay(localDateKey(next))]);
  }

  function duplicateDay(day: ScheduleDay) {
    const date = new Date(`${day.date}T12:00:00`);
    date.setDate(date.getDate() + 1);
    const duplicate = newDay(localDateKey(date), day.slots.filter((slot) => futureTime(localDateKey(date), slot)));
    setDays((current) => [...current, duplicate]);
    if (duplicate.slots.some((slot) => overnightTimeChoices.includes(slot))) {
      setOvernightDays((current) => ({ ...current, [duplicate.id]: true }));
    }
  }

  function removeDay(dayId: string) {
    setDays((current) => current.filter((day) => day.id !== dayId));
    setOvernightDays((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== dayId)));
  }

  function toggleOvernightTimes(dayId: string) {
    const enabled = !overnightDays[dayId];
    setOvernightDays((current) => ({ ...current, [dayId]: enabled }));
    if (!enabled) {
      const day = days.find((item) => item.id === dayId);
      if (day) updateDay(dayId, { slots: day.slots.filter((slot) => !overnightTimeChoices.includes(slot)) });
    }
  }

  function useSameTimes() {
    const source = sortedDays.find((day) => day.slots.length > 0);
    if (!source) {
      toast({ message: 'Escolha horários em um dia primeiro.', color: 'warning', duration: 2400 });
      return;
    }
    setDays((current) => current.map((day) => ({ ...day, slots: source.slots.filter((slot) => futureTime(day.date, slot) && (overnightDays[day.id] || !overnightTimeChoices.includes(slot))) })));
  }

  async function submit() {
    setSubmitted(true);
    const resolvedPlace = placeInTitle ? title.trim() : place.trim();
    const commonValid = title.trim() && resolvedPlace && createdByName.trim() && threshold >= 1 && threshold <= maxThreshold;
    const modeValid = mode === 'agora' ? agoraValid : mode === 'mais-tarde' ? weekScheduleValid : markScheduleValid;
    if (!commonValid || !modeValid) {
      toast({ message: 'Revise os campos e horários antes de criar o Bora.', color: 'danger', duration: 2800 });
      return;
    }
    const startsAt = mode === 'agora'
      ? toInstantIso(dateTimeValue(agoraDate, agoraTime))
      : mode === 'mais-tarde'
        ? toInstantIso(dateTimeValue(weekDate, weekTimes[0]))
        : undefined;
    const alternatives = mode === 'mais-tarde'
      ? weekTimes.slice(1).map((time) => toInstantIso(dateTimeValue(weekDate, time)))
      : [];

    setCreating(true);
    try {
      const event = await createEvent({
        mode,
        title: title.trim(),
        place: resolvedPlace,
        description: description.trim(),
        threshold,
        startsAt,
        alternatives,
        days: mode === 'marcar' ? sortedDays.map((day) => ({ ...day, label: dayLabel(day.date) })) : [],
        timeZone: mode === 'marcar' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
        createdByName: createdByName.trim()
      });
      const temporaryAdminAccess = event.adminAccessPersistence !== 'persistent';
      if (temporaryAdminAccess) {
        toast({ message: 'O acesso de organizador não pôde ser salvo neste aparelho. Copie e guarde o link de organizador na próxima tela.', color: 'warning', duration: 8000 });
      }
      router.push(`/e/${event.slug}?admin=${event.adminToken}&created=1${temporaryAdminAccess ? '&adminAccess=temporary' : ''}`, 'forward', 'replace');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o Bora.', color: 'danger', duration: 3000 });
      setCreating(false);
    }
  }

  return <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start"><IonBackButton defaultHref="/home" text="Voltar" /></IonButtons>
        <IonTitle>Criar Bora</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent className="ion-padding form-page">
      <section className="create-intro">
        <span className="section-eyebrow">Novo convite</span>
        <h1>{detail.title}</h1>
        <p>{detail.description}</p>
      </section>
      <IonCard className="create-card">
        <IonCardContent>
          <IonItem className={submitted && !title.trim() ? 'ion-invalid' : ''}>
            <IonLabel position="stacked">Nome do evento *</IonLabel>
            <IonInput value={title} aria-label="Nome do evento" aria-invalid={submitted && !title.trim()} aria-describedby={submitted && !title.trim() ? 'event-title-error' : undefined} onIonInput={(event) => setTitle(event.detail.value || '')} placeholder="Bar, cinema, jogo em casa..." required />
          </IonItem>
          {submitted && !title.trim() && <IonNote id="event-title-error" className="field-error" color="danger">Informe o nome do evento.</IonNote>}
          <div className={placeInTitle ? 'place-field-row place-field-row-selected' : 'place-field-row'}>
            <IonItem className={submitted && !placeInTitle && !place.trim() ? 'ion-invalid' : ''}>
              <IonLabel position="stacked">Local{placeInTitle ? '' : ' *'}</IonLabel>
              <IonInput value={placeInTitle ? title : place} aria-label="Local" aria-invalid={submitted && !placeInTitle && !place.trim()} aria-describedby={submitted && !placeInTitle && !place.trim() ? 'event-place-error' : undefined} disabled={placeInTitle} onIonInput={(event) => setPlace(event.detail.value || '')} placeholder="Nome, endereço ou link" required={!placeInTitle} />
            </IonItem>
            {(placeInTitle || !place.trim()) && <div className={placeInTitle ? 'place-choice place-choice-selected' : 'place-choice'}>
              <label className="place-choice-label">
                <input type="checkbox" checked={placeInTitle} onChange={(event) => updatePlaceInTitle(event.target.checked)} aria-label="O nome já diz onde é" aria-describedby="place-choice-description" />
                <span>O nome já diz onde é</span>
              </label>
              <span id="place-choice-description" className="sr-only">Ao marcar, o local passa a ser o nome do evento. O local que você digitou será restaurado se desmarcar.</span>
            </div>}
          </div>
          {submitted && !placeInTitle && !place.trim() && <IonNote id="event-place-error" className="field-error" color="danger">Informe o local ou marque que o nome já diz onde é.</IonNote>}
          <IonItem className={submitted && !createdByName.trim() ? 'ion-invalid' : ''}>
            <IonLabel position="stacked">Seu nome *</IonLabel>
            <IonInput value={createdByName} aria-label="Seu nome" aria-invalid={submitted && !createdByName.trim()} aria-describedby={submitted && !createdByName.trim() ? 'creator-name-error' : undefined} maxlength={80} onIonInput={(event) => updateCreatedByName(event.detail.value || '')} placeholder="Ex: Ana" required />
          </IonItem>
          {submitted && !createdByName.trim() && <IonNote id="creator-name-error" className="field-error" color="danger">Informe seu nome.</IonNote>}
          <IonItem>
            <IonLabel position="stacked">Descrição <span className="optional-label">(opcional)</span></IonLabel>
            <IonTextarea value={description} aria-label="Descrição opcional" onIonInput={(event) => setDescription(event.detail.value || '')} placeholder="Detalhes rápidos do rolê" />
          </IonItem>

          <section className="threshold-control" aria-labelledby="threshold-title">
            <div><strong id="threshold-title">Quantas pessoas precisam confirmar?</strong><small>Incluindo você</small></div>
            <div className="stepper">
              <button type="button" onClick={() => changeThreshold(threshold - 1)} disabled={threshold <= 1} aria-label="Diminuir confirmações">−</button>
              <input value={threshold} inputMode="numeric" aria-label="Número mínimo de confirmações" onChange={(event) => changeThreshold(Number(event.target.value.replace(/\D/g, '')))} />
              <button type="button" onClick={() => changeThreshold(threshold + 1)} disabled={threshold >= maxThreshold} aria-label="Aumentar confirmações">+</button>
            </div>
          </section>

          {mode === 'agora' && <section className="schedule-section">
            <h2>Que horas?</h2><p className="muted">Escolha o dia e um horário no futuro. Um horário que já passou hoje vale para amanhã.</p>
            <div className="agora-day-picker" role="group" aria-label="Dia do Bora agora">
              <button type="button" className={agoraDate === today ? 'selected' : ''} aria-pressed={agoraDate === today} onClick={() => selectAgoraDay('hoje')}>Hoje</button>
              <button type="button" className={agoraDate === tomorrowKey ? 'selected' : ''} aria-pressed={agoraDate === tomorrowKey} onClick={() => selectAgoraDay('amanha')}>Amanhã</button>
            </div>
            <button ref={timeOpenerRef} type="button" className="time-picker-trigger" onClick={() => setTimePickerOpen(true)} aria-haspopup="dialog" aria-label={`Escolher horário. Atual: ${agoraTime}`}><span>Horário</span><strong>{agoraTime}</strong><span aria-hidden="true">⌄</span></button>
            <div className="agora-date-summary"><p className="schedule-summary">{(agoraDate === today ? 'Hoje' : agoraDate === tomorrowKey ? 'Amanhã' : dayLabel(agoraDate))} · {dayLabel(agoraDate, true)} às {agoraTime}</p><IonButton ref={calendarOpenerRef} fill="clear" size="small" onClick={() => setCalendarOpen(true)}>Outra data</IonButton></div>
            {agoraDate === today && !futureTime(today, agoraTime) && <IonNote className="field-error" color="danger" role="alert">Escolha um horário futuro para hoje.</IonNote>}
            {submitted && !agoraValid && <IonNote className="field-error" color="danger" role="alert">Escolha uma data e horário no futuro.</IonNote>}
          </section>}

          {mode === 'mais-tarde' && <section className="schedule-section">
            <h2>Escolha o dia</h2>
            <div className="week-picker" role="list" aria-label="Dias desta semana">
              {week.map((date) => <button key={date} type="button" className={date === weekDate ? 'selected' : ''} aria-pressed={date === weekDate} aria-label={dayLabel(date, true)} disabled={date < today} onClick={() => selectWeekDate(date)}><span>{dayLabel(date).split(' ')[0]}</span><b>{date.slice(-2)}</b></button>)}
            </div>
            <IonButton ref={calendarOpenerRef} fill="clear" size="small" onClick={() => setCalendarOpen(true)}>Escolher outra data</IonButton>
            <h2>Horários que funcionam</h2>
            <div className="time-add-row"><IonInput type="time" value={timeDraft} aria-label="Horário para adicionar" onIonInput={(event) => setTimeDraft(event.detail.value || '')} /><IonButton onClick={() => addWeekTime()}>Adicionar</IonButton></div>
            <div className="quick-times" role="group" aria-label="Adicionar horário rápido">{[1, 2, 3].map((hours) => <button key={hours} type="button" onClick={() => addRelativeWeekTime(hours)}>+{hours}h</button>)}</div>
            <IonButton fill="clear" size="small" onClick={toggleWeekOvernightTimes} aria-expanded={Boolean(overnightWeekDates[weekDate])} aria-controls="week-overnight-times">{overnightWeekDates[weekDate] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton>
            {overnightWeekDates[weekDate] && <div id="week-overnight-times"><p className="muted">Horários entre 01:00 e 07:00 liberados para {dayLabel(weekDate, true)}.</p><div className="quick-times" role="group" aria-label={`Horários da madrugada de ${dayLabel(weekDate, true)}`}>{overnightTimeChoices.map((time) => <button key={time} type="button" aria-pressed={weekTimes.includes(time)} onClick={() => weekTimes.includes(time) ? setWeekTimes((current) => current.filter((item) => item !== time)) : addWeekTime(time)}>{time}</button>)}</div></div>}
            <div className="time-chips">{weekTimes.map((time) => <button key={time} type="button" className="time-chip" aria-label={`Remover horário ${time}`} onClick={() => setWeekTimes((current) => current.filter((item) => item !== time))}>{time}<span aria-hidden="true">×</span></button>)}</div>
            {weekTimes.length > 0 && <p className="schedule-summary">{dayLabel(weekDate, true)}, às {weekTimes.join(', ')}.</p>}
            {submitted && !weekScheduleValid && <IonNote className="field-error" color="danger" role="alert">Adicione pelo menos um horário futuro e válido.</IonNote>}
          </section>}

          {mode === 'marcar' && <section className="schedule-section mark-section">
            <div className="section-heading-row"><div><h2>Dias e horários</h2><p className="muted">Abra cada dia para definir horários.</p></div><IonButton fill="outline" size="small" onClick={useSameTimes}>Usar os mesmos horários</IonButton></div>
            {sortedDays.map((day) => <details key={day.id} className="day-accordion" open={days.length === 1}>
              <summary><span><strong>{dayLabel(day.date, true)}</strong><small>{day.slots.length === 0 ? 'Sem horários' : `${day.slots.length} horário${day.slots.length === 1 ? '' : 's'}`}</small></span><span aria-hidden="true">⌄</span></summary>
              <div className="day-accordion-content">
                <IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" min={today} value={day.date} aria-label={`Data de ${dayLabel(day.date, true)}`} onIonInput={(event) => { const date = event.detail.value || day.date; updateDay(day.id, { date, label: dayLabel(date), slots: day.slots.filter((slot) => futureTime(date, slot)) }); }} /></IonItem>
                <div className="time-chip-grid" role="group" aria-label={`Horários de ${dayLabel(day.date, true)}`}>{(overnightDays[day.id] ? [...overnightTimeChoices, ...timeChoices] : timeChoices).map((slot) => <button key={slot} type="button" className={day.slots.includes(slot) ? 'selected' : ''} aria-pressed={day.slots.includes(slot)} onClick={() => toggleDayTime(day.id, slot)}>{day.slots.includes(slot) ? '✓ ' : ''}{slot}</button>)}</div>
                <div className="day-actions"><IonButton fill="clear" size="small" onClick={() => duplicateDay(day)}>Duplicar dia</IonButton><IonButton fill="clear" size="small" onClick={() => toggleOvernightTimes(day.id)} aria-expanded={Boolean(overnightDays[day.id])}>{overnightDays[day.id] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton><IonButton fill="clear" color="danger" size="small" onClick={() => removeDay(day.id)}>Remover dia</IonButton></div>
              </div>
            </details>)}
            <IonButton fill="outline" onClick={addDay}>+ Adicionar dia</IonButton>
            {submitted && !markScheduleValid && <IonNote className="field-error" color="danger" role="alert">Cada data deve ser válida, única e ter pelo menos um horário futuro.</IonNote>}
          </section>}

          <IonNote className="guest-note">Você entra como confirmado. Convidados só precisam informar o nome para votar.</IonNote>
          <IonButton expand="block" size="large" onClick={submit} disabled={creating}>{creating ? 'Criando...' : 'Criar link do Bora'}</IonButton>
        </IonCardContent>
      </IonCard>
      <IonModal isOpen={calendarOpen} onDidPresent={() => void calendarInputRef.current?.setFocus()} onDidDismiss={() => { setCalendarOpen(false); window.requestAnimationFrame(() => calendarOpenerRef.current?.focus()); }}>
        <IonHeader><IonToolbar><IonTitle>{mode === 'agora' ? 'Alterar data' : 'Escolher outra data'}</IonTitle><IonButtons slot="end"><IonButton onClick={() => setCalendarOpen(false)}>Fechar</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding"><IonItem><IonLabel position="stacked">Data</IonLabel><IonInput ref={calendarInputRef} type="date" aria-label="Data do Bora" min={today} value={mode === 'agora' ? agoraDate : weekDate} onIonInput={(event) => { const date = event.detail.value || (mode === 'agora' ? agoraDate : weekDate); if (mode === 'agora') updateAgoraDate(date); else selectWeekDate(date); setCalendarOpen(false); }} /></IonItem></IonContent>
      </IonModal>
      <IonModal isOpen={timePickerOpen} onDidPresent={() => firstQuickTimeRef.current?.focus()} onDidDismiss={() => { setTimePickerOpen(false); window.requestAnimationFrame(() => timeOpenerRef.current?.focus()); }} className="time-picker-modal">
        <IonHeader><IonToolbar><IonTitle>Escolha o horário</IonTitle><IonButtons slot="end"><IonButton onClick={() => setTimePickerOpen(false)}>Pronto</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
          <div className="agora-quick-times" role="group" aria-label="Horários rápidos">{[1, 2, 3].map((hours) => <button ref={hours === 1 ? firstQuickTimeRef : undefined} key={hours} type="button" onClick={() => pickQuickTime(hours)}>Em {hours}h</button>)}</div>
          <IonDatetime presentation="time" hourCycle="h23" value={dateTimeValue(agoraDate, agoraTime)} aria-label="Horário do Bora" onIonChange={(event) => selectAgoraTime(event.detail.value)} />
        </IonContent>
      </IonModal>
    </IonContent>
  </IonPage>;
}
