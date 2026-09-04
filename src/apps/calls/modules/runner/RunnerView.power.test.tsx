// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerView } from './RunnerView';
import type { SessionContact, SessionDetail } from '../../types';
import type * as PowerStripModule from './PowerStrip';
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
// L'encart réel monte le pool (WebRTC + réseau) : ici on teste sa présence
// et les signaux immersifs remontés à RunnerView.
let mockStripProps: {
  onFocusContact?: (contactId: number) => void;
  onConversationChange?: (inConversation: boolean) => void;
  onRunningChange?: (running: boolean) => void;
  onRegisterHangup?: (hangup: (() => void) | null) => void;
  onHangupRetryableChange?: (retryable: boolean) => void;
} = {};

vi.mock('./PowerStrip', async (importOriginal) => {
  const actual = await importOriginal<typeof PowerStripModule>();
  return {
    ...actual,
    PowerStrip: (props: {
      sessionId: number;
      onFocusContact?: (contactId: number) => void;
      onConversationChange?: (inConversation: boolean) => void;
      onRunningChange?: (running: boolean) => void;
      onRegisterHangup?: (hangup: (() => void) | null) => void;
      onHangupRetryableChange?: (retryable: boolean) => void;
    }) => {
      mockStripProps = props;
      return <div data-testid="power-strip">séance {props.sessionId}</div>;
    },
  };
});

const session: SessionDetail = {
  id: 12,
  name: 'Séance test',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
};

const bob = {
  id: 2,
  position: 1,
  sf_contact_id: '003000000000002',
  sf_account_id: null,
  contact_name: 'Bob Durand',
  account_name: 'Acme',
  phone: '+33102030405',
  email: null,
  title: null,
  linkedin_url: null,
  status: 'pending',
  outcome: null,
  comments: null,
  sf_task_id: null,
  sf_event_id: null,
  called_at: null,
} as SessionContact;

const baseProps = {
  session,
  hubSessions: [] as [],
  loading: false,
  error: null as string | null,
  contactContext: null,
  contextContactId: null,
  awaitingEvent: null,
  contacts: [bob],
  currentContact: bob,
  onBack: vi.fn(),
  onFocusContact: vi.fn(),
  onLogAndNext: vi.fn(),
  onLogRdvAndNext: vi.fn(),
  onLogEvent: vi.fn(),
  onDeferContacts: vi.fn(),
  onRemoveContacts: vi.fn(),
  onUpdateRecall: vi.fn(),
  onLogMany: vi.fn(),
};

beforeEach(() => {
  mockStripProps = {};
  window.localStorage?.setItem('xos-combo-demo-seen', '1');
  window.localStorage?.setItem('xos-combo-sounds', '0');
});
afterEach(cleanup);

const powerSwitch = () => screen.queryByRole('switch', { name: 'Power' });

