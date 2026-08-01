import { useEffect, useRef, useState, useId } from 'react';
import './ui.css';

// ponytail: styling lives in calls.css (.calls-timepicker*) — mirrors the DatePicker
// convention, left in place pending the shared design-token consolidation (Lot 1).

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 4 }, (_, i) => i * 15); // 00, 15, 30, 45

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseHHMM(value: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { h: 9, m: 0 };
  return {
    h: Math.min(23, parseInt(match[1], 10)),
    m: Math.min(59, parseInt(match[2], 10)),
  };
}

/** Time picker custom (colonnes heures / minutes, pas de 15 min). */
export function TimePicker({
  label = 'Heure',
  value,
  onChange,
  id,
  triggerClassName,
  defaultOpen = false,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  id?: string;
  /** Classes CSS du bouton trigger (ex. même style que les inputs). */
  triggerClassName?: string;
  /** Ouvre le popover au montage. */
  defaultOpen?: boolean;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  const current = parseHHMM(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emit = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  const triggerClasses = [
    'calls-input',
    'calls-timepicker__trigger',
    triggerClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="calls-field calls-timepicker" ref={rootRef}>
      <span id={`${fieldId}-label`}>{label}</span>
      <button
        type="button"
        id={fieldId}
        className={triggerClasses}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        aria-labelledby={`${fieldId}-label`}
        onClick={() => setOpen((v) => !v)}
      >
        {value || 'Choisir une heure'}
      </button>
      {open && (
        <div
          className="calls-timepicker__popover"
          role="dialog"
          aria-label={label}
        >
          <div className="calls-timepicker__columns">
            <div
              className="calls-timepicker__column"
              role="listbox"
              aria-label="Heures"
            >
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="option"
                  aria-selected={h === current.h}
                  className={`calls-timepicker__cell${h === current.h ? ' calls-timepicker__cell--selected' : ''}`}
                  onClick={() => emit(h, current.m)}
                >
                  {pad(h)}
                </button>
              ))}
            </div>
            <div
              className="calls-timepicker__column"
              role="listbox"
              aria-label="Minutes"
            >
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === current.m}
                  className={`calls-timepicker__cell${m === current.m ? ' calls-timepicker__cell--selected' : ''}`}
                  onClick={() => emit(current.h, m)}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
