import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonChip, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonPage, IonRadio, IonRadioGroup, IonSpinner, IonTextarea, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getEvent, subscribeToEvent, submitVote, updateEvent } from '../lib/store';
import { responseLabel } from '../lib/schedule';
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
  return `Faltam ${event.threshold - accepted} confirmação(ões). ${accepted}/${event.threshold} até agora.`;
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
  const [data, setData] = useState<EventWithVotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(localStorage.getItem('bora_voter_name') || '');
  const [preferredOption, setPreferredOption] = useState('');
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [editEvent, setEditEvent] = useState<BoraEvent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const isAdmin = data?.event.adminToken && query.get('admin') === data.event.adminToken;
  const wasJustCreated = query.get('created') === '1';

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function refresh() {
      try {
        const result = await getEvent(slug);
        if (!active) return;
        setData(result);
        if (result?.event.mode === 'mais-tarde') {
          setPreferredOption(formatTime(result.event.startsAt) || result.event.alternatives[0] || '');
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
  }, [slug, toast]);

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
    setEditEvent({ ...data.event, days: data.event.days.map((day) => ({ ...day, slots: [...day.slots] })), alternatives: [...data.event.alternatives] });
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
    const date = new Date().toISOString().slice(0, 10);
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
      const updated = await updateEvent(data.event.adminToken, {
        ...editEvent,
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
    try {
      await submitVote(data.event, {
        voterName: name.trim(),
        response,
        preferredOption: data.event.mode === 'mais-tarde' ? preferredOption : undefined,
        availability: data.event.mode === 'marcar' ? availability : {}
      });
      const refreshed = await getEvent(slug);
      setData(refreshed);
      toast({ message: 'Voto registrado!', color: 'success', duration: 2200 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível votar.', color: 'danger', duration: 2600 });
    }
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
    await copyText(`${window.location.origin}/e/${slug}?admin=${data.event.adminToken}`, 'Link de administrador copiado!');
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

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
          <IonTitle>{event.title}</IonTitle>
          {isAdmin && <IonButtons slot="end"><IonButton onClick={openEdit}>Editar</IonButton></IonButtons>}
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding event-page">
        <section className="event-layout">
          {isAdmin && wasJustCreated && (
            <IonCard className="success-card">
              <IonCardHeader><IonCardTitle>Seu Bora está pronto! 🎉</IonCardTitle></IonCardHeader>
              <IonCardContent>
                <p>Envie o convite para a galera votar.</p>
                <IonButton expand="block" onClick={shareOnWhatsApp}>Compartilhar no WhatsApp</IonButton>
                <IonButton expand="block" fill="outline" onClick={() => void shareLink()}>COPIAR LINK DE CONVITE</IonButton>
                <IonButton expand="block" fill="outline" onClick={() => void copyAdminLink()}>COPIAR LINK DO ADMINISTRADOR</IonButton>
              </IonCardContent>
            </IonCard>
          )}
          <div>
            <IonCard className="event-summary">
              <IonCardHeader>
                <IonChip color="primary">{event.mode === 'agora' ? 'Bora Agora' : event.mode === 'mais-tarde' ? 'Bora Mais Tarde' : 'Bora Marcar'}</IonChip>
                <IonCardTitle>{event.title}</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p><strong>Local:</strong> {event.place}</p>
                {event.startsAt && <p><strong>Quando:</strong> {new Date(event.startsAt).toLocaleString('pt-BR')}</p>}
                {event.description && <p>{event.description}</p>}
                <h2>{statusText(event, votes)}</h2>
                <div className="count-row">
                  <IonBadge color="success">Topo: {counts.accept}</IonBadge>
                  <IonBadge color="warning">Talvez: {counts.maybe}</IonBadge>
                  <IonBadge color="danger">Não: {counts.decline}</IonBadge>
                </div>
                {isAdmin && (
                  <div className="admin-panel">
                    <p className="muted">Você está no link de administrador.</p>
                    <IonButton expand="block" onClick={() => void copyAdminLink()}>COPIAR LINK DO ADMINISTRADOR</IonButton>
                    <IonButton expand="block" fill="outline" onClick={() => void shareLink()}>COPIAR LINK DE CONVITE</IonButton>
                  </div>
                )}
              </IonCardContent>
            </IonCard>

            {event.mode === 'marcar' && (
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

            {event.mode === 'mais-tarde' && (
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

            <IonCard>
              <IonCardHeader><IonCardTitle>Votos</IonCardTitle></IonCardHeader>
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
            </IonCard>
          </div>

          {!isAdmin && (
            <IonCard className="vote-card">
              <IonCardHeader><IonCardTitle>Seu voto</IonCardTitle></IonCardHeader>
            <IonCardContent>
              <IonItem><IonLabel position="stacked">Seu nome *</IonLabel><IonInput value={name} onIonInput={(e) => setName(e.detail.value || '')} placeholder="Ex: Ana" required /></IonItem>

              {event.mode === 'agora' && <p className="muted">Você topa sair agora?</p>}

              {event.mode === 'mais-tarde' && (
                <IonRadioGroup value={preferredOption} onIonChange={(e) => setPreferredOption(e.detail.value)}>
                  <h3>Qual horário você prefere?</h3>
                  {preferredOptions.map((option, index) => (
                    <IonItem key={option}><IonRadio value={option} /><IonLabel className="ion-margin-start">{index === 0 ? `Horário principal · ${option}` : option}</IonLabel></IonItem>
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
                        <p>{day.date}</p>
                        {day.slots.map((slot) => {
                          const selected = (availability[day.id] || []).includes(slot);
                          return <button key={slot} className={selected ? 'slot selected' : 'slot'} aria-pressed={selected} aria-label={`${day.label}, ${slot}`} onClick={() => toggleSlot(day.id, slot)}>{slot}</button>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="vote-actions" aria-label="Registrar voto">
                <IonButton expand="block" size="large" disabled={event.votingClosed} onClick={() => void vote('accept')}>BORA</IonButton>
                <IonButton expand="block" size="large" fill="outline" disabled={event.votingClosed} onClick={() => void vote('maybe')}>TALVEZ</IonButton>
                <IonButton expand="block" size="large" color="medium" disabled={event.votingClosed} onClick={() => void vote('decline')}>NÃO POSSO</IonButton>
              </div>
              </IonCardContent>
            </IonCard>
          )}
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
