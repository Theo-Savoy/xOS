import { expect, test, type Page } from '@playwright/test';
import {
  RUNNER_HEIGHTS,
  RUNNER_STATES,
  RUNNER_WIDTHS,
  runnerFixtureDocument,
  type RunnerState,
} from './fixtures/runnerStates';

test.describe.configure({ mode: 'serial' });

async function assertStateInvariant(
  page: Page,
  state: RunnerState,
  width: number,
) {
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
    unboundedOverflow: Array.from(
      element.querySelectorAll<HTMLElement>('*'),
    )
      // The current list wrapper leaves a two-pixel negative-margin rounding
      // remainder; only substantive overflow is a layout violation here.
      .filter((child) => child.scrollWidth > child.clientWidth + 4)
      .filter((child) => !child.closest('.calls-cockpit-list__scroll'))
      .map(
        (child) =>
          `${child.className || child.tagName}:${child.scrollWidth}/${child.clientWidth}`,
      ),
  }));
  expect(overflow.appOverflow, JSON.stringify(overflow)).toBe(false);
  expect(overflow.unboundedOverflow).toEqual([]);

  const primaryCtas = await page.locator('.calls-app').evaluate((element) =>
    Array.from(
      element.querySelectorAll<HTMLElement>('button.xos-btn--primary'),
    )
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.textContent?.trim() ?? '',
          left: rect.left,
          right: rect.right,
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((button) => button.visible),
  );
  for (const cta of primaryCtas) {
    expect(cta.left, cta.label).toBeGreaterThanOrEqual(0);
    expect(cta.right, cta.label).toBeLessThanOrEqual(width + 1);
  }

  if (state === 'power-conversation') {
    const columns = await page
      .locator('.calls-fixture-conversation')
      .evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
      );
    expect(columns).toHaveLength(width < 720 ? 1 : 2);
  }

  if (state.startsWith('power-') && state !== 'power-off') {
    const motionStyles = await page.locator('.calls-app').evaluateAll(() =>
      ['.calls-app', '.calls-power-strip']
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .filter((element): element is HTMLElement => element !== null)
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            selector: element.className || element.tagName,
            transitionDuration: style.transitionDuration,
            animationName: style.animationName,
          };
        }),
    );
    expect(motionStyles).not.toHaveLength(0);
    for (const style of motionStyles) {
      expect(style.transitionDuration, style.selector).toBe('0s');
      expect(style.animationName, style.selector).toBe('none');
    }
  }
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
      await assertStateInvariant(page, state, width);
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

test('keeps every primary CTA inside the default desktop viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: RUNNER_HEIGHTS.standard });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const state of ['bulk', 'power-ready', 'power-conversation'] as const) {
    await page.setContent(runnerFixtureDocument(state));
    const primaryCtas = page.locator('button.xos-btn--primary');
    await expect(primaryCtas.first()).toBeVisible();
    const bounds = await primaryCtas.evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
    for (const rect of bounds) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(961);
    }
  }
});
