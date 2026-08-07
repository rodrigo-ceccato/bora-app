import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonModal, IonNote, IonPage, IonTextarea, IonTitle, IonToolbar, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useMemo, useState } from 'react';
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
  return new Date(dateTimeValue(date, time)).getTime() > Date.now();
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
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState(3);
  const [createdByName, setCreatedByName] = useState(getParticipantName);
  const [agoraDate, setAgoraDate] = useState(initialAgora.date);
  const [agoraTime, setAgoraTime] = useState(initialAgora.time);
  const [weekDate, setWeekDate] = useState(() => localDateKey());
  const [weekTimes, setWeekTimes] = useState<string[]>([]);
  const [timeDraft, setTimeDraft] = useState('18:00');
  const [days, setDays] = useState<ScheduleDay[]>(() => [newDay()]);
  const [overnightDays, setOvernightDays] = useState<Record<string, boolean>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);

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
  const markScheduleValid = days.length > 0 && !hasDuplicateDates && days.every((day) => day.date && day.slots.length > 0 && day.slots.every((slot) => futureTime(day.date, slot)));
  const weekScheduleValid = weekTimes.length > 0 && weekTimes.every((time) => futureTime(weekDate, time));
  const agoraValid = futureTime(agoraDate, agoraTime);
  const detail = modeDetails[mode];

  function changeThreshold(next: number) {
    setThreshold(Math.min(maxThreshold, Math.max(1, Number.isFinite(next) ? Math.round(next) : 1)));
  }

  function updateCreatedByName(value: string) {
    setCreatedByName(value);
    saveParticipantName(value);
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
    if (!/^\d{2}:\d{2}$/.test(time)) return;

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

  function addWeekTime(time = timeDraft) {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    if (!futureTime(weekDate, time)) {
      toast({ message: 'Escolha um horário futuro para este dia.', color: 'warning', duration: 2400 });
      return;
    }
    setWeekTimes((current) => sortedTimes([...current, time]));
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
    setDays((current) => [...current, newDay(localDateKey(date), day.slots)]);
  }

  function removeDay(dayId: string) {
    setDays((current) => current.filter((day) => day.id !== dayId));
    setOvernightDays((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== dayId)));
  }

  function toggleOvernightTimes(dayId: string) {
    setOvernightDays((current) => ({ ...current, [dayId]: !current[dayId] }));
  }

  function useSameTimes() {
    const source = sortedDays.find((day) => day.slots.length > 0);
    if (!source) {
      toast({ message: 'Escolha horários em um dia primeiro.', color: 'warning', duration: 2400 });
      return;
    }
    setDays((current) => current.map((day) => ({ ...day, slots: source.slots.filter((slot) => futureTime(day.date, slot)) })));
  }

  async function submit() {
    setSubmitted(true);
    const commonValid = title.trim() && place.trim() && createdByName.trim() && threshold >= 1 && threshold <= maxThreshold;
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
        place: place.trim(),
        description: description.trim(),
        threshold,
        startsAt,
        alternatives,
        days: mode === 'marcar' ? sortedDays.map((day) => ({ ...day, label: dayLabel(day.date) })) : [],
        createdByName: createdByName.trim()
      });
      router.push(`/e/${event.slug}?admin=${event.adminToken}&created=1`, 'forward', 'replace');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o Bora.', color: 'danger', duration: 3000 });
      setCreating(false);
    }
  }

  return <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
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
            <IonInput value={title} onIonInput={(event) => setTitle(event.detail.value || '')} placeholder="Bar, cinema, jogo em casa..." />
          </IonItem>
          <IonItem className={submitted && !place.trim() ? 'ion-invalid' : ''}>
            <IonLabel position="stacked">Local *</IonLabel>
            <IonInput value={place} onIonInput={(event) => setPlace(event.detail.value || '')} placeholder="Nome, endereço ou link" />
          </IonItem>
          <IonItem className={submitted && !createdByName.trim() ? 'ion-invalid' : ''}>
            <IonLabel position="stacked">Seu nome *</IonLabel>
            <IonInput value={createdByName} maxlength={80} onIonInput={(event) => updateCreatedByName(event.detail.value || '')} placeholder="Ex: Ana" required />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Descrição <span className="optional-label">(opcional)</span></IonLabel>
            <IonTextarea value={description} onIonInput={(event) => setDescription(event.detail.value || '')} placeholder="Detalhes rápidos do rolê" />
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
            <button type="button" className="time-picker-trigger" onClick={() => setTimePickerOpen(true)} aria-haspopup="dialog"><span>Horário</span><strong>{agoraTime}</strong><span aria-hidden="true">⌄</span></button>
            <div className="agora-date-summary"><p className="schedule-summary">{(agoraDate === today ? 'Hoje' : agoraDate === tomorrowKey ? 'Amanhã' : dayLabel(agoraDate))} · {dayLabel(agoraDate, true)} às {agoraTime}</p><IonButton fill="clear" size="small" onClick={() => setCalendarOpen(true)}>Outra data</IonButton></div>
            {agoraDate === today && !futureTime(today, agoraTime) && <IonNote className="field-error" color="danger">Escolha um horário futuro para hoje.</IonNote>}
            {submitted && !agoraValid && <IonNote className="field-error" color="danger">Escolha uma data e horário no futuro.</IonNote>}
          </section>}

          {mode === 'mais-tarde' && <section className="schedule-section">
            <h2>Escolha o dia</h2>
            <div className="week-picker" role="list" aria-label="Dias desta semana">
              {week.map((date) => <button key={date} type="button" className={date === weekDate ? 'selected' : ''} disabled={date < today} onClick={() => setWeekDate(date)}><span>{dayLabel(date).split(' ')[0]}</span><b>{date.slice(-2)}</b></button>)}
            </div>
            <IonButton fill="clear" size="small" onClick={() => setCalendarOpen(true)}>Escolher outra data</IonButton>
            <h2>Horários que funcionam</h2>
            <div className="time-add-row"><IonInput type="text" inputMode="numeric" maxlength={5} value={timeDraft} placeholder="18:00" onIonInput={(event) => setTimeDraft(event.detail.value || '')} /><IonButton onClick={() => addWeekTime()}>Adicionar</IonButton></div>
            <div className="quick-times" aria-label="Adicionar horário rápido">{[1, 2, 3].map((hours) => <button key={hours} type="button" onClick={() => { const date = new Date(dateTimeValue(weekDate, timeDraft)); date.setHours(date.getHours() + hours); addWeekTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`); }}>+{hours}h</button>)}</div>
            <div className="time-chips">{weekTimes.map((time) => <button key={time} type="button" className="time-chip" onClick={() => setWeekTimes((current) => current.filter((item) => item !== time))}>{time}<span aria-hidden="true">×</span><span className="sr-only">Remover {time}</span></button>)}</div>
            {weekTimes.length > 0 && <p className="schedule-summary">{dayLabel(weekDate, true)}, às {weekTimes.join(', ')}.</p>}
            {submitted && !weekScheduleValid && <IonNote className="field-error" color="danger">Adicione pelo menos um horário futuro.</IonNote>}
          </section>}

          {mode === 'marcar' && <section className="schedule-section mark-section">
            <div className="section-heading-row"><div><h2>Dias e horários</h2><p className="muted">Abra cada dia para definir horários.</p></div><IonButton fill="outline" size="small" onClick={useSameTimes}>Usar os mesmos horários</IonButton></div>
            {sortedDays.map((day) => <details key={day.id} className="day-accordion" open={days.length === 1}>
              <summary><span><strong>{dayLabel(day.date, true)}</strong><small>{day.slots.length === 0 ? 'Sem horários' : `${day.slots.length} horário${day.slots.length === 1 ? '' : 's'}`}</small></span><span aria-hidden="true">⌄</span></summary>
              <div className="day-accordion-content">
                <IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" min={today} value={day.date} onIonInput={(event) => { const date = event.detail.value || day.date; updateDay(day.id, { date, label: dayLabel(date), slots: day.slots.filter((slot) => futureTime(date, slot)) }); }} /></IonItem>
                <div className="time-chip-grid">{(overnightDays[day.id] || day.slots.some((slot) => overnightTimeChoices.includes(slot)) ? [...overnightTimeChoices, ...timeChoices] : timeChoices).map((slot) => <button key={slot} type="button" className={day.slots.includes(slot) ? 'selected' : ''} aria-pressed={day.slots.includes(slot)} onClick={() => toggleDayTime(day.id, slot)}>{day.slots.includes(slot) ? '✓ ' : ''}{slot}</button>)}</div>
                <div className="day-actions"><IonButton fill="clear" size="small" onClick={() => duplicateDay(day)}>Duplicar dia</IonButton><IonButton fill="clear" size="small" onClick={() => toggleOvernightTimes(day.id)} aria-expanded={Boolean(overnightDays[day.id])}>{overnightDays[day.id] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton><IonButton fill="clear" color="danger" size="small" onClick={() => removeDay(day.id)}>Remover dia</IonButton></div>
              </div>
            </details>)}
            <IonButton fill="outline" onClick={addDay}>+ Adicionar dia</IonButton>
            {submitted && !markScheduleValid && <IonNote className="field-error" color="danger">Cada data deve ser única, futura e ter pelo menos um horário futuro.</IonNote>}
          </section>}

          <IonNote className="guest-note">Você entra como confirmado. Convidados só precisam informar o nome para votar.</IonNote>
          <IonButton expand="block" size="large" onClick={submit} disabled={creating}>{creating ? 'Criando...' : 'Criar link do Bora'}</IonButton>
        </IonCardContent>
      </IonCard>
      <IonModal isOpen={calendarOpen} onDidDismiss={() => setCalendarOpen(false)}>
        <IonHeader><IonToolbar><IonTitle>{mode === 'agora' ? 'Alterar data' : 'Escolher outra data'}</IonTitle><IonButtons slot="end"><IonButton onClick={() => setCalendarOpen(false)}>Fechar</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding"><IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" min={today} value={mode === 'agora' ? agoraDate : weekDate} onIonInput={(event) => { const date = event.detail.value || (mode === 'agora' ? agoraDate : weekDate); if (mode === 'agora') updateAgoraDate(date); else setWeekDate(date); setCalendarOpen(false); }} /></IonItem></IonContent>
      </IonModal>
      <IonModal isOpen={timePickerOpen} onDidDismiss={() => setTimePickerOpen(false)} className="time-picker-modal">
        <IonHeader><IonToolbar><IonTitle>Escolha o horário</IonTitle><IonButtons slot="end"><IonButton onClick={() => setTimePickerOpen(false)}>Pronto</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding"><IonDatetime presentation="time" hourCycle="h23" value={dateTimeValue(agoraDate, agoraTime)} onIonChange={(event) => selectAgoraTime(event.detail.value)} /></IonContent>
      </IonModal>
    </IonContent>
  </IonPage>;
}
