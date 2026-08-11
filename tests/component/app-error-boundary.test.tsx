/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense, lazy } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../../src/main';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('offers a retry and restores the failed route without exposing error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    function TransientRoute() {
      if (fail) throw new Error('private chunk URL and diagnostics');
      return <p>Tela recuperada</p>;
    }

    render(<AppErrorBoundary><TransientRoute /></AppErrorBoundary>);
    const heading = await screen.findByRole('heading', { name: 'Não foi possível abrir esta tela' });
    expect(screen.queryByText(/private chunk URL/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));

    fail = false;
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(await screen.findByText('Tela recuperada')).toBeTruthy();
  });

  it('provides an explicit reload action for a cached lazy-chunk failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReload = vi.fn();
    const loadChunk = vi.fn(async () => { throw new Error('ChunkLoadError'); });
    const BrokenLazyRoute = lazy(loadChunk);

    render(
      <AppErrorBoundary onReload={onReload}>
        <Suspense fallback={<p>Carregando rota</p>}><BrokenLazyRoute /></Suspense>
      </AppErrorBoundary>
    );
    await screen.findByRole('heading', { name: 'Não foi possível abrir esta tela' });
    fireEvent.click(screen.getByText('Tentar novamente'));
    await screen.findByRole('heading', { name: 'Não foi possível abrir esta tela' });
    expect(loadChunk).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByText('Recarregar o app'));
    expect(onReload).toHaveBeenCalledOnce();
  });
});
