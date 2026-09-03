import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from 'recharts';
import { GlassCard } from '../../../components/ui';
import type { ScopeKind } from '../review.types';

type TooltipEntry = {
  dataKey?: unknown;
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};
const TOOLTIP_CHROME = {
  cursor: {
    fill: 'color-mix(in srgb, var(--xos-accent) 12%, transparent)',
  },
  wrapperStyle: {
    outline: 'none',
    zIndex: 20,
    pointerEvents: 'none' as const,
  },
  contentStyle: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    boxShadow: 'none',
  },
};

/** Tooltip Recharts sans cadre blanc : le contenu visuel reste ChartTooltip. */
export function ReviewChartTooltip(props: ComponentProps<typeof Tooltip>) {
  return <Tooltip {...TOOLTIP_CHROME} {...props} />;
}

export function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly TooltipEntry[];
  scope?: ScopeKind;
  source?: string;
  compareLabel?: string;
  deltaKeys?: Record<string, string>;
  valueFormatter: (value: number) => string;
  deltaFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <GlassCard className="review-chart-tooltip" role="status">
      <div className="review-chart-tooltip__header">
        <strong>{label}</strong>
      </div>
      <div className="review-chart-tooltip__metrics">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? 'metric');
          return (
            <div key={key} className="review-chart-tooltip__metric">
              <span className="review-chart-tooltip__label">
                <i style={{ background: entry.color }} aria-hidden="true" />
                {entry.name ?? key}
              </span>
              <strong>{valueFormatter(Number(entry.value) || 0)}</strong>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