describe('RunnerView — encart power', () => {
  it('n’expose pas le power sans droit dialer', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer={false} />);
    expect(powerSwitch()).toBeNull();
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('monte l’encart sur la séance courante après bascule explicite', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    expect(screen.queryByTestId('power-strip')).toBeNull();

    fireEvent.click(powerSwitch()!);
    expect(screen.getByTestId('power-strip').textContent).toBe('séance 12');

    fireEvent.click(powerSwitch()!);
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('signale visuellement le mode actif sur le toggle Power', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    expect(powerSwitch()!.getAttribute('aria-checked')).toBe('false');
    expect(powerSwitch()!.className).not.toContain('calls-power-toggle--on');

    fireEvent.click(powerSwitch()!);
    expect(powerSwitch()!.getAttribute('aria-checked')).toBe('true');
    expect(powerSwitch()!.className).toContain('calls-power-toggle--on');
  });

  it('n’expose pas le power dans la file de rappels (séances mélangées)', () => {
    render(
      <RunnerView
        {...baseProps}
        token="tok"
        canPowerDialer
        variant="recalls"
      />,
    );
    expect(powerSwitch()).toBeNull();
  });

  it('applique la classe racine calls-view--power et le point ambre discret près du titre', () => {
    const { container } = render(
      <RunnerView {...baseProps} token="tok" canPowerDialer />,
    );
    const root = container.querySelector('.calls-view--runner')!;
    expect(root.className).not.toContain('calls-view--power');
    expect(screen.getByText('Cockpit')).toBeTruthy();
    expect(container.querySelector('.calls-power-indicator')).toBeNull();

    fireEvent.click(powerSwitch()!);
    expect(root.className).toContain('calls-view--power');
    // Les badges « Cockpit » et « Power actif » sont supprimés au profit du point ambre discret
    expect(screen.queryByText('Cockpit')).toBeNull();
    expect(screen.queryByText('Power actif')).toBeNull();
    const indicator = container.querySelector('.calls-power-indicator')!;
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain('Power');
    expect(indicator.querySelector('.calls-power-indicator__dot')).toBeTruthy();
  });

  it('applique la classe racine calls-view--power-conversation quand la conversation est active', () => {
    const { container } = render(
      <RunnerView {...baseProps} token="tok" canPowerDialer />,
    );
    const root = container.querySelector('.calls-view--runner')!;

    fireEvent.click(powerSwitch()!);
    expect(root.className).toContain('calls-view--power');
    expect(root.className).not.toContain('calls-view--power-conversation');

    act(() => {
      mockStripProps.onConversationChange?.(true);
    });
    expect(root.className).toContain('calls-view--power-conversation');

    act(() => {
      mockStripProps.onConversationChange?.(false);
    });
    expect(root.className).not.toContain('calls-view--power-conversation');
  });
  it('masque les contrôles de sortie du header pendant une vague active', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    fireEvent.click(powerSwitch()!);

    expect(powerSwitch()).toBeTruthy();

    act(() => {
      mockStripProps.onRunningChange?.(true);
    });
    expect(screen.queryByRole('switch', { name: 'Power' })).toBeNull();
    // Le seul arrêt destructif est porté par le PowerStrip.
    expect(
      screen.queryByRole('button', { name: 'Raccrocher et quitter' }),
    ).toBeNull();
  });

  it('conserve Power actif et expose le retry si le raccrochage serveur échoue', () => {
    const { container } = render(
      <RunnerView {...baseProps} token="tok" canPowerDialer />,
    );
    const root = container.querySelector('.calls-view--runner')!;
    fireEvent.click(powerSwitch()!);

    const mockHangup = vi.fn();
    act(() => {
      mockStripProps.onRegisterHangup?.(mockHangup);
      mockStripProps.onHangupRetryableChange?.(true);
    });
    const retryBtn = screen.getByRole('button', {
      name: 'Réessayer le raccrochage',
    });
    fireEvent.click(retryBtn);
    expect(mockHangup).toHaveBeenCalled();
    expect(root.className).toContain('calls-view--power');
    expect(powerSwitch()).toBeNull();
  });

  it('masque Partager, Épingler au bureau, ⌘K et ? en mode Power', () => {
    const onShare = vi.fn();
    const onPin = vi.fn().mockResolvedValue(undefined);
    render(
      <RunnerView
        {...baseProps}
        token="tok"
        canPowerDialer
        onShareSession={onShare}
        onPin={onPin}
      />,
    );

    // En mode normal : Partager, Épingler, ⌘K, ? sont visibles
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Épingler au bureau' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Command bar' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Aide raccourcis' }),
    ).toBeTruthy();

    // Activation du mode Power
    fireEvent.click(powerSwitch()!);

    // En mode Power : ils sont tous masqués
    expect(screen.queryByRole('button', { name: 'Partager' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Épingler au bureau' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Command bar' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Aide raccourcis' }),
    ).toBeNull();
  });

  it('masque le toggle Liste/Fiche pendant une vague active ou en conversation', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    fireEvent.click(powerSwitch()!);

    // Au repos en Power : toggle visible
    expect(
      screen.getByRole('group', { name: "Mode d'affichage" }),
    ).toBeTruthy();

    // Vague active : toggle masqué
    act(() => {
      mockStripProps.onRunningChange?.(true);
    });
    expect(
      screen.queryByRole('group', { name: "Mode d'affichage" }),
    ).toBeNull();

    // Arrêt vague mais conversation : toggle toujours masqué
    act(() => {
      mockStripProps.onRunningChange?.(false);
      mockStripProps.onConversationChange?.(true);
    });
    expect(
      screen.queryByRole('group', { name: "Mode d'affichage" }),
    ).toBeNull();

    // Fin de conversation : toggle réapparaît
    act(() => {
      mockStripProps.onConversationChange?.(false);
    });
    expect(
      screen.getByRole('group', { name: "Mode d'affichage" }),
    ).toBeTruthy();
  });

  it('remplace les 5 cartes KPI par une ligne condensée, masquée en conversation', () => {
    const { container } = render(
      <RunnerView {...baseProps} token="tok" canPowerDialer />,
    );

    // Mode normal : les 5 cartes KPI et la ProgressBar sont présentes
    expect(container.querySelector('.calls-cockpit-kpis')).toBeTruthy();
    expect(container.querySelector('.xos-progress')).toBeTruthy();
    expect(container.querySelector('.calls-power-kpis-condensed')).toBeNull();

    // Activation Power : cartes masquées, ligne condensée présente
    fireEvent.click(powerSwitch()!);
    expect(container.querySelector('.calls-cockpit-kpis')).toBeNull();
    expect(container.querySelector('.calls-progress-bar')).toBeNull();
    const condensed = container.querySelector('.calls-power-kpis-condensed');
    expect(condensed).toBeTruthy();
    expect(condensed!.textContent).toContain('0/1 traités');
    expect(condensed!.textContent).toContain('0 RDV');

    // Conversation active : même le résumé condensé est masqué
    act(() => {
      mockStripProps.onConversationChange?.(true);
    });
    expect(container.querySelector('.calls-power-kpis-condensed')).toBeNull();

    // Fin de conversation : le résumé condensé réapparaît
    act(() => {
      mockStripProps.onConversationChange?.(false);
    });
    expect(container.querySelector('.calls-power-kpis-condensed')).toBeTruthy();
  });

  it('redirige l\'accent global XOS sur le jaune Power quand le mode est actif', () => {
    // Le sélecteur `:has()` n'étant pas appliqué par jsdom,
    // on vérifie la règle CSS source qui doit promouvoir
    // --xos-accent sur --combo-power quand le mode Power est actif.
    const callsCss = readFileSync('src/apps/calls/calls.css', 'utf8');
    const callsDialerCss = readFileSync('src/apps/calls/calls-dialer.css', 'utf8');
    // La surcharge --xos-accent existe bien dans le scope Power (au repos ET en conversation)
    // et vaut toujours le combo-power jaune.
    const powerBlock = callsCss.match(
      /\.calls-app:has\(\.calls-view--power\)\s*\{[\s\S]*?--xos-accent:\s*var\(--combo-power\)[^;]*;/,
    );
    expect(powerBlock, '--xos-accent doit suivre --combo-power en mode Power').toBeTruthy();

    const convBlock = callsCss.match(
      /\.calls-app:has\(\.calls-view--power-conversation\)\s*\{[\s\S]*?--xos-accent:\s*var\(--combo-power\)[^;]*;/,
    );
    expect(
      convBlock,
      '--xos-accent doit suivre --combo-power en conversation Power',
    ).toBeTruthy();

    // Aucun violet ne doit rester dans les fonds Power (qui utilisaient var(--xos-accent)).
    const powerBg = callsCss.match(
      /\.calls-app:has\(\.calls-view--power\)\s*\{[\s\S]*?background:[\s\S]*?;/,
    )?.[0] ?? '';
    expect(powerBg).not.toContain('var(--xos-accent)');

    // Aucun violet ne doit rester dans la bordure de ligne en cours de composition/sonnerie.
    const dialingBorders = Array.from(
      callsDialerCss.matchAll(
        /\.calls-power-strip__line--(dialing|ringing)\s*\{[\s\S]*?border-left-color:\s*([^;]+);/g,
      ),
    ).map((m) => m[2]);
    // Les deux règles (dialing et ringing) partagent le bloc → au moins un match;
    // quand CSS est splitté, on doit avoir au moins une bordure non-violette.
    expect(dialingBorders.length).toBeGreaterThanOrEqual(1);
    for (const value of dialingBorders) {
      expect(value).toContain('--combo-power');
    }
  });

  it('affiche le tableau Power directement sans état replié avec les 4 colonnes dont l’email', () => {
    const alice = {
      id: 3,
      position: 2,
      sf_contact_id: '003000000000003',
      sf_account_id: null,
      contact_name: 'Alice Martin',
      account_name: 'Beta Corp',
      phone: '+33102030406',
      email: 'alice@beta.corp',
      title: 'Directrice',
      linkedin_url: null,
      status: 'pending',
      outcome: null,
      comments: null,
      sf_task_id: null,
      sf_event_id: null,
      called_at: null,
    } as SessionContact;

    const onFocusContact = vi.fn();
    const { container } = render(
      <RunnerView
        {...baseProps}
        contacts={[bob, alice]}
        onFocusContact={onFocusContact}
        token="tok"
        canPowerDialer
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Liste/ }));
    fireEvent.click(powerSwitch()!);

    // Tableau visible directement sans bouton Voir/Masquer (aucun état replié)
    expect(screen.queryByRole('button', { name: 'Voir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Masquer' })).toBeNull();

    // Wrapper et tableau Power pleine largeur de cockpit
    const tableWrap = container.querySelector(
      '.calls-cockpit-list-wrap--power',
    )!;
    expect(tableWrap).toBeTruthy();
    expect(tableWrap.classList.contains('calls-cockpit-list-wrap')).toBe(true);
    const table = container.querySelector('.calls-cockpit-list--power')!;
    expect(table).toBeTruthy();

    // Résumé et filtre immédiatement accessibles
    const summaryText = container.querySelector(
      '.calls-power-queue-summary__text',
    )!;
    expect(summaryText.textContent).toContain("File d'appel · 2 prêts");
    expect(
      screen.getByRole('searchbox', { name: 'Filtrer la liste' }),
    ).toBeTruthy();

    // En-têtes du tableau Power : Contact, Entreprise, Email, Tentative / état
    const header = container.querySelector('.calls-cockpit-list__header--power')!;
    expect(header).toBeTruthy();
    expect(header.textContent).toContain('Contact');
    expect(header.textContent).toContain('Entreprise');
    expect(header.textContent).toContain('Email');
    expect(header.textContent).toContain('Tentative / état');

    // Affichage des emails avec mailto ou fallback "Aucun email"
    const aliceMail = screen.getByRole('link', { name: 'alice@beta.corp' });
    expect(aliceMail).toBeTruthy();
    expect(aliceMail.getAttribute('href')).toBe('mailto:alice@beta.corp');

    expect(screen.getByText('Aucun email')).toBeTruthy();

    // Interaction clic ligne/contact vers la fiche
    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/ }));
    expect(onFocusContact).toHaveBeenCalledWith(alice.id);

    // Pas de contrôles de sélection de masse ni de suppression
    expect(screen.queryByRole('button', { name: /Sélectionner/ })).toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: /Sélectionner Bob Durand/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Retirer Bob Durand de la séance/ }),
    ).toBeNull();
  });

  it('bascule la fiche et la consignation au décrochage, la file disparaît', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    fireEvent.click(screen.getByRole('button', { name: /Liste/ }));
    fireEvent.click(powerSwitch()!);

    expect(screen.getByText(/File d'appel ·/)).toBeTruthy();

    // Décrochage : le PowerStrip signale le gagnant + la conversation.
    act(() => {
      mockStripProps.onFocusContact?.(bob.id);
      mockStripProps.onConversationChange?.(true);
    });

    // La file disparaît…
    expect(screen.queryByText(/File d'appel ·/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Voir' })).toBeNull();
    // …remplacée par la fiche du contact + le formulaire de consignation.
    expect(screen.getByText('Bob Durand')).toBeTruthy();
    expect(screen.getByText(/Consigner l.?appel/)).toBeTruthy();
  });

  it('Invariant I12 : le raccourci L ne quitte jamais la fiche pendant une conversation Power', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    fireEvent.click(screen.getByRole('button', { name: /Fiche/ }));
    fireEvent.click(powerSwitch()!);

    // Décrochage : conversation active
    act(() => {
      mockStripProps.onFocusContact?.(bob.id);
      mockStripProps.onConversationChange?.(true);
    });

    expect(screen.getByText('Bob Durand')).toBeTruthy();

    // Appui sur la touche 'l' pour tenter de basculer vers la liste
    fireEvent.keyDown(document, { key: 'l' });

    // La fiche Bob Durand reste toujours affichée, pas de bascule en liste
    expect(screen.getByText('Bob Durand')).toBeTruthy();
    expect(screen.getByText(/Consigner l.?appel/)).toBeTruthy();
  });

  it('Invariant I13 : active=false désactive le listener clavier global document', () => {
    const alice = { ...bob, id: 3, contact_name: 'Alice Martin' };
    const onFocusContact = vi.fn();
    render(
      <RunnerView
        {...baseProps}
        active={false}
        contacts={[bob, alice]}
        currentContact={bob}
        onFocusContact={onFocusContact}
      />,
    );
    onFocusContact.mockClear();

    // En mode fiche initiale avec active=false, taper 'k' ne doit déclencher aucune navigation clavier
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'j' });
    expect(onFocusContact).not.toHaveBeenCalled();
  });

  it('Invariant I9 : déduplique les numéros dans le résumé de file Power', () => {
    const contactA = { ...bob, id: 10, phone: '06 11 11 11 11' };
    const contactB = { ...bob, id: 11, phone: '06 11 11 11 11' };
    const contactC = { ...bob, id: 12, phone: '06 22 22 22 22' };

    render(
      <RunnerView
        {...baseProps}
        contacts={[contactA, contactB, contactC]}
        token="tok"
        canPowerDialer
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Liste/ }));
    fireEvent.click(powerSwitch()!);

    // Il y a 3 contacts pending mais 2 numéros uniques prêts après déduplication
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/prêts/)).toBeTruthy();
  });
});
