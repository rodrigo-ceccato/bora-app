import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonTextarea, IonTitle, IonToolbar, useIonRouter, useIonToast } from '@ionic/react';
import { shieldCheckmarkOutline } from 'ionicons/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { rebindPushSubscription } from '../lib/push';
import { recoveryLinkDetails, recoveryLinkWithoutAdminAccess } from '../lib/recovery';
import { clearDeviceAuthentication, createRecoveryLink, hasRegisteredParticipant, recoverParticipant, refreshParticipantProfile, restoreAdminEvents, restoreParticipantId, restoreParticipantName } from '../lib/store';

const USED_TOKENS_KEY = 'bora_recovery_used_tokens';

function usedTokens(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(USED_TOKENS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function markTokenUsed(token: string) {
  try {
    sessionStorage.setItem(USED_TOKENS_KEY, JSON.stringify(Array.from(new Set([...usedTokens(), token]))));
  } catch {
    // Recovery itself succeeded; unavailable session storage must not undo it.
  }
}

type RecoveryStatus = 'loading' | 'confirm' | 'ready' | 'error' | 'transfer';
type QrStatus = 'idle' | 'loading' | 'ready' | 'error';
type QrScope = 'complete' | 'participant-only';

export default function RecoverPage() {
  const [status, setStatus] = useState<RecoveryStatus>('loading');
  const [adminAccessRestored, setAdminAccessRestored] = useState(false);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrStatus, setQrStatus] = useState<QrStatus>('idle');
  const [qrScope, setQrScope] = useState<QrScope>('complete');
  const [qrAttempt, setQrAttempt] = useState(0);
  const [copyFallback, setCopyFallback] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [toast] = useIonToast();
  const location = useLocation();
  const router = useIonRouter();
  const createdLinkRef = useRef<HTMLElement>(null);
  const manualLinkRef = useRef<HTMLIonTextareaElement>(null);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);

  const linkDetails = useMemo(() => link ? recoveryLinkDetails(link) : null, [link]);
  const organizerAccessCount = linkDetails?.adminEvents.length || 0;
  const qrTarget = useMemo(() => {
    if (!link) return '';
    return qrScope === 'complete' ? link : recoveryLinkWithoutAdminAccess(link);
  }, [link, qrScope]);

  const recoverFromLink = useCallback(async () => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      setStatus('transfer');
      return;
    }

    const details = recoveryLinkDetails(location.hash);
    if (details.invalidFragment) {
      setRecoveryError('Os dados privados deste link estão incompletos ou excedem os limites de segurança. Peça um novo link ao aparelho original. O acesso deste aparelho foi mantido.');
      setStatus('error');
      return;
    }

    setRecoveryError('');
    setStatus('loading');
    try {
      const participantId = await recoverParticipant(token);
      await rebindPushSubscription(participantId);
      clearDeviceAuthentication();
      restoreParticipantId(participantId);
      restoreAdminEvents(details.adminEvents);
      // Older links can provide a local fallback, but the profile associated
      // with the recovered anonymous identity is canonical.
      if (details.participantName) restoreParticipantName(details.participantName);
      await refreshParticipantProfile({ force: true });
      setAdminAccessRestored(details.adminEvents.length > 0);
      markTokenUsed(token);
      window.history.replaceState({}, '', '/home');
      setStatus('ready');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Não foi possível recuperar seus Boras.');
      setStatus('error');
    }
  }, [location.hash, location.search]);

  function cancelRecovery() {
    window.history.replaceState({}, '', '/recover');
    setStatus('transfer');
  }

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      setStatus('transfer');
      return;
    }
    if (usedTokens().includes(token)) {
      router.push('/home', 'forward', 'replace');
      return;
    }
    if (hasRegisteredParticipant()) setStatus('confirm');
    else void recoverFromLink();
  }, [location.search, location.hash, recoverFromLink, router]);

  useEffect(() => {
    if (status === 'loading') return;
    const frame = window.requestAnimationFrame(() => statusHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  useEffect(() => {
    if (!link) {
      setQrCode('');
      setQrStatus('idle');
      return;
    }
    if (recoveryLinkDetails(link).invalidFragment) {
      setQrCode('');
      setQrStatus('idle');
      return;
    }

    let active = true;
    setQrCode('');
    setQrStatus('loading');

    // QR generation is an optional enhancement. Keep it out of the route's
    // initial bundle so a failure cannot prevent link creation or recovery.
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(qrTarget, { width: 220, margin: 1, errorCorrectionLevel: 'M' }))
      .then((code) => {
        if (!active) return;
        setQrCode(code);
        setQrStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setQrCode('');
        setQrStatus('error');
      });

    return () => { active = false; };
  }, [link, qrTarget, qrAttempt]);

  useEffect(() => {
    if (!link) return;
    const frame = window.requestAnimationFrame(() => createdLinkRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [link]);

  useEffect(() => {
    if (!copyFallback) return;
    const frame = window.requestAnimationFrame(() => {
      void manualLinkRef.current?.setFocus().then(async () => (await manualLinkRef.current?.getInputElement())?.select());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [copyFallback]);

  async function createLink() {
    setCreating(true);
    setCopyFallback(false);
    setQrScope('complete');
    try {
      const nextLink = await createRecoveryLink();
      setLink(nextLink);
      toast({ message: 'Link criado.', color: 'success', duration: 1800 });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o link.', color: 'danger', duration: 2800 });
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(link);
      setCopyFallback(false);
      toast({ message: 'Link completo copiado.', color: 'success', duration: 1800 });
    } catch {
      setCopyFallback(true);
      toast({ message: 'A cópia automática não funcionou. Selecione o link completo exibido.', color: 'warning', duration: 2800 });
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Meus Boras', text: 'Use meus Boras em outro dispositivo', url: link });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  function useParticipantOnlyQr() {
    setQrScope('participant-only');
    setQrAttempt((current) => current + 1);
  }

  function retryQr() {
    setQrAttempt((current) => current + 1);
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={status === 'transfer' ? '/my-events' : '/home'} text="Voltar" /></IonButtons>
          <IonTitle>{status === 'transfer' ? 'Usar meus Boras em outro dispositivo' : 'Recuperar meus Boras'}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding form-page">
        <main className="recovery-container">
          <IonCard className="recovery-card"><IonCardContent>
            {status === 'loading' && <><IonSpinner /><h1>Recuperando seus Boras…</h1><p>Estamos restaurando sua lista neste aparelho.</p></>}
            {status === 'confirm' && <><h1 ref={statusHeadingRef} tabIndex={-1}>Usar este link de recuperação?</h1><p>Ele vai remover os Boras registrados neste aparelho e substituí-los pelos deste link.</p><IonButton expand="block" onClick={() => void recoverFromLink()}>Usar link</IonButton><IonButton expand="block" fill="clear" onClick={cancelRecovery}>Cancelar</IonButton></>}
            {status === 'ready' && <><h1 ref={statusHeadingRef} tabIndex={-1}>Pronto!</h1><p>Seus Boras foram restaurados neste aparelho.{adminAccessRestored ? ' Seus controles de organizador também foram restaurados.' : ' Seus links de administrador continuam privados no aparelho original.'}</p><IonButton expand="block" routerLink="/my-events">Ver meus Boras</IonButton></>}
            {status === 'error' && <><h1 ref={statusHeadingRef} tabIndex={-1}>Não foi possível recuperar</h1><p role="alert">{recoveryError || 'Esse link é inválido ou foi substituído por um novo.'}</p>{hasRegisteredParticipant() && <p>O acesso que já estava neste aparelho foi mantido.</p>}<IonButton expand="block" routerLink="/home">Voltar para o início</IonButton></>}
            {status === 'transfer' && <>
              <h1 ref={statusHeadingRef} tabIndex={-1}>Leve seus Boras para outro aparelho</h1>
              <p className="recovery-lead">Crie um link para acessar seus Boras em outro aparelho. Este aparelho continuará com acesso normalmente.</p>
              <p className="recovery-security-warning"><IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />Quem receber este link poderá editar e excluir os eventos que você organizou.</p>
              <p className="recovery-privacy-note">Esses controles ficam somente no trecho privado depois de # e não são enviados aos logs do servidor.</p>
              <IonButton expand="block" onClick={() => void createLink()} disabled={creating}>{creating ? 'Criando link…' : 'Criar link de acesso'}</IonButton>
              {link && <section ref={createdLinkRef} className="recovery-created-link" tabIndex={-1} aria-labelledby="recovery-link-title">
                <h2 id="recovery-link-title">Link completo criado</h2>
                <p>{linkDetails?.invalidFragment
                  ? 'O link contém dados privados inválidos e foi bloqueado antes do compartilhamento.'
                  : organizerAccessCount === 0
                  ? 'Este aparelho não tem controles de organizador salvos para incluir.'
                  : `O link inclui os controles de organizador de ${organizerAccessCount} Bora${organizerAccessCount === 1 ? '' : 's'}. Eles não serão omitidos ao copiar ou compartilhar.`}</p>
                {linkDetails?.invalidFragment && <p className="recovery-qr-warning" role="alert">Não foi possível verificar todos os dados privados deste link. Não use este link: corrija os controles salvos neste aparelho e crie outro.</p>}

                {!linkDetails?.invalidFragment && <div className="recovery-qr-region" aria-live="polite" aria-busy={qrStatus === 'loading'}>
                  {qrStatus === 'loading' && <p role="status"><IonSpinner aria-hidden="true" /> Gerando QR code…</p>}
                  {qrStatus === 'ready' && qrCode && <>
                    <img className="recovery-qr-code" src={qrCode} alt={qrScope === 'complete' ? 'QR code do link completo para abrir seus Boras em outro dispositivo' : 'QR code sem controles de organizador para abrir seus Boras em outro dispositivo'} />
                    {qrScope === 'participant-only' && <p className="recovery-qr-warning" role="note">Este QR alternativo recupera sua lista e seu nome, mas não transfere controles de organizador. O link completo abaixo continua preservado.</p>}
                  </>}
                  {qrStatus === 'error' && <div className="recovery-qr-fallback" role="status">
                    <p>Não foi possível transformar {qrScope === 'complete' ? 'o link completo' : 'o link alternativo'} em QR code. O link completo continua disponível para copiar, compartilhar ou selecionar manualmente.</p>
                    <div className="recovery-link-actions">
                      <IonButton fill="outline" onClick={retryQr}>Tentar QR novamente</IonButton>
                      {qrScope === 'complete' && organizerAccessCount > 0 && <IonButton fill="outline" color="warning" onClick={useParticipantOnlyQr}>Gerar QR sem controles de organizador</IonButton>}
                    </div>
                    {qrScope === 'complete' && organizerAccessCount > 0 && <p className="recovery-qr-warning">A opção sem controles é uma escolha explícita: ela não altera o link completo e não transfere a capacidade de editar ou excluir os Boras que você organizou.</p>}
                  </div>}
                </div>}

                <div className="recovery-link-actions"><IonButton onClick={() => void shareLink()} disabled={Boolean(linkDetails?.invalidFragment)}>Compartilhar link completo</IonButton><IonButton fill="outline" onClick={() => void copyLink()} disabled={Boolean(linkDetails?.invalidFragment)}>Copiar link completo</IonButton></div>
                <details className="recovery-manual-link" open={copyFallback || qrStatus === 'error'}>
                  <summary>Selecionar o link completo manualmente</summary>
                  <p>O trecho depois de # contém dados privados e permanece no texto abaixo. Selecione tudo, inclusive esse trecho.</p>
                  <IonTextarea ref={manualLinkRef} value={link} aria-label="Link completo de recuperação" readonly autoGrow rows={5} />
                </details>
              </section>}
            </>}
          </IonCardContent></IonCard>
        </main>
      </IonContent>
    </IonPage>
  );
}
