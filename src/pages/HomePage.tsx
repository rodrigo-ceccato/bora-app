import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, useIonViewWillEnter } from '@ionic/react';
import { useEffect, useState, type ReactNode } from 'react';
import { calendarOutline } from 'ionicons/icons';
import { getParticipantName, refreshParticipantProfile } from '../lib/store';

type Mode = 'agora' | 'mais-tarde' | 'marcar';

function ModeIcon({ mode }: { mode: Mode }) {
  const paths: Record<Mode, ReactNode> = {
    agora: <><circle cx="12" cy="12" r="7" /><path d="M12 8v4l2.5 2" /></>,
    'mais-tarde': <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-9 4h3m-3 3h5" /></>,
    marcar: <><path d="M5 4v16h14V4H5Z" /><path d="M8 2v4m8-4v4M5 9h14m-8 4h5m-5 3h3" /></>
  };
  return <svg className="mode-card-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[mode]}</svg>;
}

const actions: Array<{ mode: Mode; title: string; description: string }> = [
  { mode: 'agora', title: 'Bora agora', description: 'Veja quem topa sair hoje.' },
  { mode: 'mais-tarde', title: 'Bora essa semana', description: 'Encontre um horário que funcione.' },
  { mode: 'marcar', title: 'Bora marcar', description: 'Compare dias e horários com a turma.' }
];

export default function HomePage() {
  const [name, setName] = useState(getParticipantName);
  useEffect(() => {
    const updateName = () => setName(getParticipantName());
    window.addEventListener('bora:participant-name-updated', updateName);
    window.addEventListener('storage', updateName);
    return () => { window.removeEventListener('bora:participant-name-updated', updateName); window.removeEventListener('storage', updateName); };
  }, []);
  useIonViewWillEnter(() => { void refreshParticipantProfile(); });
  const firstName = name.trim().split(/\s+/)[0] || '';
  const title = firstName ? `Bora, ${firstName}?` : 'Bora?';
  return <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle className="home-toolbar-title" aria-label={title} title={title}>{title}</IonTitle>
        <IonButtons slot="end"><IonButton fill="clear" className="toolbar-secondary-action" routerLink="/my-events" aria-label="Meus Boras"><IonIcon icon={calendarOutline} aria-hidden="true" /><span>Meus Boras</span></IonButton></IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent className="ion-padding hero-bg">
      <section className="hero">
        <span className="hero-kicker">Combine sem complicação</span>
        <h1>Bora marcar?</h1>
        <img className="bora-share-symbol" src="/bora-share.svg" alt="Símbolo de compartilhamento Bora" />
        <p>Crie um convite, envie o link e faça o rolê acontecer. Ninguém precisa criar conta para participar.</p>
        <nav className="home-mode-actions" aria-label="Escolha o tipo de Bora">
          {actions.map((action) => <IonButton key={action.mode} fill="clear" routerLink={`/create?mode=${action.mode}`} className="home-mode-card">
            <ModeIcon mode={action.mode} />
            <span className="mode-card-copy"><strong>{action.title}</strong><small>{action.description}</small></span>
            <span className="mode-card-arrow" aria-hidden="true">→</span>
          </IonButton>)}
        </nav>
      </section>
    </IonContent>
  </IonPage>;
}
