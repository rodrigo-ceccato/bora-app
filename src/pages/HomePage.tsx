import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, useIonViewWillEnter } from '@ionic/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useHistory } from 'react-router-dom';
import { calendarOutline, chatbubbleEllipsesOutline, checkmarkCircleOutline, chevronForwardOutline, closeOutline, createOutline, peopleOutline, ribbonOutline } from 'ionicons/icons';
import { getParticipantName, listAdminEvents, listHomeActivity, refreshParticipantProfile, updateActivityState } from '../lib/store';
import type { ActivityKind, HomeActivityGroup, HomeActivityItem } from '../lib/types';
import { upcomingActivityCopy } from '../lib/activity';

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
  { mode: 'agora', title: 'Bora Agora', description: 'Para sair hoje, proposta com horário fixo.' },
  { mode: 'mais-tarde', title: 'Bora essa semana', description: 'Escolha um dia, convidados votam no horário.' },
  { mode: 'marcar', title: 'Bora marcar', description: 'Proponha datas, convidados votam em dias e horários.' }
];

const activityIcons: Record<ActivityKind, string> = {
  votes: peopleOutline,
  messages: chatbubbleEllipsesOutline,
  event_changed: createOutline,
  final_selected: checkmarkCircleOutline,
  threshold_reached: ribbonOutline
};

