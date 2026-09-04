// @vitest-environment jsdom
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerView } from './RunnerView';
import type { SessionContact } from '../../types';
import {
  makeContact,
  makeSession,
} from './runnerCharacterizationFixtures';
import { addDaysIso } from './runnerFormatters';

const powerMock = vi.hoisted(() => ({
  props: null as {
    onConversationChange?: (active: boolean) => void;
    onRunningChange?: (running: boolean) => void;
  } | null,
}));

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

vi.mock('./PowerStrip', () => ({
  PowerStrip: (props: {
    onConversationChange?: (active: boolean) => void;
    onRunningChange?: (running: boolean) => void;
  }) => {
    powerMock.props = props;
    return <div data-testid="power-strip-fixture">Power fixture</div>;
  },
  normalizeE164: (raw: string | null | undefined) => {
    if (!raw) return null;
    const digits = raw.replace(/[^\d+]/g, '');
    return digits || null;
  },
}));

const session = makeSession();
const contactOne = makeContact(1, { contact_name: 'Contact 1' });
const contactTwo = makeContact(2, { contact_name: 'Contact 2' });

function noopRunnerProps() {
  return {
    session,
    hubSessions: [],
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
}

function renderRunner(
  overrides: Partial<ReturnType<typeof noopRunnerProps>> & {
    contacts?: SessionContact[];
    currentContact?: SessionContact | null;
    focusedContactId?: number | null;
    token?: string | null;
    canPowerDialer?: boolean;
  } = {},
) {
  const props = {
    ...noopRunnerProps(),
    contacts: [contactOne],
    currentContact: contactOne,
    ...overrides,
  };
  return render(<RunnerView {...props} />);
}

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

beforeEach(() => {
  installLocalStorage();
  window.localStorage.clear();
  window.localStorage.setItem('xos-combo-demo-seen', '1');
  window.localStorage.setItem('xos-combo-sounds', '0');
  powerMock.props = null;
});

afterEach(() => {
  cleanup();
});

describe('RunnerView — caractérisation de navigation et de saisie', () => {
  it('follows the next pending contact after Consigner & suivant', async () => {
    const user = userEvent.setup();
    const submitted: number[] = [];

    function SequentialRunner() {
      const [contacts, setContacts] = useState([contactOne, contactTwo]);
      const [focusedContactId, setFocusedContactId] = useState<number | null>(
        null,
      );
      const currentContact =
        contacts.find((contact) => contact.status === 'pending') ?? null;

      return (
        <RunnerView
          {...noopRunnerProps()}
          contacts={contacts}
          currentContact={currentContact}
          focusedContactId={focusedContactId}
          onFocusContact={setFocusedContactId}
          onLogAndNext={(contactId) => {
            submitted.push(contactId);
            setContacts((current) =>
              current.map((contact) =>
                contact.id === contactId
                  ? { ...contact, status: 'called', outcome: 'Appel décroché' }
                  : contact,
              ),
            );
            setFocusedContactId(null);
          }}
        />
      );
    }

    render(<SequentialRunner />);
    await user.click(screen.getByRole('button', { name: 'Fiche' }));
    await user.click(screen.getByRole('button', { name: /Consigner & suivant/ }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Contact 2' })).toBeTruthy(),
    );
    expect(submitted).toEqual([1]);
  });

  it('passes a quick recall preset to the log payload', async () => {
    const user = userEvent.setup();
    const onLogAndNext = vi.fn();
    renderRunner({ onLogAndNext });

    await user.click(screen.getByRole('button', { name: 'Fiche' }));
    await user.click(screen.getByRole('button', { name: '+7 j' }));
    await user.click(screen.getByRole('button', { name: /Consigner & suivant/ }));

    expect(onLogAndNext).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        resultat: 'Appel non décroché',
        recallAt: addDaysIso(7),
        doNotCall: false,
      }),
    );
  });

  it('passes a date chosen in the calendar to the log payload', async () => {
    const user = userEvent.setup();
    const onLogAndNext = vi.fn();
    renderRunner({ onLogAndNext });

    await user.click(screen.getByRole('button', { name: 'Fiche' }));
    await user.click(screen.getByRole('button', { name: 'Choisir une date' }));
    const calendar = screen.getByRole('dialog', { name: 'Choisir une date' });
    await user.click(
      within(calendar).getByRole('button', { name: "Aujourd'hui" }),
    );
    await user.click(screen.getByRole('button', { name: /Consigner & suivant/ }));

    expect(onLogAndNext).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ recallAt: expect.any(String) }),
    );
    expect(onLogAndNext.mock.calls[0]?.[1]).toMatchObject({
      recallAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('marks NPA and suppresses the recall payload', async () => {
    const user = userEvent.setup();
    const onLogAndNext = vi.fn();
    renderRunner({ onLogAndNext });

    await user.click(screen.getByRole('button', { name: 'Fiche' }));
    await user.click(
      screen.getByLabelText('Ne pas rappeler (NPA) — définitif'),
    );
    expect(screen.queryByRole('group', { name: 'Rappel' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Consigner & suivant/ }));

    expect(onLogAndNext).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ recallAt: null, doNotCall: true }),
    );
  });

  it('keeps the bulk form exclusive from contact focus and keyboard result actions', async () => {
    const user = userEvent.setup();
    const onLogMany = vi.fn();
    renderRunner({
      contacts: [contactOne, contactTwo],
      currentContact: contactOne,
      onLogMany,
    });

    await user.click(screen.getByRole('button', { name: 'Liste' }));
    await user.click(
      screen.getByLabelText('Sélectionner Contact 1'),
    );
    expect(screen.getByText(/1 contact sélectionné/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Fiche' })).toBeNull();

    fireEvent.keyDown(document, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(document, {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    });
    expect(onLogMany).not.toHaveBeenCalled();
    expect(screen.getByText(/1 contact sélectionné/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Contact 2' }));
    expect(screen.queryByText(/1 contact sélectionné/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Contact 2' })).toBeTruthy();
  });

  it('ignores navigation and result shortcuts while typing in the comment field', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.click(screen.getByRole('button', { name: 'Fiche' }));
    const comments = screen.getByRole('textbox', { name: 'Commentaires' });
    fireEvent.keyDown(comments, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(comments, { key: 'l', code: 'KeyL' });

    expect(screen.getByRole('heading', { name: 'Contact 1' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Appel non décroché' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
  });
});

describe('RunnerView — défauts connus à protéger pendant la migration', () => {
  it.fails(
    'does not leave the contact sheet when L is pressed during a Power conversation',
    async () => {
      const user = userEvent.setup();
      const { container } = renderRunner({
        token: 'power-token',
        canPowerDialer: true,
      });

      await user.click(screen.getByRole('button', { name: 'Fiche' }));
      await user.click(screen.getByRole('switch', { name: 'Power' }));
      act(() => actConversation(true));
      fireEvent.keyDown(document, { key: 'l', code: 'KeyL' });

      expect(container.querySelector('.calls-view--detail')).toBeTruthy();
      expect(
        container.querySelector('.calls-view--power-conversation'),
      ).toBeTruthy();
    },
  );
});

function actConversation(active: boolean) {
  powerMock.props?.onConversationChange?.(active);
}
