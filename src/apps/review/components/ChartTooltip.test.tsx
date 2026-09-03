// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fmtEur } from '../review.helpers';
import { ChartTooltip } from './ChartTooltip';

afterEach(cleanup);

describe('ChartTooltip', () => {
  it('affiche métrique, valeur, scope, delta comparatif et source', () => {
    const { container } = render(
      <ChartTooltip
        active
        label="FY26"
        payload={[
          {
            dataKey: 'NEW',
            name: 'NEW',
            value: 904_200,
            color: '#8b5bfa',
            payload: { NEW: 904_200, NEWDelta: -163_700 },
          },
        ]}
        scope="new"
        source="Salesforce · CA NEW"
        compareLabel="FY25"
        deltaKeys={{ NEW: 'NEWDelta' }}
        valueFormatter={fmtEur}
        deltaFormatter={fmtEur}
      />,
    );

    expect(screen.getByText('FY26')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('904,2 k€')).toBeTruthy();
    expect(screen.getByText('−163,7 k€ vs FY25')).toBeTruthy();
    expect(screen.getByText('CA NEW')).toBeTruthy();
    expect(screen.getByText('Salesforce · CA NEW')).toBeTruthy();
    expect(container.querySelector('.xos-glass-card')).toBeTruthy();
    expect(container.querySelector('.xos-tag')).toBeTruthy();
  });

  it('ne rend rien quand le survol est inactif', () => {
    const { container } = render(
      <ChartTooltip
        active={false}
        payload={[]}
        scope="total"
        source="CA total"
        valueFormatter={fmtEur}
      />,
    );

    expect(container.childElementCount).toBe(0);
  });
});