export default function HomePage() {
  const [name, setName] = useState(getParticipantName);
  const [activityGroups, setActivityGroups] = useState<HomeActivityGroup[]>([]);
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [loadingAllActivity, setLoadingAllActivity] = useState(false);
  const history = useHistory();
  const adminTokens = new Map(listAdminEvents().map((event) => [event.slug, event.adminToken]));
  const activityRequestGeneration = useRef(0);
  const refreshActivity = useCallback(async () => {
    const requestGeneration = ++activityRequestGeneration.current;
    setLoadingAllActivity(false);
    try {
      const feed = await listHomeActivity();
      if (requestGeneration !== activityRequestGeneration.current) return;
      setActivityGroups(feed.items);
      setHasMoreActivity(feed.hasMore);
    } catch {
      if (requestGeneration !== activityRequestGeneration.current) return;
      setActivityGroups([]);
      setHasMoreActivity(false);
    }
  }, []);
  useEffect(() => {
    const updateName = () => setName(getParticipantName());
    window.addEventListener('bora:participant-name-updated', updateName);
    window.addEventListener('storage', updateName);
    return () => { window.removeEventListener('bora:participant-name-updated', updateName); window.removeEventListener('storage', updateName); };
  }, []);
  useIonViewWillEnter(() => { void refreshParticipantProfile(); void refreshActivity(); });
  const invalidateActivityRequests = () => {
    activityRequestGeneration.current += 1;
    setLoadingAllActivity(false);
  };
  const removeChildActivity = (groupId: string, activityId: string) => {
    setActivityGroups((current) => current.flatMap((group) => {
      if (group.id !== groupId) return [group];
      const activities = group.activities.filter((activity) => activity.id !== activityId);
      return activities.length > 0 || group.startsAt ? [{ ...group, activities }] : [];
    }));
  };
  const clearGroupActivities = (group: HomeActivityGroup) => {
    setActivityGroups((current) => current.flatMap((item) => {
      if (item.id !== group.id) return [item];
      return item.upcomingActivityKey ? [{ ...item, activities: [] }] : [];
    }));
  };
  const groupActivityKeys = (group: HomeActivityGroup) => group.activities.flatMap((activity) => activity.activityKeys);
  const openGroup = (group: HomeActivityGroup) => {
    const activityKeys = groupActivityKeys(group);
    const keysToRead = group.upcomingActivityKey ? [...activityKeys, group.upcomingActivityKey] : activityKeys;
    if (keysToRead.length > 0) {
      invalidateActivityRequests();
      clearGroupActivities(group);
      void updateActivityState(keysToRead, 'read').catch(() => void refreshActivity());
    }
    const adminToken = adminTokens.get(group.slug);
    history.push(`/e/${encodeURIComponent(group.slug)}${adminToken ? `?admin=${encodeURIComponent(adminToken)}` : ''}`);
  };
  const openActivity = (group: HomeActivityGroup, activity: HomeActivityItem) => {
    invalidateActivityRequests();
    clearGroupActivities(group);
    void updateActivityState(groupActivityKeys(group), 'read').catch(() => void refreshActivity());
    const anchor = activity.kind === 'messages' ? '#recados' : activity.kind === 'votes' ? '#respostas' : '';
    const adminToken = adminTokens.get(group.slug);
    history.push(`/e/${encodeURIComponent(group.slug)}${adminToken ? `?admin=${encodeURIComponent(adminToken)}` : ''}${anchor}`);
  };
  const dismissActivity = (group: HomeActivityGroup, activity: HomeActivityItem) => {
    invalidateActivityRequests();
    removeChildActivity(group.id, activity.id);
    void updateActivityState(activity.activityKeys, 'dismiss').catch(() => void refreshActivity());
  };
  const dismissGroup = (group: HomeActivityGroup) => {
    const activityKeys = groupActivityKeys(group);
    if (activityKeys.length === 0) return;
    invalidateActivityRequests();
    clearGroupActivities(group);
    void updateActivityState(activityKeys, 'dismiss').catch(() => void refreshActivity());
  };
  const showAllActivity = async () => {
    const requestGeneration = ++activityRequestGeneration.current;
    setLoadingAllActivity(true);
    try {
      const feed = await listHomeActivity(true);
      if (requestGeneration !== activityRequestGeneration.current) return;
      setActivityGroups(feed.items);
      setHasMoreActivity(feed.hasMore);
    } catch {
      // Keep the current preview available if the expanded request fails.
    } finally {
      if (requestGeneration === activityRequestGeneration.current) setLoadingAllActivity(false);
    }
  };
  const firstName = name.trim().split(/\s+/)[0] || '';
  const title = firstName ? `Bora, ${firstName}?` : 'Bora?';
  return <IonPage>
    <IonHeader>
      <IonToolbar className="home-toolbar">
        <IonTitle className="home-toolbar-title" aria-label={title} title={title}>{title}</IonTitle>
        <IonButtons slot="end" className="home-toolbar-actions"><IonButton fill="clear" className="toolbar-secondary-action" routerLink="/my-events" aria-label="Meus Boras"><IonIcon icon={calendarOutline} aria-hidden="true" /><span>Meus Boras</span></IonButton></IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent className="ion-padding hero-bg">
      <section className="hero">
        <span className="hero-kicker">Combine sem complicação</span>
        <div className="hero-title-row">
          <h1>Bora marcar?</h1>
          <img className="bora-share-symbol" src="/bora-share-hero.svg" alt="Símbolo de compartilhamento Bora" />
        </div>
        <p>Crie um convite, envie o link e faça o rolê acontecer. Ninguém precisa criar conta para participar.</p>
        <nav className="home-mode-actions" aria-label="Escolha o tipo de Bora">
          {actions.map((action) => <IonButton key={action.mode} fill="clear" routerLink={`/create?mode=${action.mode}`} className="home-mode-card">
            <ModeIcon mode={action.mode} />
            <span className="mode-card-copy"><strong>{action.title}</strong><small>{action.description}</small></span>
            <span className="mode-card-arrow" aria-hidden="true">→</span>
          </IonButton>)}
        </nav>
      </section>
      <section className="home-activity" aria-labelledby="home-activity-title">
        <div className="home-activity-heading">
          <h2 id="home-activity-title">Novidades</h2>
          {hasMoreActivity && <IonButton fill="clear" size="small" className="home-activity-all" disabled={loadingAllActivity} onClick={() => void showAllActivity()}>{loadingAllActivity ? 'Carregando…' : 'Ver todas'}</IonButton>}
        </div>
        {activityGroups.length === 0 ? <p className="home-activity-empty">Nada novo por aqui.</p> : (
          <div className="home-activity-list">
            {activityGroups.map((group) => {
              const upcomingCopy = group.startsAt ? upcomingActivityCopy(group.startsAt) : undefined;
              return <article className="home-activity-group" key={group.id}>
                <div className="home-activity-event-row">
                  <button type="button" className="home-activity-event" onClick={() => openGroup(group)} aria-label={`Abrir ${group.eventName}`}>
                    <IonIcon icon={calendarOutline} aria-hidden="true" className="home-activity-event-icon" />
                    <span className="home-activity-event-copy">
                      {upcomingCopy && <strong>{upcomingCopy.primaryMessage}</strong>}
                      <span>{group.eventName}</span>
                      {upcomingCopy?.secondaryMessage && <small>{upcomingCopy.secondaryMessage}</small>}
                    </span>
                    <IonIcon icon={chevronForwardOutline} aria-hidden="true" className="home-activity-chevron" />
                  </button>
                  {group.isPast && group.activities.length > 0 && <button type="button" className="home-activity-dismiss home-activity-event-dismiss" aria-label={`Dispensar Bora ${group.eventName}`} onClick={() => dismissGroup(group)}>
                    <IonIcon icon={closeOutline} aria-hidden="true" />
                  </button>}
                </div>
                {group.activities.length > 0 && <div className="home-activity-children" aria-label={`Atividades de ${group.eventName}`}>
                  {group.activities.map((activity) => <div className="home-activity-child" key={activity.id}>
                    <button type="button" className="home-activity-child-open" onClick={() => openActivity(group, activity)} aria-label={`${activity.primaryMessage} em ${group.eventName}`}>
                      <IonIcon icon={activityIcons[activity.kind]} aria-hidden="true" />
                      <span>{activity.primaryMessage}</span>
                    </button>
                    <button type="button" className="home-activity-dismiss" aria-label={`Dispensar ${activity.primaryMessage} de ${group.eventName}`} onClick={() => dismissActivity(group, activity)}>
                      <IonIcon icon={closeOutline} aria-hidden="true" />
                    </button>
                  </div>)}
                </div>}
              </article>;
            })}
          </div>
        )}
      </section>
    </IonContent>
  </IonPage>;
}
