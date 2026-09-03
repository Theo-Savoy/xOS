import mapping from '../_crm/mapping.js';
import { quarterBounds } from './period.js';

const { opportunity: opp, event: evt } = mapping.objects;

function fyIntOfLabel(label) {
  const match = String(label || '').match(/^FY(\d{2})$/);
  return match ? Number(match[1]) : null;
}

export function semesterBounds(fyInt, semester) {
  const firstQuarter = semester === 'S1' ? 1 : semester === 'S2' ? 3 : null;
  if (!firstQuarter) throw new Error(`invalid_semester:${semester}`);
  const start = quarterBounds(fyInt, firstQuarter);
  const end = quarterBounds(fyInt, firstQuarter + 1);
  return { from: start.from, toExclusive: end.toExclusive };
}

function inBounds(value, bounds) {
  const day = String(value || '').slice(0, 10);
  return day >= bounds.from && day < bounds.toExclusive;
}

export function filterWindowBySemester(window, semester) {
  return Object.fromEntries(
    Object.entries(window || {}).map(([fy, bucket]) => {
      const fyInt = fyIntOfLabel(fy);
      if (fyInt === null) return [fy, bucket];
      const bounds = semesterBounds(fyInt, semester);
      return [
        fy,
        {
          won: (bucket?.won || []).filter((row) =>
            inBounds(row?.[opp.fields.closeDate], bounds),
          ),
          closed: (bucket?.closed || []).filter((row) =>
            inBounds(row?.[opp.fields.closeDate], bounds),
          ),
          created: (bucket?.created || []).filter((row) =>
            inBounds(row?.[opp.fields.createdDate], bounds),
          ),
        },
      ];
    }),
  );
}

export function filterEventsBySemester(window, semester) {
  return Object.fromEntries(
    Object.entries(window || {}).map(([fy, rows]) => {
      const fyInt = fyIntOfLabel(fy);
      if (fyInt === null) return [fy, rows];
      const bounds = semesterBounds(fyInt, semester);
      return [
        fy,
        (rows || []).filter((row) =>
          inBounds(row?.[evt.fields.activityDate], bounds),
        ),
      ];
    }),
  );
}
