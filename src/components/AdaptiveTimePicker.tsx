import { IonDatetime } from '@ionic/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';

const finePointerQuery = '(pointer: fine)';

function validTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutesFor(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeFor(minutes: number) {
  const normalized = (minutes + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function pickerValue(date: string | undefined, time: string) {
  return date ? `${date}T${time}:00` : `2000-01-01T${time}:00`;
}

function useFinePointer() {
  const [finePointer, setFinePointer] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(finePointerQuery).matches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(finePointerQuery);
    const update = () => setFinePointer(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return finePointer;
}

export function AdaptiveTimePicker({ value, date, onChange, onConfirm, label = 'Horário do Bora' }: {
  value: string;
  date?: string;
  onChange: (time: string) => void;
  onConfirm?: () => void;
  label?: string;
}) {
  const finePointer = useFinePointer();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(finePointer);

  const suggestions = useMemo(() => {
    const center = Math.round(minutesFor(validTime(draft) ? draft : value) / 15) * 15;
    const nearby = [-3, -2, -1, 0, 1, 2].map((offset) => timeFor(center + offset * 15));
    return validTime(value) && !nearby.includes(value) ? [...nearby, value].sort() : nearby;
  }, [draft, value]);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!finePointer) return;
    setOpen(true);
    inputRef.current?.focus();
  }, [finePointer]);

  useEffect(() => {
    if (!finePointer || !open) return;
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [finePointer, open, suggestions]);

  function commit(next: string) {
    if (!validTime(next)) return false;
    setDraft(next);
    onChange(next);
    return true;
  }

  function adjust(delta: number) {
    const source = validTime(draft) ? draft : value;
    commit(timeFor(minutesFor(source) + delta));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') { event.preventDefault(); adjust(15); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); adjust(-15); }
    else if (event.key === 'Enter' && commit(draft)) { event.preventDefault(); setOpen(false); onConfirm?.(); }
    else if (event.key === 'Escape') { event.preventDefault(); setDraft(value); setOpen(false); onConfirm?.(); }
  }

  function onWheel(event: WheelEvent<HTMLInputElement>) {
    if (document.activeElement !== event.currentTarget) return;
    event.preventDefault();
    adjust(event.deltaY < 0 ? 15 : -15);
  }

  if (!finePointer) {
    return <IonDatetime presentation="time" hourCycle="h23" value={pickerValue(date, value)} aria-label={label} onIonChange={(event) => {
      const next = typeof event.detail.value === 'string' ? event.detail.value.match(/T(\d{2}:\d{2})/)?.[1] : undefined;
      if (next) onChange(next);
    }} />;
  }

  return <div className="desktop-time-picker" aria-label={label}>
    <label htmlFor="desktop-time-input">Horário</label>
    <div className="desktop-time-input-wrap">
      <input ref={inputRef} id="desktop-time-input" value={draft} inputMode="numeric" placeholder="HH:MM" aria-label={label} aria-describedby="desktop-time-help" onFocus={() => setOpen(true)} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (!commit(draft)) setDraft(value); }} onKeyDown={onKeyDown} onWheel={onWheel} />
      <span aria-hidden="true">⌄</span>
    </div>
    <p id="desktop-time-help">Use ↑ ↓ ou a roda do mouse para ajustar 15 minutos.</p>
    {open && <div className="desktop-time-options" role="listbox" aria-label="Horários próximos">
      {suggestions.map((time) => <button ref={time === value ? selectedRef : undefined} key={time} type="button" role="option" aria-selected={time === value} className={time === value ? 'selected' : ''} onClick={() => { commit(time); setOpen(false); }}>{time}</button>)}
    </div>}
  </div>;
}
