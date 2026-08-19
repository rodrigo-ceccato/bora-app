import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useState } from 'react';
import { eventArchiveTime, eventHasOccurred, listAdminEvents, listMyEvents, type MyEvents } from '../lib/store';
import type { BoraEvent } from '../lib/types';

type PastEvent = { event: BoraEvent; role: 'Organizador' | 'Convidado' };

function eventTime(event: BoraEvent) { return eventArchiveTime(event); }

export default function PastEventsPage() {
  const router = useIonRouter(); const [toast] = useIonToast(); const [events, setEvents] = useState<PastEvent[]>([]); const [loading, setLoading] = useState(true);
  useIonViewWillEnter(() => { let active = true; setLoading(true); void listMyEvents().then((result: MyEvents) => {
    const byId = new Map<string, PastEvent>();
    for (const event of result.created) byId.set(event.id, { event, role: 'Organizador' });
    for (const event of result.joined) if (!byId.has(event.id)) byId.set(event.id, { event, role: 'Convidado' });
    const past = [...byId.values()].filter(({ event }) => eventHasOccurred(event)).sort((a, b) => eventTime(b.event)! - eventTime(a.event)!);
    if (active) setEvents(past);
  }).catch((error) => { if (active) toast({ message: error instanceof Error ? error.message : 'Não foi possível carregar os Boras passados.', color: 'danger', duration: 2800 }); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; });
  const adminTokens = new Map(listAdminEvents().map((event) => [event.slug, event.adminToken]));
  return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/my-events" text="Voltar" /></IonButtons><IonTitle>Boras passados</IonTitle></IonToolbar></IonHeader><IonContent className="ion-padding form-page"><main className="my-events-container"><section className="my-events-intro"><span className="section-eyebrow">Arquivo</span><h1>Boras passados</h1><p>Encontros que passaram ou cujas opções de data se esgotaram.</p></section>{loading ? <div className="center"><IonSpinner /><p>Carregando...</p></div> : events.length ? <section className="my-events-section">{events.map(({ event, role }) => { const scheduledAt = new Date(eventTime(event)!); const isExpiredPoll = event.mode !== 'agora' && !event.decidedOption; return <button type="button" key={event.id} className="my-event-card" onClick={() => router.push(`/e/${event.slug}${adminTokens.get(event.slug) ? `?admin=${adminTokens.get(event.slug)}` : ''}`, 'forward')}><span className="my-event-heading"><span className="event-status-tag closed">{isExpiredPoll ? 'Opções encerradas' : 'Passado'}</span><strong>{event.title}</strong></span><span className="my-event-metadata"><span>{scheduledAt.toLocaleDateString('pt-BR', { dateStyle: 'medium' })}</span><span>{scheduledAt.toLocaleTimeString('pt-BR', { timeStyle: 'short' })}</span><span>{event.place}</span></span><span className="my-event-card-bottom"><span>{role}</span></span><span className="my-event-chevron" aria-hidden="true">›</span></button>; })}</section> : <section className="my-events-section"><div className="my-events-empty"><p>Nenhum Bora passado neste aparelho.</p></div></section>}</main></IonContent></IonPage>;
}
