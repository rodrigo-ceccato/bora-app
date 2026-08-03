import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox, IonContent, IonHeader, IonItem, IonLabel, IonPage, IonSpinner, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createRecoveryLink, recoverParticipant, restoreAdminEvents, type AdminEventAccess } from '../lib/store';

function adminEventsFromFragment(hash: string): AdminEventAccess[] {
  try {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get('admin');
    const events = value ? JSON.parse(value) : [];
    return Array.isArray(events) ? events : [];
  } catch { return []; }
}

export default function RecoverPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'transfer'>('loading');
  const [adminAccessRestored, setAdminAccessRestored] = useState(false);
  const [includeAdminAccess, setIncludeAdminAccess] = useState(false);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [toast] = useIonToast();
  const location = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) { setStatus('transfer'); return; }
    const adminEvents = adminEventsFromFragment(location.hash);
    void recoverParticipant(token)
      .then(() => {
        restoreAdminEvents(adminEvents);
        setAdminAccessRestored(adminEvents.length > 0);
        window.history.replaceState({}, '', '/recover');
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [location.search, location.hash]);

  async function createLink() {
    setCreating(true);
    try {
      const nextLink = await createRecoveryLink(includeAdminAccess);
      setLink(nextLink);
      toast({ message: 'Link criado.', color: 'success', duration: 1800 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o link.', color: 'danger', duration: 2800 });
    } finally { setCreating(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ message: 'Link copiado.', color: 'success', duration: 1800 });
    } catch { toast({ message: 'Não foi possível copiar o link.', color: 'danger', duration: 2200 }); }
  }

  async function shareLink() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Meus Boras', text: 'Use meus Boras em outro dispositivo', url: link }); return; } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  return <IonPage>
    <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/my-events" text="Voltar" /></IonButtons><IonTitle>{status === 'transfer' ? 'Usar meus Boras em outro dispositivo' : 'Recuperar meus Boras'}</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding form-page"><IonCard className="recovery-card"><IonCardContent>
      {status === 'loading' && <><IonSpinner /><h1>Recuperando seus Boras…</h1><p>Estamos restaurando sua lista neste aparelho.</p></>}
      {status === 'ready' && <><h1>Pronto!</h1><p>Seus Boras foram restaurados neste aparelho.{adminAccessRestored ? ' Seus controles de organizador também foram restaurados.' : ' Seus links de administrador continuam privados no aparelho original.'}</p><IonButton expand="block" routerLink="/my-events">Ver meus Boras</IonButton></>}
      {status === 'error' && <><h1>Não foi possível recuperar</h1><p>Esse link é inválido ou foi substituído por um novo.</p><IonButton expand="block" routerLink="/home">Voltar para o início</IonButton></>}
      {status === 'transfer' && <><h1>Usar meus Boras em outro dispositivo</h1><p>Crie um link para abrir sua lista em outro aparelho. Este aparelho continua com acesso normalmente.</p><IonItem lines="none" className="recovery-admin-option"><IonCheckbox checked={includeAdminAccess} onIonChange={(event) => setIncludeAdminAccess(event.detail.checked)} /><IonLabel className="ion-margin-start">Incluir acesso de organizador<small>Acesso sensível: quem receber este link poderá gerenciar seus eventos.</small></IonLabel></IonItem><IonButton onClick={() => void createLink()} disabled={creating}>{creating ? 'Criando...' : 'Criar link para outro dispositivo'}</IonButton>{link && <div className="recovery-link-actions"><p className="recovery-link"><a href={link}>{link}</a></p><IonButton fill="outline" onClick={() => void copyLink()}>Copiar link</IonButton><IonButton fill="clear" onClick={() => void shareLink()}>Compartilhar link</IonButton></div>}</>}
    </IonCardContent></IonCard></IonContent>
  </IonPage>;
}
