import { expect, test, type Page } from '@playwright/test';
import {
  RUNNER_HEIGHTS,
  RUNNER_STATES,
  RUNNER_WIDTHS,
  runnerFixtureDocument,
  type RunnerState,
} from './fixtures/runnerStates';

test.describe.configure({ mode: 'serial' });

async function assertStateInvariant(page: Page, state: RunnerState) {
  const app = page.locator('.calls-app');
  await expect(app).toBeVisible();
  await expect(page.locator('[data-runner-state]')).toHaveAttribute(
    'data-runner-state',
    state,
  );

  if (state === 'standard') {
    await expect(page.locator('.calls-view--power')).toHaveCount(0);
    await expect(page.locator('.calls-cockpit-list')).toHaveCount(1);
  } else if (state === 'bulk') {
    await expect(page.locator('.calls-bulk-bar')).toBeVisible();
    await expect(page.getByText('2 contacts sélectionnés')).toBeVisible();
  } else if (state === 'power-off') {
    await expect(page.locator('.calls-view--power')).toHaveCount(0);
    await expect(page.getByText(/Power désactivé/)).toBeVisible();
  } else if (state === 'power-ready') {
    await expect(page.locator('.calls-view--power')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Lancer 3 appels' })).toBeVisible();
    await expect(page.getByText('Prêt à lancer')).toBeVisible();
  } else if (state === 'power-wave') {
    await expect(page.locator('.calls-view--power')).toHaveCount(1);
    await expect(page.locator('.calls-power-strip__line--ringing')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Raccrocher tout' })).toBeVisible();
  } else {
    await expect(page.locator('.calls-view--power-conversation')).toHaveCount(1);
    await expect(
      page.locator('.calls-fixture-conversation').getByText('Conversation active'),
    ).toBeVisible();
    await expect(page.locator('.calls-fixture-conversation')).toBeVisible();
  }

  const overflow = await page.locator('.calls-app').evaluate((element) => ({
    appOverflow: element.scrollWidth > element.clientWidth + 1,
    innerOverflow: Array.from(element.querySelectorAll<HTMLElement>('*')).some(
      (child) => child.scrollWidth > child.clientWidth + 1,
    ),
  }));
  expect(overflow.appOverflow && !overflow.innerOverflow).toBe(false);
}

for (const state of RUNNER_STATES) {
  for (const width of RUNNER_WIDTHS) {
    const height =
      state === 'power-conversation'
        ? RUNNER_HEIGHTS.constrained
        : RUNNER_HEIGHTS.standard;
    test(`${state} · ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setContent(runnerFixtureDocument(state));
      await assertStateInvariant(page, state);
      await expect(page).toHaveScreenshot(
        `runner/${state}-${width}x${height}.png`,
        {
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
        },
      );
    });
  }
}
