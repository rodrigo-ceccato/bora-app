import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonDatetime, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonPage, IonSpinner, IonTextarea, IonTitle, IonToolbar, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { logoWhatsapp } from 'ionicons/icons';
import { deleteEvent, getEvent, getParticipantId, getParticipantName, saveParticipantName, subscribeToEvent, submitVote, updateEvent } from '../lib/store';
import { responseLabel } from '../lib/schedule';
import { localDateKey, toInstantIso, toPickerValue } from '../lib/datetime';
import { eventOptions, optionLabel } from '../lib/options';
import { calendarDetails, calendarIcs, googleCalendarUrl } from '../lib/calendar';
import { availabilityResults, eventStatusText, groupAvailabilityResults, preferenceResults, resultDateLabel } from '../lib/results';
import type { BoraEvent, EventWithVotes, VoteResponse } from '../lib/types';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const scheduleTimes = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const overnightScheduleTimes = Array.from({ length: 7 }, (_, index) => `0${index + 1}:00`);

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const query = useQuery();
  const [toast] = useIonToast();
  const [presentAlert] = useIonAlert();
  const router = useIonRouter();
  const adminToken = query.get('admin') || '';
  const [data, setData] = useState<EventWithVotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(getParticipantName);
  const [preferredOptions, setPreferredOptions] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [editEvent, setEditEvent] = useState<BoraEvent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [savingAdminAction, setSavingAdminAction] = useState(false);
  const [adminSection, setAdminSection] = useState<'overview' | 'manage'>('overview');
  const [showAllResults, setShowAllResults] = useState(false);
  const [expandedResultDays, setExpandedResultDays] = useState<Record<string, boolean>>({});
  const [overnightEditDays, setOvernightEditDays] = useState<Record<string, boolean>>({});
  const hydratedVote = useRef(false);

  const isAdmin = Boolean(data?.isAdmin);
  const wasJustCreated = query.get('created') === '1';
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    hydratedVote.current = false;

    async function refresh() {
      try {
        const result = await getEvent(slug, adminToken);
        if (!active) return;
        setData(result);
        const ownVote = result?.votes.find((vote) => vote.isOwn || vote.participantId === getParticipantId());
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
        if (active) toast({ message: error instanceof Error ? error.message : 'Não foi possível carregar o Bora.', color: 'danger', duration: 3000 });
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [slug, adminToken, toast]);

  const counts = useMemo(() => {
    const votes = data?.votes || [];
    return {
      accept: votes.filter((vote) => vote.response === 'accept').length,
      maybe: votes.filter((vote) => vote.response === 'maybe').length,
      decline: votes.filter((vote) => vote.response === 'decline').length
    };
  }, [data]);

  const availabilitySummary = useMemo(() => data ? availabilityResults(data.event, data.votes) : [], [data]);
  const timePreferences = useMemo(() => data?.event.mode === 'mais-tarde' ? preferenceResults(data.event, data.votes) : [], [data]);
  const decidedCalendar = useMemo(() => data ? calendarDetails(data.event) : null, [data]);
  const groupedAvailability = useMemo(() => {
    return groupAvailabilityResults(availabilitySummary);
  }, [availabilitySummary]);
  const maxAvailabilityCount = availabilitySummary[0]?.count || 0;

  function updateName(value: string) {
    setName(value);
    saveParticipantName(value);
  }

  function toggleSlot(dayId: string, slot: string) {
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
    setPreferredOptions((current) => current.includes(optionId)
      ? current.filter((item) => item !== optionId)
      : [...current, optionId]);
  }

  function openEdit() {
    if (!data) return;
    setOvernightEditDays({});
    setEditEvent({ ...data.event, startsAt: toPickerValue(data.event.startsAt), days: data.event.days.map((day) => ({ ...day, slots: [...day.slots] })), alternatives: [...data.event.alternatives] });
  }

  function updateEdit(patch: Partial<BoraEvent>) {
    setEditEvent((current) => current ? { ...current, ...patch } : current);
  }

  function changeEditThreshold(delta: number) {
    setEditEvent((current) => current ? { ...current, threshold: Math.max(1, Math.round(current.threshold) + delta) } : current);
  }

  function updateEditDay(dayId: string, patch: Partial<BoraEvent['days'][number]>) {
    setEditEvent((current) => current ? {
      ...current,
      days: current.days.map((day) => day.id === dayId ? { ...day, ...patch } : day)
    } : current);
  }

  function updateEditDayDate(dayId: string, date: string) {
    updateEditDay(dayId, { date, label: resultDateLabel(date) });
  }

  function toggleEditSlot(dayId: string, slot: string, checked: boolean) {
    const day = editEvent?.days.find((item) => item.id === dayId);
    if (!day) return;
    updateEditDay(dayId, { slots: checked ? [...day.slots, slot] : day.slots.filter((item) => item !== slot) });
  }

  function addEditDay() {
    setEditEvent((current) => current ? {
      ...current,
      days: [...current.days, { id: `day_${Date.now()}`, label: resultDateLabel(localDateKey()), date: localDateKey(), slots: [] }]
    } : current);
  }

  function duplicateEditDay(dayId: string) {
    setEditEvent((current) => {
      const source = current?.days.find((day) => day.id === dayId);
      if (!current || !source) return current;
      const nextDate = new Date(`${source.date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      const date = localDateKey(nextDate);
      return { ...current, days: [...current.days, { ...source, id: `day_${Date.now()}`, date, label: resultDateLabel(date), slots: [...source.slots] }] };
    });
  }

  function useSameEditTimes() {
    setEditEvent((current) => {
      const slots = current?.days.find((day) => day.slots.length)?.slots;
      return current && slots ? { ...current, days: current.days.map((day) => ({ ...day, slots: [...slots] })) } : current;
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
    setOvernightEditDays((current) => ({ ...current, [dayId]: !current[dayId] }));
  }

  async function saveEdit() {
    if (!data || !editEvent) return;
    const threshold = Number(editEvent.threshold);
    const scheduleValid = editEvent.mode !== 'marcar' || (editEvent.days.length > 0 && editEvent.days.every((day) => day.label.trim() && day.date && day.slots.length > 0));
    if (!editEvent.title.trim() || !editEvent.place.trim() || !Number.isInteger(threshold) || threshold < 1 || !scheduleValid) {
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
      toast({ message: 'Coloque seu nome para votar.', color: 'danger', duration: 2200 });
      return;
    }
    const selectedSlots = Object.values(availability).flat();
    if (data.event.mode === 'mais-tarde' && response !== 'decline' && preferredOptions.length === 0) {
      toast({ message: 'Marque pelo menos um horário ou selecione “Não posso”.', color: 'danger', duration: 2600 });
      return;
    }
    if (data.event.mode === 'marcar' && response !== 'decline' && selectedSlots.length === 0) {
      toast({ message: 'Marque pelo menos um horário ou selecione “Não posso”.', color: 'danger', duration: 2600 });
      return;
    }
    saveParticipantName(name);
    setSubmittingVote(true);
    try {
      await submitVote(data.event, {
        voterName: name.trim(),
        response,
        preferredOptions: data.event.mode === 'mais-tarde' && response !== 'decline' ? preferredOptions : [],
        availability: data.event.mode === 'marcar' && response !== 'decline' ? availability : {}
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
        message: updated.votingClosed ? 'Votação encerrada.' : 'Votação reaberta.',
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
      const updated = await updateEvent(adminToken, { ...data.event, decidedOption: optionId, votingClosed: true });
      setData((current) => current ? { ...current, event: updated } : current);
      toast({ message: 'Horário definido e votação encerrada.', color: 'success', duration: 2200 });
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
      const updated = await updateEvent(adminToken, { ...data.event, decidedOption: undefined, decidedAt: undefined, votingClosed: false });
      setData((current) => current ? { ...current, event: updated } : current);
      toast({ message: 'Decisão removida e votação reaberta.', color: 'success', duration: 2200 });
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

  async function copyText(url: string, message: string) {
    try {
      if (!navigator.clipboard) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(url);
      toast({ message, color: 'success', duration: 1800 });
    } catch {
      toast({ message: 'Não foi possível copiar o link. Copie a URL do navegador.', color: 'danger', duration: 2800 });
    }
  }

  function invitationText() {
    if (!data) return 'Bora combinar?';
    const { event } = data;
    const when = event.mode === 'marcar'
      ? event.days.length
        ? event.days.map((day) => `${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}: ${day.slots.join(', ')}`).join('\n')
        : 'Dias e horários a combinar'
      : event.mode === 'agora' && event.startsAt
        ? new Date(event.startsAt).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : event.startsAt
          ? eventOptions(event).map((option) => optionLabel(event, option.id)).join(' ou ')
          : 'Data e horário a combinar';
    const details = [
      `📅 ${when}`,
      `📍 ${event.place}`,
      event.description ? `\n${event.description}` : '',
      '\nConfirma sua presença no Bora:'
    ].filter(Boolean);
    return `Bora? ${event.title}\n\n${details.join('\n')}`;
  }

  function invitationUrl() {
    return `${window.location.origin}/e/${slug}`;
  }

  async function shareLink() {
    const url = invitationUrl();
    const message = `${invitationText()}\n${url}`;
    if (!navigator.share) return copyText(message, 'Convite copiado!');
    try { await navigator.share({ title: data?.event.title || 'Bora', text: message, url }); }
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
    return <IonPage><IonContent className="ion-padding center"><h1>Evento não encontrado</h1><IonButton routerLink="/home">Voltar</IonButton></IonContent></IonPage>;
  }

  const { event, votes } = data;
  const preferredTimeOptions = event.mode === 'mais-tarde' ? eventOptions(event) : [];
  const ownVote = votes.find((vote) => vote.isOwn || vote.participantId === getParticipantId());
  const showVoteConfirmation = !isAdmin && !editingVote && Boolean(voteSubmitted || ownVote);
  const confirmationProgress = Math.min(100, (counts.accept / event.threshold) * 100);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
          <IonTitle>{event.title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding event-page">
        <section className="event-layout">
          {isAdmin && wasJustCreated && (
            <IonCard className="success-card ready-card">
              <IonCardContent>
                <div>
                  <strong>Seu Bora está pronto!</strong>
                  <p>Agora é só chamar a galera.</p>
                </div>
                <div className="ready-card-actions"><IonButton onClick={() => void shareLink()}>{canShare ? 'Compartilhar' : 'Copiar convite'}</IonButton><IonButton fill="outline" onClick={shareOnWhatsApp}><IonIcon slot="start" icon={logoWhatsapp} aria-hidden="true" />Compartilhar no WhatsApp</IonButton></div>
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
                <div className="threshold-progress" role="progressbar" aria-label={`${counts.accept} de ${event.threshold} confirmações`} aria-valuemin={0} aria-valuemax={event.threshold} aria-valuenow={counts.accept}>
                  <span style={{ width: `${confirmationProgress}%` }} />
                </div>
                <p>{eventStatusText(event, votes)}</p>
              </div>
            </IonCardContent>
          </IonCard>

          {decidedCalendar && <IonCard className="calendar-card">
            <IonCardContent>
              <span className="section-eyebrow">{event.mode === 'agora' ? 'Bora marcado' : 'Plano confirmado'}</span>
              <h2>Coloque na sua agenda</h2>
              <p>{event.mode === 'agora' ? new Date(event.startsAt!).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : optionLabel(event, event.decidedOption)} · {event.place}</p>
              <div className="calendar-actions">
                <IonButton href={googleCalendarUrl(event, decidedCalendar)} target="_blank" rel="noopener">Adicionar ao Google Agenda</IonButton>
                <IonButton fill="outline" onClick={downloadCalendar}>Baixar arquivo de agenda</IonButton>
              </div>
            </IonCardContent>
          </IonCard>}

          {isAdmin && (
            <nav className="admin-nav" aria-label="Seções da administração">
              <button type="button" className={adminSection === 'overview' ? 'active' : ''} onClick={() => setAdminSection('overview')}>Resumo</button>
              <button type="button" className={adminSection === 'manage' ? 'active' : ''} onClick={() => setAdminSection('manage')}>Gerenciar</button>
            </nav>
          )}

          <div>
            {!isAdmin && !event.decidedOption && (
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
                      <IonButton fill="clear" onClick={() => setEditingVote(true)}>Alterar</IonButton>
                    </div>
                  ) : (
                    <>
                      <div className="vote-heading">
                        <span className="section-eyebrow">Sua resposta</span>
                        <h2>{event.mode === 'agora' ? 'Você topa?' : event.mode === 'mais-tarde' ? 'Qual horário funciona?' : 'Quando você pode?'}</h2>
                        <p>Leva menos de um minuto.</p>
                      </div>
                      <IonItem className="name-field" lines="none"><IonLabel position="stacked">Seu nome</IonLabel><IonInput value={name} maxlength={80} onIonInput={(e) => updateName(e.detail.value || '')} placeholder="Como a galera te chama?" required /></IonItem>

                      {event.mode === 'mais-tarde' && (
                        <div className="time-options">
                          <h3>Marque todos os horários que funcionam</h3>
                          {preferredTimeOptions.map((option) => (
                            <IonItem key={option.id} lines="none">
                              <IonCheckbox checked={preferredOptions.includes(option.id)} onIonChange={() => togglePreferredOption(option.id)} />
                              <IonLabel className="ion-margin-start">{option.primary ? `Principal · ${option.label}` : option.label}</IonLabel>
                            </IonItem>
                          ))}
                        </div>
                      )}

                      {event.mode === 'marcar' && (
                        <div>
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
                        </div>
                      )}

                      <div className="vote-actions" aria-label="Registrar voto">
                        <IonButton className="response-yes" disabled={event.votingClosed || submittingVote} onClick={() => void vote('accept')}><span><b aria-hidden="true">🙌</b>{submittingVote ? 'Salvando...' : 'Posso'}</span></IonButton>
                        <IonButton className="response-maybe" fill="outline" disabled={event.votingClosed || submittingVote} onClick={() => void vote('maybe')}><span><b aria-hidden="true">🤔</b>Talvez</span></IonButton>
                        <IonButton className="response-no" fill="clear" disabled={event.votingClosed || submittingVote} onClick={() => void vote('decline')}><span><b aria-hidden="true">😔</b>Não posso</span></IonButton>
                      </div>
                      {event.votingClosed && <p className="closed-message">A votação foi encerrada pelo criador.</p>}
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
                    <div className="share-actions">
                      <IonButton expand="block" onClick={shareOnWhatsApp}><IonIcon slot="start" icon={logoWhatsapp} aria-hidden="true" />Compartilhar no WhatsApp</IonButton>
                      <IonButton expand="block" fill="outline" onClick={() => void copyText(`${invitationText()}\n${invitationUrl()}`, 'Convite copiado!')}>Copiar convite</IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
                <IonCard className="manage-section details-section">
                  <IonCardContent>
                    <span className="section-eyebrow">Informações</span>
                    <h3>Detalhes do evento</h3>
                    <dl className="event-details-list"><div><dt>Quando</dt><dd>{event.startsAt ? new Date(event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : event.mode === 'marcar' ? 'Dias e horários a combinar' : 'Data a combinar'}</dd></div><div><dt>Local</dt><dd>{event.place}</dd></div><div><dt>Meta de confirmações</dt><dd>{event.threshold} confirmações</dd></div></dl>
                    <IonButton fill="outline" onClick={openEdit}>Editar detalhes</IonButton>
                  </IonCardContent>
                </IonCard>
                <IonCard className="manage-section responses-section">
                  <IonCardContent>
                    <span className="section-eyebrow">Respostas</span>
                    <h3>{event.votingClosed ? 'Confirmações encerradas' : 'Confirmações abertas'}</h3>
                    <p className="muted">{event.votingClosed ? 'Convidados não podem enviar nem alterar respostas.' : 'Convidados ainda podem responder ao convite.'}</p>
                    <div className="settings-row">
                      <IonButton fill={event.votingClosed ? 'outline' : 'solid'} onClick={() => void toggleVoting()} disabled={savingAdminAction}>{event.votingClosed ? 'Reabrir confirmações' : 'Encerrar confirmações'}</IonButton>
                    </div>
                    {event.decidedOption && <div className="settings-row">
                      <div><strong>Horário definido</strong><span>{optionLabel(event, event.decidedOption)}</span></div>
                      <IonButton fill="clear" onClick={() => void clearDecision()} disabled={savingAdminAction}>Remover decisão</IonButton>
                    </div>
                    }
                  </IonCardContent>
                </IonCard>
                </div>
                <IonCard className="danger-zone">
                  <IonCardContent>
                    <div>
                      <h3>Excluir evento</h3>
                      <p>Apaga o evento e todos os votos permanentemente.</p>
                    </div>
                    <IonButton color="danger" onClick={confirmDelete} disabled={savingAdminAction}>Excluir evento</IonButton>
                  </IonCardContent>
                </IonCard>
              </section>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'marcar' && (
                <IonCard>
                <IonCardHeader><IonCardTitle>Melhores horários</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {availabilitySummary.length === 0 && <p>Nenhuma disponibilidade enviada ainda.</p>}
                  {availabilitySummary.length > 0 && <p className="results-note">Só respostas “Posso” entram na contagem dos horários.</p>}
                  {groupedAvailability.map((group) => <details className="result-date-group" key={group.label} open={expandedResultDays[group.label] ?? group.items.some((item) => item.count === maxAvailabilityCount)} onToggle={(item) => setResultDayExpanded(group.label, item.currentTarget.open)}>
                    <summary><span>{group.label}</span><span>{group.items.length} horário{group.items.length === 1 ? '' : 's'} <b aria-hidden="true">⌄</b></span></summary>
                    <div className="result-date-content">
                    {group.items.map((item) => {
                      const percentage = event.threshold ? Math.min(100, (item.count / event.threshold) * 100) : 0;
                      const isBestTime = maxAvailabilityCount > 0 && item.count === maxAvailabilityCount;
                      return <div className="result-row" key={`${item.day.id}-${item.slot}`}>
                        <strong>{item.slot}</strong>
                        <IonBadge className={isBestTime ? 'result-count-best' : ''} color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count} de {event.threshold}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={`${item.day.label}, ${item.slot}: ${item.count} de ${event.threshold} disponíveis`} aria-valuemin={0} aria-valuemax={event.threshold} aria-valuenow={item.count}><span style={{ width: `${percentage}%` }} /></div>
                        <span>{item.count === 1 ? '1 pessoa disponível' : `${item.count} pessoas disponíveis`}{item.names.length ? ` · ${item.names.join(', ')}` : ''}</span>
                        {isAdmin && !event.decidedOption && <IonButton size="small" fill="outline" onClick={() => void decideOption(`${item.day.id}:${item.slot}`)} disabled={savingAdminAction}>Escolher este horário</IonButton>}
                      </div>;
                    })}
                    </div>
                  </details>)}
                </IonCardContent>
              </IonCard>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'mais-tarde' && (
              <IonCard>
                <IonCardHeader><IonCardTitle>Horários preferidos</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {(showAllResults ? timePreferences : timePreferences.slice(0, 3)).map((item) => {
                    const percentage = votes.length ? (item.count / votes.length) * 100 : 0;
                    return (
                      <div className="result-row" key={item.option.id}>
                        <strong>{item.option.primary ? `Horário principal · ${item.option.label}` : item.option.label}</strong>
                        <IonBadge color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count} de {event.threshold}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={`${item.option.label}: ${item.count} preferências`} aria-valuemin={0} aria-valuemax={votes.length} aria-valuenow={item.count}>
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
              </IonCardContent>
            </IonCard>}
          </div>

        </section>

        <IonModal isOpen={Boolean(editEvent)} onDidDismiss={() => setEditEvent(null)} className="event-editor-modal">
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
                  <IonItem><IonLabel position="stacked">Nome do evento *</IonLabel><IonInput value={editEvent.title} onIonInput={(item) => updateEdit({ title: item.detail.value || '' })} /></IonItem>
                  <IonItem><IonLabel position="stacked">Local *</IonLabel><IonInput value={editEvent.place} onIonInput={(item) => updateEdit({ place: item.detail.value || '' })} /></IonItem>
                  <IonItem><IonLabel position="stacked">Descrição <span className="optional-label">(opcional)</span></IonLabel><IonTextarea value={editEvent.description || ''} onIonInput={(item) => updateEdit({ description: item.detail.value || '' })} /></IonItem>
                </section>
                <section className="threshold-control" aria-labelledby="editor-threshold-title">
                  <div><strong id="editor-threshold-title">Quantas pessoas precisam confirmar?</strong><small>Incluindo você</small></div>
                  <div className="stepper">
                    <button type="button" onClick={() => changeEditThreshold(-1)} disabled={editEvent.threshold <= 1} aria-label="Diminuir confirmações">−</button>
                    <input value={editEvent.threshold} inputMode="numeric" aria-label="Número mínimo de confirmações" onChange={(item) => updateEdit({ threshold: Number(item.target.value.replace(/\D/g, '')) || 1 })} />
                    <button type="button" onClick={() => changeEditThreshold(1)} aria-label="Aumentar confirmações">+</button>
                  </div>
                </section>
                {editEvent.mode === 'agora' && <section className="schedule-section"><h2>Que horas?</h2><IonItem><IonLabel position="stacked">Início</IonLabel><IonDatetime presentation="time" value={editEvent.startsAt} onIonChange={(item) => updateEdit({ startsAt: String(item.detail.value) })} /></IonItem></section>}
                {editEvent.mode === 'mais-tarde' && <section className="schedule-section"><h2>Escolha o dia e horário</h2><IonItem><IonDatetime value={editEvent.startsAt} onIonChange={(item) => updateEdit({ startsAt: String(item.detail.value) })} /></IonItem></section>}

                {editEvent.mode === 'marcar' && (
                  <section className="schedule-section mark-section" aria-labelledby="edit-schedule-title">
                    <div className="section-heading-row"><div><h2 id="edit-schedule-title">Dias e horários</h2><p className="muted">Abra cada dia para ajustar os horários.</p></div><IonButton fill="outline" size="small" onClick={useSameEditTimes}>Usar os mesmos horários</IonButton></div>
                    {editEvent.days.map((day) => (
                      <details key={day.id} className="day-accordion" open={editEvent.days.length === 1}>
                        <summary><span><strong>{resultDateLabel(day.date, true)}</strong><small>{day.slots.length === 0 ? 'Sem horários' : `${day.slots.length} horário${day.slots.length === 1 ? '' : 's'}`}</small></span><span aria-hidden="true">⌄</span></summary>
                        <div className="day-accordion-content">
                          <IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" value={day.date} onIonInput={(item) => updateEditDayDate(day.id, item.detail.value || day.date)} /></IonItem>
                          <div className="time-chip-grid">{(overnightEditDays[day.id] || day.slots.some((slot) => overnightScheduleTimes.includes(slot)) ? [...overnightScheduleTimes, ...scheduleTimes] : scheduleTimes).map((slot) => <button type="button" key={slot} className={day.slots.includes(slot) ? 'selected' : ''} aria-pressed={day.slots.includes(slot)} onClick={() => toggleEditSlot(day.id, slot, !day.slots.includes(slot))}>{day.slots.includes(slot) ? '✓ ' : ''}{slot}</button>)}</div>
                          <div className="day-actions"><IonButton fill="clear" size="small" onClick={() => duplicateEditDay(day.id)}>Duplicar dia</IonButton><IonButton fill="clear" size="small" onClick={() => toggleEditOvernightTimes(day.id)} aria-expanded={Boolean(overnightEditDays[day.id])}>{overnightEditDays[day.id] ? 'Ocultar madrugada' : 'Mostrar madrugada'}</IonButton><IonButton color="danger" fill="clear" size="small" onClick={() => removeEditDay(day.id)}>Remover dia</IonButton></div>
                        </div>
                      </details>
                    ))}
                    <IonButton fill="outline" onClick={addEditDay}>+ Adicionar dia</IonButton>
                  </section>
                )}

                <IonButton expand="block" size="large" onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar alterações'}</IonButton>
                </IonCardContent></IonCard>
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}
