import { useEffect, useId, useRef, useState } from "react";
import "./ui.css";

export type SelectOption<T extends string = string> = { value: T; label: string };

type SelectProps<T extends string = string> = {
  label?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  "aria-label"?: string;
  className?: string;
};

/** Liste déroulante glassmorphism — single-select, réutilisable dans les apps X OS. */
export function Select<T extends string = string>({
  label,
  value,
  options,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`xos-select ${open ? "xos-select--open" : ""} ${className}`.trim()} ref={rootRef}>
      {label && <span className="xos-select__label">{label}</span>}
      <button
        type="button"
        className="xos-select__trigger"
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || "—"}</span>
        <span className="xos-select__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className="xos-select__menu" role="listbox" aria-label={ariaLabel || label}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`xos-select__option${active ? " xos-select__option--active" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
