import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import shareSymbol from '../assets/share-sem-bolinha.png';

export default function HomePage() {

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
              <span className="mode-action-content"><span>BORA AGORA! 🧑‍🤝‍🧑</span><small>Decidir já</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=mais-tarde" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora mais tarde 🕒</span><small>Escolher um horário</small></span>
            </IonButton>
            <IonButton routerLink="/create?mode=marcar" size="large" expand="block" className="home-mode-button">
              <span className="mode-action-content"><span>Bora marcar 📅</span><small>Cruzar disponibilidades</small></span>
            </IonButton>
          </div>
        </section>
      </IonContent>
    </IonPage>
  );
}
