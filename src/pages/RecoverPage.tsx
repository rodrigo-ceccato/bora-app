import { IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { recoverParticipant, restoreAdminEvents, type AdminEventAccess } from '../lib/store';

function adminEventsFromFragment(hash: string): AdminEventAccess[] {
  try {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get('admin');
    const events = value ? JSON.parse(value) : [];
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

export default function RecoverPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [adminAccessRestored, setAdminAccessRestored] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) { setStatus('error'); return; }
    const adminEvents = adminEventsFromFragment(location.hash);
    void recoverParticipant(token)
      .then(() => {
        restoreAdminEvents(adminEvents);
        setAdminAccessRestored(adminEvents.length > 0);
        window.history.replaceState({}, '', '/recover');
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [location.search]);

  return <IonPage>
    <IonHeader><IonToolbar><IonTitle>Recuperar meus Boras</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding form-page"><IonCard className="recovery-card"><IonCardContent>
      {status === 'loading' && <><IonSpinner /><h1>Recuperando seus Boras…</h1><p>Estamos restaurando sua lista neste aparelho.</p></>}
      {status === 'ready' && <><h1>Pronto!</h1><p>Seus Boras foram restaurados neste aparelho.{adminAccessRestored ? ' Seus controles de organizador também foram restaurados.' : ' Seus links de administrador continuam privados no aparelho original.'}</p><IonButton expand="block" routerLink="/my-events">Ver meus Boras</IonButton></>}
      {status === 'error' && <><h1>Não foi possível recuperar</h1><p>Esse link é inválido ou foi substituído por um novo.</p><IonButton expand="block" routerLink="/home">Voltar para o início</IonButton></>}
    </IonCardContent></IonCard></IonContent>
  </IonPage>;
}
