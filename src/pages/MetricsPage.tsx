import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Metrics = {
  onlineNow: number;
  totalEvents: number;
  openEvents: number;
  uniqueParticipants: number;
  onlineWindowMinutes: number;
  generatedAt: string;
};

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export default function MetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const dataRef = useRef<Metrics | null>(null);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setUnavailable(false);
    try {
      const response = await fetch(`${API_BASE}/metrics`);
      if (!response.ok) throw new Error();
      const next = await response.json() as Metrics;
      dataRef.current = next;
      setData(next);
      setStale(false);
    } catch {
      if (dataRef.current) setStale(true);
      else setUnavailable(true);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots ? robots.getAttribute('content') : null;
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.append(robots);
    }
    robots.setAttribute('content', 'noindex, nofollow');
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearInterval(timer);
      if (createdRobots) robots?.remove();
      else if (previousRobots === null) robots?.removeAttribute('content');
      else robots?.setAttribute('content', previousRobots);
    };
  }, [refresh]);

  const online = data ? (data.onlineNow > 0 && data.onlineNow < 5 ? 'Menos de 5' : String(data.onlineNow)) : '—';
  return (
    <IonPage>
      <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" text="Voltar" /></IonButtons><IonTitle>Métricas</IonTitle></IonToolbar></IonHeader>
      <IonContent className="ion-padding form-page">
        <main className="metrics-container">
          <h1>Métricas</h1>
          <p>Resumo anônimo do uso do Bora.</p>
          {loading && !data && <div className="center"><IonSpinner /><p>Carregando…</p></div>}
          {unavailable && <p role="alert">Métricas indisponíveis no momento.</p>}
          {data && <>
            <table className="metrics-table"><tbody>
              <tr><th>Online nos últimos 5 minutos</th><td>{online}</td></tr>
              <tr><th>Total de Boras</th><td>{data.totalEvents}</td></tr>
              <tr><th>Boras recebendo respostas</th><td>{data.openEvents}</td></tr>
              <tr><th>Participantes únicos <span title="Estimativa baseada nas identidades anônimas deste navegador. Uma pessoa pode aparecer mais de uma vez ao usar navegadores diferentes." aria-label="Estimativa baseada nas identidades anônimas deste navegador. Uma pessoa pode aparecer mais de uma vez ao usar navegadores diferentes.">ⓘ</span></th><td>{data.uniqueParticipants}</td></tr>
            </tbody></table>
            <p className="muted">Atualizado: {new Date(data.generatedAt).toLocaleString('pt-BR')}{stale ? ' — dados possivelmente desatualizados.' : ''}</p>
          </>}
          <IonButton fill="outline" onClick={() => void refresh()} disabled={loading}>Atualizar</IonButton>
        </main>
      </IonContent>
    </IonPage>
  );
}
