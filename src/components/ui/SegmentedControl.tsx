import "./ui.css";

// ponytail: styling still lives in calls.css (.calls-fb-control/.calls-chip*) —
// shared with other calls form controls not yet promoted, so left in place for now.

/** Multi-select chip group — OU logic, visible selection state. */
export function SegmentedControl<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  const toggle = (v: T) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="calls-fb-control">
      <div className="calls-fb-control__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
        {value.length > 1 && <span className="calls-fb-or">OU</span>}
      </div>
      <div className="calls-chip-row">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`calls-chip${value.includes(opt.value) ? " calls-chip--active" : ""}`}
            onClick={() => toggle(opt.value)}
            aria-pressed={value.includes(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
