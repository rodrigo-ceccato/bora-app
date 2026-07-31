import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonPage, IonRadio, IonRadioGroup, IonSpinner, IonTextarea, IonTitle, IonToolbar, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { deleteEvent, getEvent, getParticipantId, subscribeToEvent, submitVote, updateEvent } from '../lib/store';
import { responseLabel } from '../lib/schedule';
import { localDateKey, toInstantIso, toPickerValue } from '../lib/datetime';
import type { BoraEvent, BoraVote, EventWithVotes, VoteResponse } from '../lib/types';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function acceptedCount(votes: BoraVote[]) {
  return votes.filter((vote) => vote.response === 'accept').length;
}

function statusText(event: BoraEvent, votes: BoraVote[]) {
  if (event.votingClosed) return 'Votação encerrada pelo criador.';
  const accepted = acceptedCount(votes);
  if (accepted >= event.threshold) return `Vai acontecer! ${accepted}/${event.threshold} confirmações.`;
  const remaining = event.threshold - accepted;
  return `${remaining === 1 ? 'Falta 1 confirmação' : `Faltam ${remaining} confirmações`}. ${accepted}/${event.threshold} até agora.`;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

const scheduleTimes = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);

function slotSummary(event: BoraEvent, votes: BoraVote[]) {
  return event.days.flatMap((day) => day.slots.map((slot) => {
    const names = votes
      .filter((vote) => vote.response !== 'decline' && (vote.availability[day.id] || []).includes(slot))
      .map((vote) => vote.voterName);
    return { day, slot, names, count: names.length };
  })).sort((a, b) => b.count - a.count);
}

