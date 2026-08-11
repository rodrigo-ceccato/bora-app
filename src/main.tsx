import React, { Component, Suspense, createRef, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp, IonButton, IonContent, IonPage, IonRouterOutlet, IonSpinner, setupIonicReact, useIonToast } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const CreatePage = lazy(() => import('./pages/CreatePage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const MyEventsPage = lazy(() => import('./pages/MyEventsPage'));
const PastEventsPage = lazy(() => import('./pages/PastEventsPage'));
const RecoverPage = lazy(() => import('./pages/RecoverPage'));
const MetricsPage = lazy(() => import('./pages/MetricsPage'));
import { startPresence } from './lib/presence';
import { startParticipantProfileSync } from './lib/store';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import './styles.css';

setupIonicReact({ backButtonText: 'Voltar' });
document.documentElement.lang = 'pt-BR';

function PageLoader() {
  return <IonPage><IonContent className="ion-padding center"><IonSpinner /><p>Carregando...</p></IonContent></IonPage>;
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function ParticipantProfileSyncNotice() {
  const [toast] = useIonToast();
  useEffect(() => {
    const warn = () => toast({ message: 'Nome salvo neste aparelho. Vamos sincronizar quando houver conexão.', color: 'warning', duration: 3600 });
    window.addEventListener('bora:participant-name-sync-failed', warn);
    return () => window.removeEventListener('bora:participant-name-sync-failed', warn);
  }, [toast]);
  return null;
}

function NotFoundPage() {
  return (
    <IonPage>
      <IonContent className="ion-padding center">
        <main>
          <h1>Página não encontrada</h1>
          <p>Confira o endereço ou volte para o início.</p>
          <IonButton routerLink="/home">Voltar para o início</IonButton>
        </main>
      </IonContent>
    </IonPage>
  );
}

type AppErrorBoundaryProps = {
  children: ReactNode;
  onReload?: () => void;
};

type AppErrorBoundaryState = {
  error: Error | null;
  retryKey: number;
};

/**
 * Covers route render failures and rejected React.lazy imports. A local retry
 * can recover transient render errors; reload remains available for a stale or
 * missing deployment chunk that the browser module cache cannot retry safely.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, retryKey: 0 };
  private readonly headingRef = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bora route rendering failed.', error, info.componentStack);
    window.requestAnimationFrame(() => this.headingRef.current?.focus());
  }

  private retry = () => {
    this.setState((current) => ({ error: null, retryKey: current.retryKey + 1 }));
  };

  private reload = () => {
    if (this.props.onReload) this.props.onReload();
    else window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <IonPage>
          <IonContent className="ion-padding center app-error-page">
            <main role="alert" aria-labelledby="app-error-title">
              <h1 id="app-error-title" ref={this.headingRef} tabIndex={-1}>Não foi possível abrir esta tela</h1>
              <p>Uma parte do Bora não carregou. Tente novamente; se o app acabou de ser atualizado, recarregue a página.</p>
              <div className="app-error-actions">
                <IonButton onClick={this.retry}>Tentar novamente</IonButton>
                <IonButton fill="outline" onClick={this.reload}>Recarregar o app</IonButton>
              </div>
            </main>
          </IonContent>
        </IonPage>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

function App() {
  return (
    <IonApp>
      <ParticipantProfileSyncNotice />
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/home" render={() => <LazyPage><HomePage /></LazyPage>} />
          <Route exact path="/create" render={() => <LazyPage><CreatePage /></LazyPage>} />
          <Route exact path="/e/:slug" render={() => <LazyPage><EventPage /></LazyPage>} />
          <Route exact path="/my-events" render={() => <LazyPage><MyEventsPage /></LazyPage>} />
          <Route exact path="/past-events" render={() => <LazyPage><PastEventsPage /></LazyPage>} />
          <Route exact path="/recover" render={() => <LazyPage><RecoverPage /></LazyPage>} />
          <Route exact path="/metrics" render={() => <LazyPage><MetricsPage /></LazyPage>} />
          <Route exact path="/">
            <Redirect to="/home" />
          </Route>
          <Route render={() => <NotFoundPage />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const stopPresence = startPresence();
  const stopParticipantProfileSync = startParticipantProfileSync();
  window.addEventListener('pagehide', stopPresence, { once: true });
  window.addEventListener('pagehide', stopParticipantProfileSync, { once: true });
  createRoot(rootElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
