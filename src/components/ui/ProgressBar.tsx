import "./ui.css";

type ProgressBarProps = {
  called: number;
  total: number;
  label?: string;
};

export function ProgressBar({ called, total, label }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((called / total) * 100) : 0;

  return (
    <div className="xos-progress" aria-label={label ?? `Progression ${called} sur ${total}`}>
      <div className="xos-progress__track">
        <div className="xos-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="xos-progress__label xos-numeric">
        {called}/{total}
      </span>
    </div>
  );
}
