import { expect, test, type Page } from '@playwright/test';
import {
  RUNNER_STATES,
  RUNNER_WIDTHS,
  runnerFixtureDocument,
} from './fixtures/runnerStates';

async function collectA11ySmokeViolations(page: Page) {
  return page.evaluate(() => {
    const violations: string[] = [];
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ),
    );

    for (const element of interactive) {
      if (element.closest('[aria-hidden="true"]')) {
        violations.push(`focusable-under-aria-hidden:${element.tagName}`);
      }
      const name = [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.textContent?.trim(),
        (element as HTMLInputElement).placeholder,
        (element as HTMLInputElement).labels?.[0]?.textContent?.trim(),
      ].find(Boolean);
      if (!name && element.tagName !== 'INPUT') {
        violations.push(`missing-name:${element.tagName}`);
      }
    }

    const ids = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      if (ids.has(element.id)) violations.push(`duplicate-id:${element.id}`);
      ids.add(element.id);
    }

    for (const region of document.querySelectorAll<HTMLElement>('[aria-live]')) {
      if (!['status', 'alert'].includes(region.getAttribute('role') ?? '')) {
        violations.push(`unscoped-live-region:${region.tagName}`);
      }
    }

    return violations;
  });
}

for (const state of RUNNER_STATES) {
  test(`a11y smoke · ${state} · contract widths`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const width of RUNNER_WIDTHS) {
      await page.setViewportSize({ width, height: 420 });
      await page.setContent(runnerFixtureDocument(state));
      expect(
        await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      expect(await collectA11ySmokeViolations(page)).toEqual([]);

      const overflow = await page.locator('.calls-app').evaluate((element) => {
        const innerOverflow = Array.from(element.querySelectorAll<HTMLElement>('*')).some(
          (child) => child.scrollWidth > child.clientWidth + 1,
        );
        return {
          appOverflow: element.scrollWidth > element.clientWidth + 1,
          innerOverflow,
        };
      });
      expect(overflow.appOverflow && !overflow.innerOverflow).toBe(false);
    }

    expect(pageErrors).toEqual([]);
  });
}
