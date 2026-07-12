import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonPage, IonRadio, IonRadioGroup, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getEvent, submitVote, updateEvent } from '../lib/store';
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

function slotSummary(event: BoraEvent, votes: BoraVote[]) {
  return event.days.flatMap((day) => day.slots.map((slot) => {
    const names = votes
      .filter((vote) => vote.response !== 'decline' && (vote.availability[day.id] || []).includes(slot))
      .map((vote) => vote.voterName);
    return { day, slot, names, count: names.length };
  })).sort((a, b) => b.count - a.count);
}

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const query = useQuery();
  const [toast] = useIonToast();
  const [data, setData] = useState<EventWithVotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(localStorage.getItem('bora_voter_name') || '');
  const [response, setResponse] = useState<VoteResponse>('accept');
  const [preferredOption, setPreferredOption] = useState('');
  const [availability, setAvailability] = useState<Record<string, string[]>>({});

  const isAdmin = data?.event.adminToken && query.get('admin') === data.event.adminToken;

  useEffect(() => {
    getEvent(slug).then((result) => {
      setData(result);
      if (result?.event.alternatives[0]) setPreferredOption(result.event.alternatives[0]);
    }).catch((error) => toast({ message: error.message, color: 'danger', duration: 3000 })).finally(() => setLoading(false));
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

  function toggleSlot(dayId: string, slot: string) {
    setAvailability((current) => {
      const selected = current[dayId] || [];
      const next = selected.includes(slot) ? selected.filter((item) => item !== slot) : [...selected, slot];
      return { ...current, [dayId]: next };
    });
  }

  async function vote() {
    if (!data) return;
    if (data.event.votingClosed) {
      toast({ message: 'Esta votação foi encerrada.', color: 'warning', duration: 2200 });
      return;
    }
    if (!name.trim()) {
      toast({ message: 'Coloque seu nome para votar.', color: 'danger', duration: 2200 });
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

  function copyText(url: string, message: string) {
    navigator.clipboard?.writeText(url);
    toast({ message, color: 'success', duration: 1800 });
  }

  function shareLink() {
    copyText(`${window.location.origin}/e/${slug}`, 'Link dos convidados copiado!');
  }

  function copyAdminLink() {
    if (!data) return;
    copyText(`${window.location.origin}/e/${slug}?admin=${data.event.adminToken}`, 'Link de administrador copiado!');
  }

  async function toggleVotingClosed() {
    if (!data || !isAdmin) return;
    const nextEvent = { ...data.event, votingClosed: !data.event.votingClosed };
    try {
      await updateEvent(data.event.adminToken, nextEvent);
      setData({ ...data, event: nextEvent });
      toast({ message: nextEvent.votingClosed ? 'Votação encerrada.' : 'Votação reaberta.', color: 'success', duration: 1800 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível atualizar.', color: 'danger', duration: 2600 });
    }
  }

  if (loading) {
    return <IonPage><IonContent className="ion-padding center"><IonSpinner /><p>Carregando...</p></IonContent></IonPage>;
  }

  if (!data) {
    return <IonPage><IonContent className="ion-padding center"><h1>Evento não encontrado</h1><IonButton routerLink="/home">Voltar</IonButton></IonContent></IonPage>;
  }

  const { event, votes } = data;

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
                <IonButton expand="block" onClick={shareLink}>Copiar link para convidados</IonButton>
                {isAdmin && (
                  <div className="admin-panel">
                    <p className="muted">Você está com o link de administrador. Guarde este link para gerenciar depois.</p>
                    <IonButton expand="block" fill="outline" onClick={copyAdminLink}>Copiar link de administrador</IonButton>
                    <IonButton expand="block" color={event.votingClosed ? 'success' : 'warning'} onClick={toggleVotingClosed}>
                      {event.votingClosed ? 'Reabrir votação' : 'Encerrar votação'}
                    </IonButton>
                  </div>
                )}
              </IonCardContent>
            </IonCard>

            {event.mode === 'marcar' && (
              <IonCard>
                <IonCardHeader><IonCardTitle>Melhores horários</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {availabilitySummary.length === 0 && <p>Nenhuma disponibilidade enviada ainda.</p>}
                  {availabilitySummary.slice(0, 8).map((item) => (
                    <div className="result-row" key={`${item.day.id}-${item.slot}`}>
                      <strong>{item.day.label} · {item.slot}</strong>
                      <IonBadge color={item.count >= event.threshold ? 'success' : 'medium'}>{item.count}</IonBadge>
                      <span>{item.names.join(', ') || 'Sem votos'}</span>
                    </div>
                  ))}
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

          <IonCard className="vote-card">
            <IonCardHeader><IonCardTitle>Seu voto</IonCardTitle></IonCardHeader>
            <IonCardContent>
              <IonItem><IonLabel position="stacked">Seu nome</IonLabel><IonInput value={name} onIonInput={(e) => setName(e.detail.value || '')} placeholder="Ex: Ana" /></IonItem>
              <IonSegment value={response} onIonChange={(e) => setResponse(e.detail.value as VoteResponse)}>
                <IonSegmentButton value="accept">Topo</IonSegmentButton>
                <IonSegmentButton value="maybe">Talvez</IonSegmentButton>
                <IonSegmentButton value="decline">Não vou</IonSegmentButton>
              </IonSegment>

              {event.mode === 'agora' && <p className="muted">Vote pensando se você topa sair agora. O evento acontece se atingir o mínimo de confirmações.</p>}

              {event.mode === 'mais-tarde' && event.alternatives.length > 0 && (
                <IonRadioGroup value={preferredOption} onIonChange={(e) => setPreferredOption(e.detail.value)}>
                  <h3>Preferência de horário</h3>
                  {event.alternatives.map((option) => (
                    <IonItem key={option}><IonRadio value={option} /><IonLabel className="ion-margin-start">{option}</IonLabel></IonItem>
                  ))}
                </IonRadioGroup>
              )}

              {event.mode === 'marcar' && (
                <div>
                  <h3>Marque quando você pode</h3>
                  <div className="day-scroll">
                    {event.days.map((day) => (
                      <div className="day-card" key={day.id}>
                        <h4>{day.label}</h4>
                        <p>{day.date}</p>
                        {day.slots.map((slot) => {
                          const selected = (availability[day.id] || []).includes(slot);
                          return <button key={slot} className={selected ? 'slot selected' : 'slot'} onClick={() => toggleSlot(day.id, slot)}>{slot}</button>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <IonButton expand="block" size="large" disabled={event.votingClosed} onClick={vote}>
                {event.votingClosed ? 'Votação encerrada' : 'Enviar voto'}
              </IonButton>
            </IonCardContent>
          </IonCard>
        </section>
      </IonContent>
    </IonPage>
  );
}
