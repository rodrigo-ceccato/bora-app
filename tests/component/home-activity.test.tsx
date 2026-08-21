/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DefaultIonLifeCycleContext, IonLifeCycleContext } from '@ionic/react';

const store = vi.hoisted(() => ({
  getParticipantName: vi.fn(() => ''),
  listAdminEvents: vi.fn(() => []),
  listHomeActivity: vi.fn(),
  refreshParticipantProfile: vi.fn(),
  updateActivityState: vi.fn(() => Promise.resolve())
}));

vi.mock('../../src/lib/store', () => store);

import HomePage from '../../src/pages/HomePage';

let currentPath = '';
function LocationObserver() {
  const location = useLocation();
  currentPath = `${location.pathname}${location.search}${location.hash}`;
  return null;
}

function renderHome() {
  const lifecycle = new DefaultIonLifeCycleContext();
  const result = render(
    <IonLifeCycleContext.Provider value={lifecycle}>
      <MemoryRouter initialEntries={['/home']}><LocationObserver /><HomePage /></MemoryRouter>
    </IonLifeCycleContext.Provider>
  );
  act(() => lifecycle.ionViewWillEnter());
  return { ...result, lifecycle };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const messageActivity = {
  id: 'messages:evt_1', activityKeys: ['activity:message_1'], kind: 'messages' as const,
  primaryMessage: '2 novos recados', occurredAt: '2026-08-18T15:00:00Z'
};

const responseActivity = {
  id: 'votes:evt_1', activityKeys: ['activity:vote_1'], kind: 'votes' as const,
  primaryMessage: '1 nova resposta', occurredAt: '2026-08-18T14:00:00Z'
};

const activityGroup = {
  id: 'evt_1',
  slug: 'almoco-aniversario', eventName: 'Almoço de Aniversário T-zinho',
  occurredAt: '2026-08-18T15:00:00Z', activities: [messageActivity, responseActivity]
};

beforeEach(() => {
  currentPath = '';
  store.listAdminEvents.mockReturnValue([]);
  store.listHomeActivity.mockResolvedValue({ items: [], hasMore: false });
  store.updateActivityState.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Novidades on Home', () => {
  it('loads activity once on initial view entry', async () => {
    renderHome();
    await waitFor(() => expect(store.listHomeActivity).toHaveBeenCalledTimes(1));
  });

  it('shows the minimal empty state', async () => {
    renderHome();
    expect(await screen.findByText('Novidades')).toBeTruthy();
    expect(await screen.findByText('Nada novo por aqui.')).toBeTruthy();
  });

  it('shows one upcoming Bora', async () => {
    store.listHomeActivity.mockResolvedValue({ items: [{
      id: 'evt_1', slug: 'cinema', eventName: 'Cinema amanhã', occurredAt: '2099-08-18T20:00:00Z',
      startsAt: '2099-08-18T20:00:00Z', upcomingActivityKey: 'upcoming:evt_1:1', activities: []
    }], hasMore: false });
    renderHome();
    expect(await screen.findByText('Cinema amanhã')).toBeTruthy();
  });

  it('keeps an upcoming Bora visible after opening it', async () => {
    const upcoming = {
      id: 'evt_1', slug: 'cinema', eventName: 'Cinema amanhã', occurredAt: '2099-08-18T20:00:00Z',
      startsAt: '2099-08-18T20:00:00Z', upcomingActivityKey: 'upcoming:evt_1:1', activities: []
    };
    store.listHomeActivity.mockResolvedValue({ items: [upcoming], hasMore: false });
    renderHome();
    const row = await screen.findByRole('button', { name: /Cinema amanhã/ });
    fireEvent.click(row);
    expect(currentPath).toBe('/e/cinema');
    expect(store.updateActivityState).toHaveBeenCalledWith(['upcoming:evt_1:1'], 'read');
    expect(screen.getByText('Cinema amanhã')).toBeTruthy();
  });

  it('loads and displays the omitted activity entries from Ver todas', async () => {
    const secondGroup = { ...activityGroup, id: 'evt_2', slug: 'jantar', eventName: 'Jantar' };
    store.listHomeActivity.mockImplementation((showAll = false) => Promise.resolve(showAll
      ? { items: [activityGroup, secondGroup], hasMore: false }
      : { items: [activityGroup], hasMore: true }));
    renderHome();
    fireEvent.click(await screen.findByText('Ver todas'));
    expect(await screen.findByText('Jantar')).toBeTruthy();
    expect(store.listHomeActivity).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText('Ver todas')).toBeNull();
  });

  it('keeps expanded activity when an earlier preview refresh resolves late', async () => {
    const secondGroup = { ...activityGroup, id: 'evt_2', slug: 'jantar', eventName: 'Jantar' };
    const slowPreview = deferred<{ items: typeof activityGroup[]; hasMore: boolean }>();
    let previewRequests = 0;
    store.listHomeActivity.mockImplementation((showAll = false) => {
      if (showAll) return Promise.resolve({ items: [activityGroup, secondGroup], hasMore: false });
      previewRequests += 1;
      return previewRequests === 1
        ? Promise.resolve({ items: [activityGroup], hasMore: true })
        : slowPreview.promise;
    });
    const { lifecycle } = renderHome();
    await screen.findByText('Ver todas');

    act(() => lifecycle.ionViewWillEnter());
    fireEvent.click(screen.getByText('Ver todas'));
    expect(await screen.findByText('Jantar')).toBeTruthy();

    await act(async () => { slowPreview.resolve({ items: [activityGroup], hasMore: true }); await slowPreview.promise; });
    expect(screen.getByText('Jantar')).toBeTruthy();
    expect(screen.queryByText('Ver todas')).toBeNull();
  });

  it('opens Recados directly and marks the event activity group as read', async () => {
    store.listHomeActivity.mockResolvedValue({ items: [activityGroup], hasMore: false });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /2 novos recados em Almoço/ }));
    expect(currentPath).toBe('/e/almoco-aniversario#recados');
    expect(store.updateActivityState).toHaveBeenCalledWith(['activity:message_1', 'activity:vote_1'], 'read');
    expect(screen.queryByText('1 nova resposta')).toBeNull();
  });

  it('opens Respostas directly and clears the rest of the event activity group', async () => {
    store.listHomeActivity.mockResolvedValue({ items: [activityGroup], hasMore: false });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /1 nova resposta em Almoço/ }));
    expect(currentPath).toBe('/e/almoco-aniversario#respostas');
    expect(store.updateActivityState).toHaveBeenCalledWith(['activity:message_1', 'activity:vote_1'], 'read');
    expect(screen.queryByText('2 novos recados')).toBeNull();
  });

  it('offers a group dismissal for past Boras and dismisses every activity in it', async () => {
    store.listHomeActivity.mockResolvedValue({ items: [{ ...activityGroup, isPast: true }], hasMore: false });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Dispensar Bora Almoço/ }));
    expect(store.updateActivityState).toHaveBeenCalledWith(['activity:message_1', 'activity:vote_1'], 'dismiss');
    expect(screen.queryByText('Almoço de Aniversário T-zinho')).toBeNull();
  });

  it('preserves saved organizer access when opening activity links', async () => {
    store.listAdminEvents.mockReturnValue([{ slug: activityGroup.slug, title: activityGroup.eventName, adminToken: 'admin token' }]);
    store.listHomeActivity.mockResolvedValue({ items: [activityGroup], hasMore: false });
    const firstHome = renderHome();

    fireEvent.click(await screen.findByRole('button', { name: /Abrir Almoço/ }));
    expect(currentPath).toBe('/e/almoco-aniversario?admin=admin%20token');

    firstHome.unmount();
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /2 novos recados em Almoço/ }));
    expect(currentPath).toBe('/e/almoco-aniversario?admin=admin%20token#recados');
  });

  it('dismisses one child without navigating or removing unrelated activity', async () => {
    store.listHomeActivity.mockResolvedValue({ items: [activityGroup], hasMore: false });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Dispensar 2 novos recados/ }));
    expect(currentPath).toBe('/home');
    expect(store.updateActivityState).toHaveBeenCalledWith(['activity:message_1'], 'dismiss');
    await waitFor(() => expect(screen.queryByText('2 novos recados')).toBeNull());
    expect(screen.getByText('Almoço de Aniversário T-zinho')).toBeTruthy();
    expect(screen.getByText('1 nova resposta')).toBeTruthy();
  });

  it('does not restore dismissed activity from a stale refresh', async () => {
    const slowRefresh = deferred<{ items: typeof activityGroup[]; hasMore: boolean }>();
    let refreshes = 0;
    store.listHomeActivity.mockImplementation(() => {
      refreshes += 1;
      return refreshes === 1 ? Promise.resolve({ items: [activityGroup], hasMore: false }) : slowRefresh.promise;
    });
    const { lifecycle } = renderHome();
    await screen.findByText('2 novos recados');

    act(() => lifecycle.ionViewWillEnter());
    fireEvent.click(screen.getByRole('button', { name: /Dispensar 2 novos recados/ }));
    expect(screen.queryByText('2 novos recados')).toBeNull();

    await act(async () => { slowRefresh.resolve({ items: [activityGroup], hasMore: false }); await slowRefresh.promise; });
    expect(screen.queryByText('2 novos recados')).toBeNull();
  });
});
