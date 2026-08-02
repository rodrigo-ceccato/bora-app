import { IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonTitle, IonToolbar, useIonViewWillEnter } from '@ionic/react';
import { useState } from 'react';
import shareSymbol from '../assets/share-sem-bolinha.png';
import { listAdminEvents } from '../lib/store';

export default function HomePage() {
  const [createdEvents, setCreatedEvents] = useState(listAdminEvents());

  useIonViewWillEnter(() => setCreatedEvents(listAdminEvents()));

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Bora</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding hero-bg">
        <section className="hero">
          <h1>Bora marcar?</h1>
          <img className="bora-share-symbol" src={shareSymbol} alt="Símbolo de compartilhamento Bora" />
          <p>
            Crie um convite, envie o link, não precisa de conta para criar ou votar, é só fazer o rolê acontecer.
          </p>
          <div className="home-mode-actions" role="group" aria-label="Escolha o tipo de Bora">
            <IonButton routerLink="/create?mode=agora" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>BORA AGORA! 🧑‍🤝‍🧑</span><small>Quem topa sair hoje?</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=mais-tarde" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora essa semana? 🗓️</span><small>Qual dia e horário dessa semana funcionam?</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=marcar" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora marcar 📅</span><small>Qual dia funciona para todos?</small></span>
            </IonButton>
          </div>
          <IonButton fill="outline" expand="block" routerLink="/my-events">Meus Boras</IonButton>
          {createdEvents.length > 0 && (
            <IonCard className="created-events-card">
              <IonCardContent>
                <h2>Meus Boras neste aparelho</h2>
                <div className="created-events-list">
                  {createdEvents.map((event) => (
                    <IonButton
                      key={event.slug}
                      fill="outline"
                      routerLink={`/e/${event.slug}?admin=${event.adminToken}`}
                    >
                      {event.title}
                    </IonButton>
                  ))}
                </div>
                <p className="muted">Os links de criador ficam salvos somente neste navegador.</p>
              </IonCardContent>
            </IonCard>
          )}
        </section>
      </IonContent>
    </IonPage>
  );
}
