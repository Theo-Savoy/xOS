import { Button } from '../../../components/ui';
import {
  FY_OPTIONS,
  comparisonFy,
  fyIntFromLabel,
  periodRangeLabel,
  type PeriodSelection,
  type ReviewPeriodMode,
  type ReviewSemester,
} from '../review.period';

export type { PeriodSelection } from '../review.period';

const MODES: { value: ReviewPeriodMode; label: string }[] = [
  { value: 'fy', label: 'FY' },
  { value: 'semester', label: 'Semestre' },
];

const SEMESTERS: ReviewSemester[] = ['S1', 'S2'];

export function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodSelection;
  onChange: (value: PeriodSelection) => void;
}) {
  const currentFyInt = fyIntFromLabel(value.fy);
  const compareOptions = FY_OPTIONS.filter((opt) => {
    const intVal = fyIntFromLabel(opt.value);
    return intVal < currentFyInt && intVal >= 22;
  });
  const currentCompare =
    value.compare &&
    fyIntFromLabel(value.compare) < currentFyInt &&
    fyIntFromLabel(value.compare) >= 22
      ? value.compare
      : comparisonFy(value.fy);

  return (
    <div
      className="review-period-selector"
      aria-label={`Période d’analyse · ${periodRangeLabel(value)}`}
    >
      <div
        className="review-period-switch"
        role="group"
        aria-label="Granularité"
        style={{
          '--options-count': MODES.length,
          '--active-index': MODES.findIndex((m) => m.value === value.mode),
        } as React.CSSProperties}
      >
        {MODES.map((mode) => (
          <Button
            key={mode.value}
            type="button"
            variant="ghost"
            size="sm"
            className={
              value.mode === mode.value ? 'review-period-button--active' : ''
            }
            aria-pressed={value.mode === mode.value}
            onClick={() => onChange({ ...value, mode: mode.value })}
          >
            {mode.label}
          </Button>
        ))}
      </div>
      <div
        className="review-period-switch"
        role="group"
        aria-label="Exercice"
        style={{
          '--options-count': FY_OPTIONS.length,
          '--active-index': FY_OPTIONS.findIndex((o) => o.value === value.fy),
        } as React.CSSProperties}
      >
        {FY_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            className={
              value.fy === opt.value ? 'review-period-button--active' : ''
            }
            aria-pressed={value.fy === opt.value}
            onClick={() => {
              const fy = opt.value;
              const newFyInt = fyIntFromLabel(fy);
              const nextCompare =
                value.compare &&
                fyIntFromLabel(value.compare) < newFyInt &&
                fyIntFromLabel(value.compare) >= 22
                  ? value.compare
                  : comparisonFy(fy);
              onChange({ ...value, fy, compare: nextCompare });
            }}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {compareOptions.length > 0 ? (
        <div
          className="review-period-switch"
          role="group"
          aria-label="Comparer avec"
          style={{
            '--options-count': compareOptions.length,
            '--active-index': compareOptions.findIndex(
              (o) => o.value === currentCompare
            ),
          } as React.CSSProperties}
        >
          {compareOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant="ghost"
              size="sm"
              className={
                currentCompare === opt.value
                  ? 'review-period-button--active'
                  : ''
              }
              aria-pressed={currentCompare === opt.value}
              onClick={() => onChange({ ...value, compare: opt.value })}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ) : null}
      {value.mode === 'semester' ? (
        <div
          className="review-period-switch"
          role="group"
          aria-label="Semestre"
          style={{
            '--options-count': SEMESTERS.length,
            '--active-index': SEMESTERS.findIndex((s) => s === value.semester),
          } as React.CSSProperties}
        >
          {SEMESTERS.map((semester) => (
            <Button
              key={semester}
              type="button"
              variant="ghost"
              size="sm"
              className={
                value.semester === semester
                  ? 'review-period-button--active'
                  : ''
              }
              aria-pressed={value.semester === semester}
              onClick={() => onChange({ ...value, semester })}
            >
              {semester}
            </Button>
          ))}
        </div>
      ) : null}
      <span className="review-period-range">{periodRangeLabel(value)}</span>
    </div>
  );
}
