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
          <img className="bora-share-symbol" src={shareSymbol} alt="Símbolo de compartilhamento Bora" />
          <h1>Crie um convite, mande o link, combine sem fricção.</h1>
          <p>
            Bora Agora, Bora Mais Tarde e Bora Marcar ajudam grupos a decidir se o rolê vai acontecer, sem obrigar convidados a criar conta.
          </p>
          <div className="home-mode-actions" role="group" aria-label="Escolha o tipo de Bora">
            <IonButton routerLink="/create?mode=agora" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>BORA AGORA! 🧑‍🤝‍🧑</span><small>Quem topa sair hoje?</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=mais-tarde" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora mais tarde 🕒</span><small>Qual horário funciona hoje?</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=marcar" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora marcar 📅</span><small>Qual dia funciona para todos?</small></span>
            </IonButton>
          </div>
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
