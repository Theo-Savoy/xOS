import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from 'recharts';
import { GlassCard, Tag } from '../../../components/ui';
import type { ScopeKind } from '../review.types';
import { ScopeTag } from './ScopeTag';

type TooltipEntry = {
  dataKey?: unknown;
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};

type DeltaKeys = Record<string, string>;

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
  scope,
  source,
  compareLabel,
  deltaKeys,
  valueFormatter,
  deltaFormatter,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly TooltipEntry[];
  scope: ScopeKind;
  source: string;
  compareLabel?: string;
  deltaKeys?: DeltaKeys;
  valueFormatter: (value: number) => string;
  deltaFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <GlassCard className="review-chart-tooltip" role="status">
      <div className="review-chart-tooltip__header">
        <strong>{label}</strong>
        <ScopeTag scope={scope} />
      </div>
      <div className="review-chart-tooltip__metrics">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? 'metric');
          const deltaKey = deltaKeys?.[key];
          const rawDelta = deltaKey ? entry.payload?.[deltaKey] : undefined;
          const delta = typeof rawDelta === 'number' ? rawDelta : null;
          return (
            <div key={key} className="review-chart-tooltip__metric">
              <span className="review-chart-tooltip__label">
                <i style={{ background: entry.color }} aria-hidden="true" />
                {entry.name ?? key}
              </span>
              <strong>{valueFormatter(Number(entry.value) || 0)}</strong>
              {delta !== null && deltaFormatter && compareLabel ? (
                <span className="review-chart-tooltip__delta">
                  {deltaFormatter(delta)} vs {compareLabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <Tag variant="muted" className="review-chart-tooltip__source">
        {source}
      </Tag>
    </GlassCard>
  );
}
