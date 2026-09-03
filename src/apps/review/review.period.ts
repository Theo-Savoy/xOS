export type ReviewPeriodMode = 'fy' | 'semester';
export type ReviewSemester = 'S1' | 'S2';

export type PeriodSelection = {
  mode: ReviewPeriodMode;
  fy: string;
  semester: ReviewSemester;
};

export const FY_OPTIONS = [
  { value: 'FY22', label: 'FY22' },
  { value: 'FY23', label: 'FY23' },
  { value: 'FY24', label: 'FY24' },
  { value: 'FY25', label: 'FY25' },
  { value: 'FY26', label: 'FY26' },
] as const;

export function fyIntFromLabel(fy: string): number {
  const match = fy.match(/^FY(\d{2})$/);
  if (!match) throw new Error(`invalid_fy:${fy}`);
  return Number(match[1]);
}

/** FY26 = 01/07/2025 → 30/06/2026 (borne exclusive au 01/07 suivant). */
export function fyBounds(fy: string): { from: string; toExclusive: string } {
  const startYear = 2000 + fyIntFromLabel(fy) - 1;
  return {
    from: `${startYear}-07-01`,
    toExclusive: `${startYear + 1}-07-01`,
  };
}

/** S1 = 01/07 → 31/12 ; S2 = 01/01 → 30/06. */
export function semesterBounds(
  fy: string,
  semester: ReviewSemester,
): { from: string; toExclusive: string } {
  const year = fyBounds(fy);
  const mid = `${Number(year.from.slice(0, 4)) + 1}-01-01`;
  return semester === 'S1'
    ? { from: year.from, toExclusive: mid }
    : { from: mid, toExclusive: year.toExclusive };
}

export function periodRange(selection: PeriodSelection): {
  from: string;
  toExclusive: string;
} {
  return selection.mode === 'semester'
    ? semesterBounds(selection.fy, selection.semester)
    : fyBounds(selection.fy);
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function inclusiveEnd(toExclusive: string): string {
  const date = new Date(`${toExclusive}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function periodRangeLabel(selection: PeriodSelection): string {
  const { from, toExclusive } = periodRange(selection);
  return `${formatDay(from)} → ${formatDay(inclusiveEnd(toExclusive))}`;
}

export function comparisonFy(fy: string): string {
  const match = fy.match(/^FY(\d{2})$/);
  if (!match) return fy;
  return `FY${String(Number(match[1]) - 1).padStart(2, '0')}`;
}

export function periodQuery(selection: PeriodSelection): {
  fy: string;
  compare: string;
  semester?: ReviewSemester;
} {
  const base = { fy: selection.fy, compare: comparisonFy(selection.fy) };
  return selection.mode === 'semester'
    ? { ...base, semester: selection.semester }
    : base;
}

export function periodTitle(selection: PeriodSelection): string {
  const compare = comparisonFy(selection.fy);
  const suffix = selection.mode === 'semester' ? ` ${selection.semester}` : '';
  return `${compare}${suffix} → ${selection.fy}${suffix}`;
}

export function businessReviewPath(
  resource: string,
  selection: PeriodSelection,
): string {
  const query = periodQuery(selection);
  const params = new URLSearchParams({
    resource,
    fy: query.fy,
    compare: query.compare,
  });
  if (query.semester) params.set('semester', query.semester);
  return `/api/review?${params.toString()}`;
}
