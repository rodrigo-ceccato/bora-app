import { IonDatetime } from '@ionic/react';
import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';

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

export function AdaptiveTimePicker({ value, date, onChange, onConfirm, onRelative, label = 'Horário do Bora' }: {
  value: string;
  date?: string;
  onChange: (time: string) => void;
  onConfirm?: () => void;
  onRelative?: (hours: number) => void;
  label?: string;
}) {
  const finePointer = useFinePointer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!finePointer) return;
    inputRef.current?.focus();
  }, [finePointer]);

  function commit(next: string) {
    if (!validTime(next)) return false;
    setDraft(next);
    onChange(next);
    return true;
  }

  function adjust(direction: 1 | -1) {
    const source = validTime(draft) ? draft : value;
    const minutes = minutesFor(source);
    const quarter = direction === 1 ? Math.ceil(minutes / 15) * 15 : Math.floor(minutes / 15) * 15;
    commit(timeFor(quarter === minutes ? quarter + direction * 15 : quarter));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') { event.preventDefault(); adjust(1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); adjust(-1); }
    else if (event.key === 'Enter' && commit(draft)) { event.preventDefault(); onConfirm?.(); }
    else if (event.key === 'Escape') { event.preventDefault(); setDraft(value); onConfirm?.(); }
  }

  function onWheel(event: WheelEvent<HTMLInputElement>) {
    if (document.activeElement !== event.currentTarget) return;
    event.preventDefault();
    adjust(event.deltaY < 0 ? 1 : -1);
  }

  if (!finePointer) {
    return <IonDatetime presentation="time" hourCycle="h23" value={pickerValue(date, value)} aria-label={label} onIonChange={(event) => {
      const next = typeof event.detail.value === 'string' ? event.detail.value.match(/T(\d{2}:\d{2})/)?.[1] : undefined;
      if (next) onChange(next);
    }} />;
  }

  return <div className="desktop-time-picker desktop-time-picker-content" aria-label={label}>
    <label htmlFor="desktop-time-input">Horário</label>
    <div className="desktop-time-input-wrap">
      <input ref={inputRef} id="desktop-time-input" value={draft} inputMode="numeric" placeholder="HH:MM" aria-label={label} aria-describedby="desktop-time-help" onClick={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (!commit(draft)) setDraft(value); }} onKeyDown={onKeyDown} onWheel={onWheel} />
    </div>
    <p id="desktop-time-help">Digite o horário ou use os ajustes rápidos. “Daqui” usa a hora atual.</p>
    <div className="desktop-time-adjustments" role="group" aria-label="Ajustes de 15 minutos"><button type="button" onClick={() => adjust(-1)}>-15 min</button><button type="button" onClick={() => adjust(1)}>+15 min</button></div>
    {onRelative && <div className="desktop-time-relative" role="group" aria-label="Horários relativos">{[1, 2, 3].map((hours) => <button key={hours} type="button" onClick={() => onRelative(hours)}>Daqui {hours}h</button>)}</div>}
  </div>;
}
