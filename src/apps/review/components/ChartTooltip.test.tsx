// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fmtEur } from '../review.helpers';
import { ChartTooltip } from './ChartTooltip';

afterEach(cleanup);

describe('ChartTooltip', () => {
  it('affiche label, métrique et valeur sans bruit de delta ni source', () => {
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
          },
        ]}
        valueFormatter={fmtEur}
      />,
    );

    expect(screen.getByText('FY26')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('904,2 k€')).toBeTruthy();
    expect(screen.queryByText(/vs/)).toBeNull();
    expect(screen.queryByText(/Salesforce/)).toBeNull();
    expect(container.querySelector('.xos-glass-card')).toBeTruthy();
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
