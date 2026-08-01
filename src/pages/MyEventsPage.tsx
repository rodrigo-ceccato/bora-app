import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useState } from 'react';
import { listAdminEvents, listMyEvents, type MyEvents } from '../lib/store';
import type { BoraEvent } from '../lib/types';

function eventDate(event: BoraEvent) {
  return event.startsAt
    ? new Date(event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Data a combinar';
}

export default function MyEventsPage() {
  const [toast] = useIonToast();
  const [events, setEvents] = useState<MyEvents>({ created: [], joined: [] });
  const [loading, setLoading] = useState(true);

  useIonViewWillEnter(() => {
    let active = true;
    setLoading(true);
    void listMyEvents()
      .then((result) => { if (active) setEvents(result); })
      .catch((error) => {
        if (active) toast({ message: error instanceof Error ? error.message : 'Não foi possível carregar seus Boras.', color: 'danger', duration: 2800 });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  });

  const adminTokens = new Map(listAdminEvents().map((event) => [event.slug, event.adminToken]));
  const eventLink = (event: BoraEvent) => {
    const token = adminTokens.get(event.slug);
    return `/e/${event.slug}${token ? `?admin=${token}` : ''}`;
  };

  function section(title: string, items: BoraEvent[], empty: string) {
    return <section className="my-events-section">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="muted">{empty}</p> : items.map((event) => (
        <IonCard key={event.id} className="my-event-card">
          <IonCardContent>
            <div><h3>{event.title}</h3><p>{eventDate(event)} · {event.place}</p></div>
            <IonButton fill="outline" routerLink={eventLink(event)}>Abrir</IonButton>
          </IonCardContent>
        </IonCard>
      ))}
    </section>;
  }

  return <IonPage>
    <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons><IonTitle>Meus Boras</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding form-page">
      <section className="my-events-intro"><h1>Meus Boras</h1><p>Eventos criados ou respondidos neste aparelho.</p></section>
      {loading ? <div className="center"><IonSpinner /><p>Carregando...</p></div> : <>
        {section('Criados por mim', events.created, 'Você ainda não criou nenhum Bora neste aparelho.')}
        {section('Participo', events.joined, 'Os Boras em que você responder aparecerão aqui.')}
      </>}
    </IonContent>
  </IonPage>;
}
