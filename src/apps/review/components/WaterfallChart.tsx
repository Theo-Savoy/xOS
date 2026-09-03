import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtEur } from '../review.helpers';

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

export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const data = toRows(steps);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
        />
        <YAxis
          tickFormatter={(v: number) => fmtEur(v)}
          tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
          width={72}
        />
        <Tooltip
          formatter={(value, _name, item) => {
            const row = item?.payload as ChartRow | undefined;
            if (!row) return fmtEur(Number(value));
            const signed = row.kind === 'down' ? -row.value : row.value;
            return fmtEur(signed);
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
          radius={[4, 4, 0, 0]}
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
