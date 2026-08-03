import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useState } from 'react';
import { getEvent, listAdminEvents, listMyEvents, type MyEvents } from '../lib/store';
import type { BoraEvent } from '../lib/types';

type EventListItem = { event: BoraEvent; confirmed: number };
type EventGroups = { created: EventListItem[]; joined: EventListItem[] };

function modeLabel(event: BoraEvent) { return event.mode === 'agora' ? 'Bora agora' : event.mode === 'mais-tarde' ? 'Bora essa semana' : 'Bora marcar'; }
function eventStatus(event: BoraEvent) { return event.decidedOption ? 'Definido' : event.votingClosed ? 'Encerrado' : 'Recebendo respostas'; }
function eventDateParts(event: BoraEvent) {
  if (event.startsAt) {
    const date = new Date(event.startsAt);
    return [date.toLocaleDateString('pt-BR', { dateStyle: 'medium' }), date.toLocaleTimeString('pt-BR', { timeStyle: 'short' })];
  }
  if (event.mode === 'marcar' && event.days[0]) return [event.days[0].label, event.days[0].slots.join(', ')];
  return ['Data a combinar', ''];
}
function eventTime(event: BoraEvent) {
  if (event.startsAt) return new Date(event.startsAt).getTime();
  if (event.mode === 'marcar' && event.days[0]) return new Date(`${event.days[0].date}T${event.days[0].slots[0] || '00:00'}`).getTime();
  return Number.POSITIVE_INFINITY;
}
function sortEvents(items: EventListItem[]) {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aTime = eventTime(a.event); const bTime = eventTime(b.event);
    const aUpcoming = aTime >= now; const bUpcoming = bTime >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
  });
}

export default function MyEventsPage() {
  const [toast] = useIonToast();
  const router = useIonRouter();
  const [events, setEvents] = useState<EventGroups>({ created: [], joined: [] });
  const [loading, setLoading] = useState(true);

  useIonViewWillEnter(() => {
    let active = true;
    setLoading(true);
    void listMyEvents().then(async (result: MyEvents) => {
      const hydrate = async (event: BoraEvent): Promise<EventListItem> => {
        const detail = await getEvent(event.slug).catch(() => null);
        return { event, confirmed: detail?.votes.filter((vote) => vote.response === 'accept').length || 0 };
      };
      const [created, joined] = await Promise.all([Promise.all(result.created.map(hydrate)), Promise.all(result.joined.map(hydrate))]);
      if (active) setEvents({ created: sortEvents(created), joined: sortEvents(joined) });
    }).catch((error) => {
      if (active) toast({ message: error instanceof Error ? error.message : 'Não foi possível carregar seus Boras.', color: 'danger', duration: 2800 });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  });

  const adminTokens = new Map(listAdminEvents().map((event) => [event.slug, event.adminToken]));
  const eventLink = (event: BoraEvent) => `/e/${event.slug}${adminTokens.get(event.slug) ? `?admin=${adminTokens.get(event.slug)}` : ''}`;
  function section(title: string, items: EventListItem[], role: string, empty: string, emptyAction = true) {
    return <section className="my-events-section"><div className="my-events-section-heading"><h2>{title}</h2>{items.length > 0 && <span>{items.length}</span>}</div>
      {items.length === 0 ? <div className="my-events-empty"><p>{empty}</p>{emptyAction && <IonButton fill="clear" routerLink="/create?mode=agora">Criar um Bora</IonButton>}</div> : items.map(({ event, confirmed }) => {
        const [date, time] = eventDateParts(event);
        return <button type="button" key={event.id} className="my-event-card" onClick={() => router.push(eventLink(event), 'forward')}><span className="my-event-heading"><span className="event-mode-tag">{modeLabel(event)}</span><span className={`event-status-tag ${event.votingClosed ? 'closed' : ''}`}>{eventStatus(event)}</span><strong>{event.title}</strong></span><span className="my-event-metadata"><span>{date}</span>{time && <span>{time}</span>}<span>{event.place}</span></span><span className="my-event-card-bottom"><span>{role}</span><span>{confirmed} de {event.threshold} confirmaram</span></span><span className="my-event-chevron" aria-hidden="true">›</span></button>;
      })}</section>;
  }
  return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons><IonTitle>Meus Boras</IonTitle></IonToolbar></IonHeader><IonContent className="ion-padding form-page"><section className="my-events-intro"><span className="section-eyebrow">Sua agenda</span><p>Eventos que você criou ou em que está participando.</p></section>{loading ? <div className="center"><IonSpinner /><p>Carregando...</p></div> : <><>{section('Criados por mim', events.created, 'Organizador', 'Você ainda não criou nenhum Bora.')}</>{section('Participo', events.joined, 'Convidado', 'Os Boras em que você responder aparecerão aqui. Abra um link de convite para participar.', false)}</>}<IonButton fill="outline" className="other-device-action" routerLink="/recover">Usar meus Boras em outro dispositivo</IonButton></IonContent></IonPage>;
}
