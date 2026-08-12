/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AdaptiveTimePicker } from '../../src/components/AdaptiveTimePicker';

let fine = true;
const listeners = new Set<() => void>();

Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({
  get matches() { return fine; },
  addEventListener: (_: string, listener: () => void) => listeners.add(listener),
  removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
})) });

afterEach(() => { cleanup(); fine = true; listeners.clear(); });

function Picker({ initial = '14:30', confirm = vi.fn() }: { initial?: string; confirm?: () => void }) {
  const [value, setValue] = useState(initial);
  return <AdaptiveTimePicker value={value} onChange={setValue} onConfirm={confirm} />;
}

describe('AdaptiveTimePicker', () => {
  it('keeps the Ionic wheel for a coarse primary pointer', () => {
    fine = false;
    const { container } = render(<Picker />);
    expect(container.querySelector('ion-datetime')).toBeTruthy();
  });

  it('uses a compact desktop picker for a fine pointer and accepts exact 24-hour input', () => {
    render(<Picker />);
    const input = screen.getByRole('textbox', { name: 'Horário do Bora' });
    fireEvent.change(input, { target: { value: '23:57' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('23:57');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: '+15 min' })).toBeTruthy();
  });

  it('selects the whole value when the desktop field is clicked', () => {
    render(<Picker initial="10:50" />);
    const input = screen.getByRole('textbox', { name: 'Horário do Bora' }) as HTMLInputElement;
    fireEvent.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  it('uses quarter-hour rounding for keyboard adjustment and wraps across midnight', () => {
    const confirm = vi.fn();
    render(<Picker initial="23:50" confirm={confirm} />);
    const input = screen.getByRole('textbox', { name: 'Horário do Bora' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect((input as HTMLInputElement).value).toBe('00:00');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('only reacts to mouse wheel while its field has focus', () => {
    render(<><button>Fora</button><Picker initial="13:33" /></>);
    const input = screen.getByRole('textbox', { name: 'Horário do Bora' });
    const outside = screen.getByRole('button', { name: 'Fora' });
    outside.focus();
    fireEvent.wheel(input, { deltaY: -1 });
    expect((input as HTMLInputElement).value).toBe('13:33');
    input.focus();
    fireEvent.wheel(input, { deltaY: -1 });
    expect((input as HTMLInputElement).value).toBe('13:45');
  });

  it('rounds explicit step buttons to the next or previous quarter hour', () => {
    render(<Picker initial="13:33" />);
    const input = screen.getByRole('textbox', { name: 'Horário do Bora' }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '-15 min' }));
    expect(input.value).toBe('13:30');
    fireEvent.click(screen.getByRole('button', { name: '+15 min' }));
    expect(input.value).toBe('13:45');
  });

  it('offers relative actions separately from the selected time', () => {
    const onRelative = vi.fn();
    render(<AdaptiveTimePicker value="13:33" onChange={vi.fn()} onRelative={onRelative} />);
    fireEvent.click(screen.getByRole('button', { name: 'Daqui 2h' }));
    expect(onRelative).toHaveBeenCalledWith(2);
    expect(screen.getByText(/“Daqui” usa a hora atual/)).toBeTruthy();
  });

  it('switches pointer capability without losing the selected time', () => {
    const { container } = render(<Picker initial="23:57" />);
    fine = false;
    act(() => listeners.forEach((listener) => listener()));
    expect(container.querySelector('ion-datetime')?.getAttribute('value')).toBe('2000-01-01T23:57:00');
    fine = true;
    act(() => listeners.forEach((listener) => listener()));
    expect((screen.getByRole('textbox', { name: 'Horário do Bora' }) as HTMLInputElement).value).toBe('23:57');
  });
});
