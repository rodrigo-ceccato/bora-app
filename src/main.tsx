import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp, IonContent, IonPage, IonRouterOutlet, IonSpinner, setupIonicReact } from '@ionic/react';
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

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import './styles.css';

setupIonicReact();

function PageLoader() {
  return <IonPage><IonContent className="ion-padding center"><IonSpinner /><p>Carregando...</p></IonContent></IonPage>;
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function App() {
  return (
    <IonApp>
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
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}

const stopPresence = startPresence();
window.addEventListener('pagehide', stopPresence, { once: true });
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
