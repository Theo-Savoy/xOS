// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./CallManagerApp.tsx', import.meta.url), 'utf8');
const runnerSource = readFileSync(
  new URL('./modules/runner/RunnerView.tsx', import.meta.url),
  'utf8',
);
const callsCss = readFileSync(new URL('./calls.css', import.meta.url), 'utf8');
const dialerCss = readFileSync(
  new URL('./calls-dialer.css', import.meta.url),
  'utf8',
);

describe('Runner accessibility contracts', () => {
  it('retains reduced-motion rules for the cockpit and Power surfaces', () => {
    expect(callsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(callsCss).toContain('.calls-contact-card__fade');
    expect(dialerCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(dialerCss).toContain('.calls-power-toggle__track');
  });

  it('retains explicit live-region semantics for runner feedback', () => {
    expect(runnerSource).toContain('role="status" aria-live="polite"');
    expect(runnerSource).toContain('role="alert" aria-live="assertive"');
    expect(appSource).toContain('role="alert"');
  });

});
