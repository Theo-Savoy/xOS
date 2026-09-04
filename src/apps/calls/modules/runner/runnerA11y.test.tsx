// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerView } from './RunnerView';
import {
  makeContact,
  makeSession,
} from './runnerCharacterizationFixtures';

vi.mock('../dialer/DialerProvider', () => ({
  useDialer: () => ({
    phase: 'idle',
    error: null,
    durationSec: 0,
    destination: '',
    callStats: null,
    startCall: vi.fn().mockResolvedValue(true),
    hangup: vi.fn(),
    isActive: false,
  }),
}));

const session = makeSession();
const contact = makeContact(1);

const baseProps = {
  session,
  contacts: [contact],
  hubSessions: [],
  currentContact: null,
  focusedContactId: null,
  loading: false,
  error: null,
  awaitingEvent: null,
  contactContext: null,
  contextContactId: null,
  onBack: vi.fn(),
  onFocusContact: vi.fn(),
  onLogAndNext: vi.fn(),
  onLogRdvAndNext: vi.fn(),
  onLogMany: vi.fn(),
  onLogEvent: vi.fn(),
  onDeferContacts: vi.fn(),
  onRemoveContacts: vi.fn(),
  onUpdateRecall: vi.fn(),
};

function installLocalStorage() {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    },
  });
}

function axeLikeViolations(root: HTMLElement): string[] {
  const violations: string[] = [];
  const ids = new Set<string>();

  for (const element of root.querySelectorAll<HTMLElement>('[id]')) {
    const id = element.id;
    if (ids.has(id)) violations.push(`duplicate-id:${id}`);
    ids.add(id);
  }

  const focusables = root.querySelectorAll<HTMLElement>(
    'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
  );
  for (const element of focusables) {
    if (element.closest('[aria-hidden="true"]')) {
      violations.push(`focusable-under-aria-hidden:${element.outerHTML}`);
    }
  }

  for (const element of focusables) {
    const tagName = element.tagName.toLowerCase();
    const labelledBy = element
      .getAttribute('aria-labelledby')
      ?.split(/\s+/)
      .map((id) =>
        [...root.querySelectorAll<HTMLElement>('[id]')].find(
          (candidate) => candidate.id === id,
        )?.textContent?.trim(),
      )
      .filter(Boolean)
      .join(' ');
    const hasLabel = Boolean(
      element.getAttribute('aria-label') ||
        labelledBy ||
        element.getAttribute('title') ||
        element.textContent?.trim() ||
        (element instanceof HTMLInputElement && element.labels?.length) ||
        (element instanceof HTMLTextAreaElement && element.labels?.length),
    );
    if (!hasLabel) violations.push(`missing-accessible-name:${tagName}`);
  }

  for (const live of root.querySelectorAll<HTMLElement>('[aria-live]')) {
    const role = live.getAttribute('role');
    if (role !== 'status' && role !== 'alert') {
      violations.push(`unscoped-live-region:${live.outerHTML}`);
    }
  }

  return violations;
}

beforeEach(() => {
  installLocalStorage();
  window.localStorage.setItem('xos-combo-demo-seen', '1');
  window.localStorage.setItem('xos-combo-sounds', '0');
});

afterEach(cleanup);

describe('RunnerView — filet axe-like sans dépendance runtime', () => {
  it('keeps the standard list free of basic axe violations', () => {
    const { container } = render(<RunnerView {...baseProps} />);

    expect(axeLikeViolations(container)).toEqual([]);
  });

  it('keeps the focused call form named and its error live region assertive', () => {
    const { container } = render(
      <RunnerView
        {...baseProps}
        currentContact={contact}
        error="Salesforce a refusé l'enregistrement."
      />,
    );

    expect(axeLikeViolations(container)).toEqual([]);
    expect(container.querySelector('[role="alert"][aria-live="assertive"]'))
      .toBeTruthy();
    expect(
      container.querySelector<HTMLTextAreaElement>('textarea')?.labels?.[0]
        ?.textContent,
    ).toContain('Commentaires');
  });

  it('keeps a concrete error live region scoped to status or alert semantics', () => {
    const { container } = render(
      <RunnerView
        {...baseProps}
        currentContact={contact}
        error="Salesforce a refusé l'enregistrement."
      />,
    );

    const liveRegions = container.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBeGreaterThan(0);
    expect(container.querySelector('[role="alert"][aria-live="assertive"]'))
      .toBeTruthy();
    for (const region of liveRegions) {
      expect(['status', 'alert']).toContain(region.getAttribute('role'));
    }
  });
});