function preferenceSummary(event: BoraEvent, votes: BoraVote[]) {
  const options = Array.from(new Set([formatTime(event.startsAt), ...event.alternatives].filter(Boolean)));
  return options.map((option) => ({
    option,
    count: votes.filter((vote) => vote.response !== 'decline' && (vote.preferredOption || formatTime(event.startsAt)) === option).length
  })).sort((a, b) => b.count - a.count);
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
  const [name, setName] = useState(localStorage.getItem('bora_voter_name') || '');
  const [preferredOption, setPreferredOption] = useState('');
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [editEvent, setEditEvent] = useState<BoraEvent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [savingAdminAction, setSavingAdminAction] = useState(false);
  const [adminSection, setAdminSection] = useState<'overview' | 'manage'>('overview');
  const hydratedVote = useRef(false);

  const isAdmin = Boolean(data?.isAdmin);
  const wasJustCreated = query.get('created') === '1';

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
          if (ownVote) setName(ownVote.voterName);
          if (result.event.mode === 'mais-tarde') {
            setPreferredOption(ownVote?.preferredOption || formatTime(result.event.startsAt) || result.event.alternatives[0] || '');
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

  const availabilitySummary = useMemo(() => data ? slotSummary(data.event, data.votes) : [], [data]);
  const timePreferences = useMemo(() => data?.event.mode === 'mais-tarde' ? preferenceSummary(data.event, data.votes) : [], [data]);

  function toggleSlot(dayId: string, slot: string) {
    setAvailability((current) => {
      const selected = current[dayId] || [];
      const next = selected.includes(slot) ? selected.filter((item) => item !== slot) : [...selected, slot];
      return { ...current, [dayId]: next };
    });
  }

  function openEdit() {
    if (!data) return;
    setEditEvent({ ...data.event, startsAt: toPickerValue(data.event.startsAt), days: data.event.days.map((day) => ({ ...day, slots: [...day.slots] })), alternatives: [...data.event.alternatives] });
  }

  function updateEdit(patch: Partial<BoraEvent>) {
    setEditEvent((current) => current ? { ...current, ...patch } : current);
  }

  function updateEditDay(dayId: string, patch: Partial<BoraEvent['days'][number]>) {
    setEditEvent((current) => current ? {
      ...current,
      days: current.days.map((day) => day.id === dayId ? { ...day, ...patch } : day)
    } : current);
  }

  function toggleEditSlot(dayId: string, slot: string, checked: boolean) {
    const day = editEvent?.days.find((item) => item.id === dayId);
    if (!day) return;
    updateEditDay(dayId, { slots: checked ? [...day.slots, slot] : day.slots.filter((item) => item !== slot) });
  }

  function addEditDay() {
    const date = localDateKey();
    setEditEvent((current) => current ? {
      ...current,
      days: [...current.days, { id: `day_${Date.now()}`, label: 'Novo dia', date, slots: [] }]
    } : current);
  }

  function removeEditDay(dayId: string) {
    setEditEvent((current) => current ? { ...current, days: current.days.filter((day) => day.id !== dayId) } : current);
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
    if (data.event.mode === 'marcar' && response !== 'decline' && selectedSlots.length === 0) {
      toast({ message: 'Marque pelo menos um horário ou selecione “Não posso”.', color: 'danger', duration: 2600 });
      return;
    }
    localStorage.setItem('bora_voter_name', name.trim());
    setSubmittingVote(true);
    try {
      await submitVote(data.event, {
        voterName: name.trim(),
        response,
        preferredOption: data.event.mode === 'mais-tarde' && response !== 'decline' ? preferredOption : undefined,
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

  async function shareLink() {
    const url = `${window.location.origin}/e/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: data?.event.title || 'Bora', text: 'Bora combinar?', url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyText(url, 'Link dos convidados copiado!');
  }

  async function copyAdminLink() {
    if (!data) return;
    await copyText(`${window.location.origin}/e/${slug}?admin=${adminToken}`, 'Link de administrador copiado!');
  }

  function shareOnWhatsApp() {
    const invitationUrl = `${window.location.origin}/e/${slug}`;
    const message = `Bora combinar? ${data?.event.title || 'Participe do meu Bora'}: ${invitationUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <IonPage><IonContent className="ion-padding center"><IonSpinner /><p>Carregando...</p></IonContent></IonPage>;
  }

  if (!data) {
    return <IonPage><IonContent className="ion-padding center"><h1>Evento não encontrado</h1><IonButton routerLink="/home">Voltar</IonButton></IonContent></IonPage>;
  }

  const { event, votes } = data;
  const preferredOptions = event.mode === 'mais-tarde'
    ? Array.from(new Set([formatTime(event.startsAt), ...event.alternatives].filter(Boolean)))
    : [];
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
                  <strong>Seu Bora está pronto! 🎉</strong>
                  <p>Agora é só chamar a galera.</p>
                </div>
                <IonButton onClick={shareOnWhatsApp}>Compartilhar</IonButton>
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
              <div className="event-facts">
                <p><span aria-hidden="true">📍</span><span><small>Local</small><strong>{event.place}</strong></span></p>
                {event.startsAt && <p><span aria-hidden="true">🗓️</span><span><small>Quando</small><strong>{new Date(event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span></p>}
              </div>
              {event.description && <p className="event-description">{event.description}</p>}
              <div className="status-block">
                <div className="status-heading">
                  <strong>{counts.accept >= event.threshold ? 'Bora confirmado!' : `${counts.accept} de ${event.threshold} confirmados`}</strong>
                  <span>{Math.round(confirmationProgress)}%</span>
                </div>
                <div className="threshold-progress" role="progressbar" aria-label={`${counts.accept} de ${event.threshold} confirmações`} aria-valuemin={0} aria-valuemax={event.threshold} aria-valuenow={counts.accept}>
                  <span style={{ width: `${confirmationProgress}%` }} />
                </div>
                <p>{statusText(event, votes)}</p>
              </div>
            </IonCardContent>
          </IonCard>

          {isAdmin && (
            <nav className="admin-nav" aria-label="Seções da administração">
              <button type="button" className={adminSection === 'overview' ? 'active' : ''} onClick={() => setAdminSection('overview')}>Resumo</button>
              <button type="button" className={adminSection === 'manage' ? 'active' : ''} onClick={() => setAdminSection('manage')}>Gerenciar</button>
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
                          ? `${responseLabel(ownVote.response)}${ownVote.preferredOption ? ` · prefere ${ownVote.preferredOption}` : ''}`
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
                      <IonItem className="name-field" lines="none"><IonLabel position="stacked">Seu nome</IonLabel><IonInput value={name} onIonInput={(e) => setName(e.detail.value || '')} placeholder="Como a galera te chama?" required /></IonItem>

                      {event.mode === 'mais-tarde' && (
                        <IonRadioGroup className="time-options" value={preferredOption} onIonChange={(e) => setPreferredOption(e.detail.value)}>
                          {preferredOptions.map((option, index) => (
                            <IonItem key={option} lines="none"><IonRadio value={option} /><IonLabel className="ion-margin-start">{index === 0 ? `Principal · ${option}` : option}</IonLabel></IonItem>
                          ))}
                        </IonRadioGroup>
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
                        <IonButton className="response-yes" disabled={event.votingClosed || submittingVote} onClick={() => void vote('accept')}><span><b aria-hidden="true">🙌</b>{submittingVote ? 'Salvando...' : 'Bora!'}</span></IonButton>
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
                <IonCard>
                  <IonCardContent>
                    <h3>Convidar pessoas</h3>
                    <p className="muted">O link de convite não dá acesso aos controles do organizador.</p>
                    <div className="share-actions">
                      <IonButton expand="block" onClick={shareOnWhatsApp}>Compartilhar no WhatsApp</IonButton>
                      <IonButton expand="block" fill="outline" onClick={() => void shareLink()}>Copiar link de convite</IonButton>
                    </div>
                    <button type="button" className="admin-link-action" onClick={() => void copyAdminLink()}>Copiar link privado do administrador</button>
                  </IonCardContent>
                </IonCard>
                <IonCard>
                  <IonCardContent>
                    <h3>Configurações</h3>
                    <div className="settings-row">
                      <div><strong>Receber novos votos</strong><span>{event.votingClosed ? 'A votação está encerrada.' : 'Convidados ainda podem responder.'}</span></div>
                      <IonButton fill="outline" onClick={() => void toggleVoting()} disabled={savingAdminAction}>{event.votingClosed ? 'Reabrir' : 'Encerrar'}</IonButton>
                    </div>
                    <div className="settings-row">
                      <div><strong>Detalhes do evento</strong><span>Nome, local, meta e horários.</span></div>
                      <IonButton fill="outline" onClick={openEdit}>Editar</IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
                <IonCard className="danger-zone">
                  <IonCardContent>
                    <div>
                      <h3>Excluir evento</h3>
                      <p>Apaga o evento e todos os votos permanentemente.</p>
                    </div>
                    <IonButton fill="clear" color="danger" onClick={confirmDelete} disabled={savingAdminAction}>Excluir</IonButton>
                  </IonCardContent>
                </IonCard>
              </section>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'marcar' && (
              <IonCard>
                <IonCardHeader><IonCardTitle>Melhores horários</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {availabilitySummary.length === 0 && <p>Nenhuma disponibilidade enviada ainda.</p>}
                  {availabilitySummary.slice(0, 8).map((item) => {
                    const percentage = event.threshold ? Math.min(100, (item.count / event.threshold) * 100) : 0;
                    return (
                      <div className="result-row" key={`${item.day.id}-${item.slot}`}>
                        <strong>{item.day.label} · {item.slot}</strong>
                        <IonBadge color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={`${item.day.label}, ${item.slot}: ${item.count} pessoas disponíveis`} aria-valuemin={0} aria-valuemax={event.threshold} aria-valuenow={item.count}>
                          <span style={{ width: `${percentage}%` }} />
                        </div>
                        <span>{item.names.join(', ') || 'Sem votos'}</span>
                      </div>
                    );
                  })}
                </IonCardContent>
              </IonCard>
            )}

            {(!isAdmin || adminSection === 'overview') && event.mode === 'mais-tarde' && (
              <IonCard>
                <IonCardHeader><IonCardTitle>Horários preferidos</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {timePreferences.map((item) => {
                    const percentage = votes.length ? (item.count / votes.length) * 100 : 0;
                    return (
                      <div className="result-row" key={item.option}>
                        <strong>{item.option === formatTime(event.startsAt) ? `Horário principal · ${item.option}` : item.option}</strong>
                        <IonBadge color={item.count > 0 ? 'primary' : 'medium'}>{item.count}</IonBadge>
                        <div className="result-progress" role="progressbar" aria-label={`${item.option}: ${item.count} preferências`} aria-valuemin={0} aria-valuemax={votes.length} aria-valuenow={item.count}>
                          <span style={{ width: `${percentage}%` }} />
                        </div>
                        <span>{item.count === 1 ? '1 preferência' : `${item.count} preferências`}</span>
                      </div>
                    );
                  })}
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
                        <p>{responseLabel(vote.response)}{vote.preferredOption ? ` · prefere ${vote.preferredOption}` : ''}</p>
                      </IonLabel>
                    </IonItem>
                  ))}
                </IonList>
              </IonCardContent>
            </IonCard>}
          </div>

        </section>

        <IonModal isOpen={Boolean(editEvent)} onDidDismiss={() => setEditEvent(null)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Editar evento</IonTitle>
              <IonButtons slot="end"><IonButton onClick={() => setEditEvent(null)}>Fechar</IonButton></IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            {editEvent && (
              <div className="event-editor">
                <IonItem><IonLabel position="stacked">Nome do evento *</IonLabel><IonInput value={editEvent.title} onIonInput={(item) => updateEdit({ title: item.detail.value || '' })} /></IonItem>
                <IonItem><IonLabel position="stacked">Local *</IonLabel><IonInput value={editEvent.place} onIonInput={(item) => updateEdit({ place: item.detail.value || '' })} /></IonItem>
                <IonItem><IonLabel position="stacked">Descrição</IonLabel><IonTextarea value={editEvent.description || ''} onIonInput={(item) => updateEdit({ description: item.detail.value || '' })} /></IonItem>
                <IonItem><IonLabel position="stacked">Mínimo de confirmações *</IonLabel><IonInput type="number" min={1} value={String(editEvent.threshold)} onIonInput={(item) => updateEdit({ threshold: Number(item.detail.value || 0) })} /></IonItem>

                {editEvent.mode === 'agora' && <IonItem><IonLabel position="stacked">Horário</IonLabel><IonDatetime presentation="time" value={editEvent.startsAt} onIonChange={(item) => updateEdit({ startsAt: String(item.detail.value) })} /></IonItem>}
                {editEvent.mode === 'mais-tarde' && <IonItem><IonLabel position="stacked">Dia e horário principal</IonLabel><IonDatetime value={editEvent.startsAt} onIonChange={(item) => updateEdit({ startsAt: String(item.detail.value) })} /></IonItem>}

                {editEvent.mode === 'marcar' && (
                  <section className="day-editor" aria-labelledby="edit-schedule-title">
                    <h2 id="edit-schedule-title">Dias e horários</h2>
                    {editEvent.days.map((day) => (
                      <IonCard key={day.id}>
                        <IonCardContent>
                          <IonItem><IonLabel position="stacked">Rótulo do dia *</IonLabel><IonInput value={day.label} onIonInput={(item) => updateEditDay(day.id, { label: item.detail.value || '' })} /></IonItem>
                          <IonItem><IonLabel position="stacked">Data *</IonLabel><IonInput type="date" value={day.date} onIonInput={(item) => updateEditDay(day.id, { date: item.detail.value || '' })} /></IonItem>
                          <div className="schedule-time-picker">
                            <IonLabel>Horários *</IonLabel>
                            <div className="schedule-time-grid">
                              {scheduleTimes.map((slot) => <IonCheckbox key={slot} checked={day.slots.includes(slot)} onIonChange={(item) => toggleEditSlot(day.id, slot, item.detail.checked)}>{slot}</IonCheckbox>)}
                            </div>
                          </div>
                          <IonButton color="danger" fill="clear" size="small" onClick={() => removeEditDay(day.id)}>Remover dia</IonButton>
                        </IonCardContent>
                      </IonCard>
                    ))}
                    <IonButton fill="outline" onClick={addEditDay}>+ Adicionar dia</IonButton>
                  </section>
                )}

                <IonButton expand="block" onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar alterações'}</IonButton>
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}
