import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useState } from 'react';
import { listCreatedEvents, usingSupabase } from '../lib/store';
import type { BoraEvent } from '../lib/types';

export default function HomePage() {
  const [events, setEvents] = useState<BoraEvent[]>([]);

  useEffect(() => {
    listCreatedEvents().then(setEvents).catch(console.error);
  }, []);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Bora</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding hero-bg">
        <section className="hero">
          <IonChip color="secondary">Ionic React + Capacitor</IonChip>
          <h1>Crie um convite, mande o link, combine sem fricção.</h1>
          <p>
            Bora Agora, Bora Mais Tarde e Bora Marcar ajudam grupos a decidir se o rolê vai acontecer, sem obrigar convidados a criar conta.
          </p>
          <IonButton routerLink="/create" size="large">Criar um Bora</IonButton>
          <p className="muted">Backend: {usingSupabase() ? 'Supabase configurado' : 'demo localStorage; configure Supabase para produção'}</p>
        </section>

        <section className="mode-grid">
          <IonCard>
            <IonCardHeader><IonCardTitle>Bora Agora</IonCardTitle></IonCardHeader>
            <IonCardContent>Para decidir se todo mundo topa ir agora. Configure mínimo de aceites para o evento acontecer.</IonCardContent>
          </IonCard>
          <IonCard>
            <IonCardHeader><IonCardTitle>Bora Mais Tarde</IonCardTitle></IonCardHeader>
            <IonCardContent>Para hoje ou próximos dias, com voto de presença e sugestão/preferência por alternativas.</IonCardContent>
          </IonCard>
          <IonCard>
            <IonCardHeader><IonCardTitle>Bora Marcar</IonCardTitle></IonCardHeader>
            <IonCardContent>Um when2meet simples: dias em cards horizontais e horários clicáveis para disponibilidade.</IonCardContent>
          </IonCard>
        </section>

        {events.length > 0 && (
          <section>
            <h2>Eventos recentes</h2>
            <div className="recent-list">
              {events.map((event) => (
                <IonCard key={event.id} routerLink={`/e/${event.slug}`} button>
                  <IonCardHeader>
                    <IonCardTitle>{event.title}</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>{event.place}</IonCardContent>
                </IonCard>
              ))}
            </div>
          </section>
        )}
      </IonContent>
    </IonPage>
  );
}
