import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtEur } from '../review.helpers';
import type { ScopeKind } from '../review.types';
import { ChartTooltip, ReviewChartTooltip } from './ChartTooltip';

export type WaterfallStep = {
  name: string;
  amount: number;
  kind: 'total' | 'up' | 'down';
};

type ChartRow = {
  name: string;
  offset: number;
  value: number;
  kind: WaterfallStep['kind'];
};

function toRows(steps: WaterfallStep[]): ChartRow[] {
  let cursor = 0;
  return steps.map((step) => {
    if (step.kind === 'total') {
      cursor = step.amount;
      return { name: step.name, offset: 0, value: step.amount, kind: 'total' };
    }
    const start = cursor;
    cursor += step.amount;
    if (step.amount >= 0) {
      return {
        name: step.name,
        offset: start,
        value: step.amount,
        kind: 'up',
      };
    }
    return {
      name: step.name,
      offset: cursor,
      value: -step.amount,
      kind: 'down',
    };
  });
}

const FILL: Record<WaterfallStep['kind'], string> = {
  total: 'var(--xos-accent)',
  up: 'var(--xos-accent-success)',
  down: 'var(--xos-accent-danger)',
};

export function WaterfallChart({
  steps,
}: {
  steps: WaterfallStep[];
  scope: ScopeKind;
  source: string;
}) {
  const data = toRows(steps);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)', stroke: 'none' }}
          axisLine={{ stroke: 'var(--xos-border)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => fmtEur(v)}
          tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)', stroke: 'none' }}
          width={72}
          axisLine={{ stroke: 'var(--xos-border)' }}
          tickLine={false}
        />
        <ReviewChartTooltip
          content={(props) => {
            const visible = props.payload
              ?.filter((entry) => entry.dataKey === 'value')
              .map((entry) => {
                const row = entry.payload as ChartRow;
                return {
                  ...entry,
                  name: row.kind === 'total' ? 'Total' : 'Variation',
                  value: row.kind === 'down' ? -row.value : row.value,
                };
              });
            return (
              <ChartTooltip
                active={props.active}
                label={props.label}
                payload={visible}
                valueFormatter={fmtEur}
              />
            );
          }}
        />
        <Bar
          dataKey="offset"
          stackId="wf"
          fill="transparent"
          legendType="none"
        />
        <Bar
          dataKey="value"
          stackId="wf"
          radius={4}
          legendType="none"
        >
          {data.map((row) => (
            <Cell key={row.name} fill={FILL[row.kind]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
