import { describe, expect, it } from 'vitest';
import {
  filterEventsBySemester,
  filterWindowBySemester,
  semesterBounds,
} from './semester.js';

describe('fenêtres semestrielles FY juillet → juin', () => {
  it('définit S1 de juillet à décembre et S2 de janvier à juin', () => {
    expect(semesterBounds(26, 'S1')).toEqual({
      from: '2025-07-01',
      toExclusive: '2026-01-01',
    });
    expect(semesterBounds(26, 'S2')).toEqual({
      from: '2026-01-01',
      toExclusive: '2026-07-01',
    });
  });

  it('filtre chaque flux avec sa date métier et conserve les clés FY', () => {
    const window = {
      FY26: {
        won: [
          { Id: 'won-s1', CloseDate: '2025-12-31' },
          { Id: 'won-s2', CloseDate: '2026-01-01' },
        ],
        closed: [
          { Id: 'closed-s1', CloseDate: '2025-07-01' },
          { Id: 'closed-s2', CloseDate: '2026-06-30' },
        ],
        created: [
          { Id: 'created-s1', CreatedDate: '2025-10-02T10:00:00Z' },
          { Id: 'created-s2', CreatedDate: '2026-03-02T10:00:00Z' },
        ],
      },
    };

    expect(filterWindowBySemester(window, 'S1')).toEqual({
      FY26: {
        won: [{ Id: 'won-s1', CloseDate: '2025-12-31' }],
        closed: [{ Id: 'closed-s1', CloseDate: '2025-07-01' }],
        created: [
          { Id: 'created-s1', CreatedDate: '2025-10-02T10:00:00Z' },
        ],
      },
    });
  });

  it('filtre aussi les RDV sur ActivityDate', () => {
    expect(
      filterEventsBySemester(
        {
          FY26: [
            { Subject: 'RDV S1', ActivityDate: '2025-09-02' },
            { Subject: 'RDV S2', ActivityDate: '2026-04-02' },
          ],
        },
        'S2',
      ),
    ).toEqual({
      FY26: [{ Subject: 'RDV S2', ActivityDate: '2026-04-02' }],
    });
  });
});
