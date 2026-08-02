import { IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { recoverParticipant } from '../lib/store';

export default function RecoverPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const location = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) { setStatus('error'); return; }
    void recoverParticipant(token)
      .then(() => { window.history.replaceState({}, '', '/recover'); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, [location.search]);

  return <IonPage>
    <IonHeader><IonToolbar><IonTitle>Recuperar meus Boras</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding form-page"><IonCard className="recovery-card"><IonCardContent>
      {status === 'loading' && <><IonSpinner /><h1>Recuperando seus Boras…</h1><p>Estamos restaurando sua lista neste aparelho.</p></>}
      {status === 'ready' && <><h1>Pronto!</h1><p>Seus Boras foram restaurados neste aparelho. Seus links de administrador continuam privados no aparelho original.</p><IonButton expand="block" routerLink="/my-events">Ver meus Boras</IonButton></>}
      {status === 'error' && <><h1>Não foi possível recuperar</h1><p>Esse link é inválido ou foi substituído por um novo.</p><IonButton expand="block" routerLink="/home">Voltar para o início</IonButton></>}
    </IonCardContent></IonCard></IonContent>
  </IonPage>;
}
