import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox, IonContent, IonHeader, IonItem, IonLabel, IonPage, IonSpinner, IonTitle, IonToolbar, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useState } from 'react';
import { createRecoveryLink, listAdminEvents, listMyEvents, type MyEvents } from '../lib/store';
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
  const [recoveryLink, setRecoveryLink] = useState('');
  const [creatingRecoveryLink, setCreatingRecoveryLink] = useState(false);
  const [includeAdminAccess, setIncludeAdminAccess] = useState(false);

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

  async function makeRecoveryLink() {
    setCreatingRecoveryLink(true);
    try {
      const link = await createRecoveryLink(includeAdminAccess);
      setRecoveryLink(link);
      await navigator.clipboard?.writeText(link);
      toast({ message: 'Link de recuperação copiado.', color: 'success', duration: 2400 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o link.', color: 'danger', duration: 2800 });
    } finally { setCreatingRecoveryLink(false); }
  }

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
      <IonCard className="recovery-card"><IonCardContent><h2>Levar meus Boras para outro aparelho</h2><p>Crie um link de recuperação para ver sua lista de Boras no novo aparelho.</p><IonItem lines="none" className="recovery-admin-option"><IonCheckbox checked={includeAdminAccess} onIonChange={(event) => setIncludeAdminAccess(event.detail.checked)} /><IonLabel className="ion-margin-start">Manter permissões de organização no novo dispositivo<small>Inclui os links de administrador deste aparelho. Compartilhe-o somente com você.</small></IonLabel></IonItem><IonButton fill="outline" onClick={() => void makeRecoveryLink()} disabled={creatingRecoveryLink}>{creatingRecoveryLink ? 'Criando...' : 'Criar link de recuperação'}</IonButton>{recoveryLink && <p className="recovery-link"><a href={recoveryLink}>{recoveryLink}</a></p>}</IonCardContent></IonCard>
      {loading ? <div className="center"><IonSpinner /><p>Carregando...</p></div> : <>
        {section('Criados por mim', events.created, 'Você ainda não criou nenhum Bora neste aparelho.')}
        {section('Participo', events.joined, 'Os Boras em que você responder aparecerão aqui.')}
      </>}
    </IonContent>
  </IonPage>;
}
