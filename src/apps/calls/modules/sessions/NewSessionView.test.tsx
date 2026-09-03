// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewSessionView } from './NewSessionView';
import { emptyFilterTree } from '../../../../crm';
import type { ContactPreview } from '../../types';

afterEach(cleanup);

const noop = vi.fn();

function baseProps(preview: ContactPreview[] = [], previewLoading = false) {
  return {
    filters: emptyFilterTree(),
    onFiltersChange: noop,
    contactLimit: 100 as const,
    onContactLimitChange: noop,
    maxPerCompany: null,
    onMaxPerCompanyChange: noop,
    loading: false,
    previewLoading,
    matchCount: null,
    matchCountCapped: false,
    matchCountLoading: false,
    matchCountError: null,
    error: null,
    preview,
    dedup: [],
    previewTruncated: false,
    presets: [],
    presetsLoading: false,
    savingPreset: false,
    currentUserId: 'user-1',
    onBack: noop,
    onLoadPreset: noop,
    onSavePreset: noop,
    onDeletePreset: noop,
    onCreate: noop,
  };
}

describe('NewSessionView — UX writing & wizard (spec §4.3 & plan)', () => {
  it('labels the header exit action as leaving session creation', () => {
    render(<NewSessionView {...baseProps()} />);
    expect(
      screen.getByRole('button', { name: 'Quitter la création de séance' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();
  });

  it('adapts the page title to the current wizard step and hides the session badge', async () => {
    const user = userEvent.setup();
    render(
      <NewSessionView
        {...baseProps([
          {
            sf_contact_id: '003a',
            sf_account_id: '001a',
            contact_name: 'Alice Martin',
            account_name: 'Acme',
            phone: '0102030405',
          },
        ])}
        filters={{
          ...emptyFilterTree(),
          entreprise: {
            ...emptyFilterTree().entreprise,
            tiers: ['A'],
          },
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Définissez votre cible' }),
    ).toBeTruthy();
    expect(screen.queryByText('Nouvelle séance')).toBeNull();
    expect(screen.queryByText('Composer une liste')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Continuer vers Composer/i }),
    );
    expect(
      screen.getByRole('heading', { name: 'Composez votre liste' }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: /Continuer vers Planifier/i }),
    );
    expect(
      screen.getByRole('heading', { name: 'Planifiez votre séance' }),
    ).toBeTruthy();
  });

  it("never renders the residual 'Comptes précis (ABM)' button (criterion 1)", () => {
    render(
      <NewSessionView
        {...baseProps()}
        onOpenAccountSearch={noop}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Comptes précis (ABM)' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mode ABM' })).toBeNull();
  });

  it('shows the live preview count in plain terrain language', () => {
    const preview = [
      {
        sf_contact_id: '003a',
        sf_account_id: '001a',
        contact_name: 'Alice Martin',
        account_name: 'Acme',
        phone: '0102030405',
      },
    ];
    render(
      <NewSessionView
        filters={emptyFilterTree()}
        onFiltersChange={noop}
        contactLimit={100}
        onContactLimitChange={noop}
        maxPerCompany={null}
        onMaxPerCompanyChange={noop}
        loading={false}
        previewLoading={false}
        matchCount={null}
        matchCountCapped={false}
        matchCountLoading={false}
        matchCountError={null}
        error={null}
        preview={preview}
        dedup={[]}
        previewTruncated={false}
        presets={[]}
        presetsLoading={false}
        savingPreset={false}
        currentUserId="user-1"
        onBack={noop}
        onLoadPreset={noop}
        onSavePreset={noop}
        onDeletePreset={noop}
        onCreate={noop}
        initialStep={1}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Aperçu — 1 contact trouvé' }),
    ).toBeTruthy();
  });

  it('never renders a manual preview button — the list refreshes on its own', () => {
    render(<NewSessionView {...baseProps()} />);
    expect(
      screen.queryByRole('button', { name: 'Aperçu de la liste' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prévisualiser' })).toBeNull();
  });

  it("shows a 'Mise à jour…' status while a refresh is in flight", () => {
    render(<NewSessionView {...baseProps([], true)} initialStep={1} />);
    expect(screen.getByText('Mise à jour…')).toBeTruthy();
  });

  it('keeps the preview table visible while a ceiling change reloads', () => {
    const alice: ContactPreview = {
      sf_contact_id: '003a',
      sf_account_id: '001a',
      contact_name: 'Alice Martin',
      account_name: 'Acme',
      phone: '0102030405',
    };
    const { rerender } = render(
      <NewSessionView {...baseProps([alice])} initialStep={1} />,
    );
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Aperçu — 1 contact trouvé' }),
    ).toBeTruthy();

    rerender(<NewSessionView {...baseProps([], true)} initialStep={1} />);

    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Aperçu — 1 contact trouvé' }),
    ).toBeTruthy();
    expect(screen.getByText('Mise à jour…')).toBeTruthy();
    expect(screen.queryByText('Aucun contact trouvé')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Mise à jour…' }),
    ).toBeNull();
  });

  it('keeps existing selections across a preview refresh and only drops contacts that disappeared', async () => {
    const user = userEvent.setup();
    const alice: ContactPreview = {
      sf_contact_id: '003a',
      sf_account_id: '001a',
      contact_name: 'Alice Martin',
      account_name: 'Acme',
      phone: '0102030405',
    };
    const bruno: ContactPreview = {
      sf_contact_id: '003b',
      sf_account_id: '001a',
      contact_name: 'Bruno Martin',
      account_name: 'Acme',
      phone: '0102030406',
    };
    const chloe: ContactPreview = {
      sf_contact_id: '003c',
      sf_account_id: '001b',
      contact_name: 'Chloé Dupont',
      account_name: 'Beta',
      phone: '0102030407',
    };

    const isChecked = (label: string) =>
      (screen.getByLabelText(label) as HTMLInputElement).checked;

    const { rerender } = render(
      <NewSessionView {...baseProps([alice, bruno])} initialStep={1} />,
    );

    // Chargement initial : tout est sélectionné par défaut.
    expect(isChecked('Sélectionner Alice Martin')).toBe(true);
    expect(isChecked('Sélectionner Bruno Martin')).toBe(true);

    // L'utilisateur désélectionne manuellement Bruno.
    await user.click(screen.getByLabelText('Sélectionner Bruno Martin'));
    expect(isChecked('Sélectionner Bruno Martin')).toBe(false);

    // Un refresh live (nouveau filtre) renvoie Alice + un nouveau contact,
    // Bruno a disparu de la liste.
    rerender(<NewSessionView {...baseProps([alice, chloe])} initialStep={1} />);

    // Alice reste sélectionnée (sa sélection manuelle/initiale survit),
    // le nouveau contact n'est pas auto-sélectionné, Bruno a disparu.
    expect(isChecked('Sélectionner Alice Martin')).toBe(true);
    expect(screen.queryByLabelText('Sélectionner Bruno Martin')).toBeNull();
    expect(isChecked('Sélectionner Chloé Dupont')).toBe(false);
  });
});

describe('NewSessionView — 3-step wizard workflow & reversibility', () => {
  const contactA: ContactPreview = {
    sf_contact_id: '003_1',
    sf_account_id: '001_1',
    contact_name: 'Alice Martin',
    account_name: 'Acme',
    phone: '0102030405',
  };
  const contactB: ContactPreview = {
    sf_contact_id: '003_2',
    sf_account_id: '001_2',
    contact_name: 'Bob Durand',
    account_name: 'Beta',
    phone: '0102030406',
  };

  it('preserves all state across back and forward navigation in the 3 steps (reversibility)', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(
      <NewSessionView
        {...baseProps([contactA, contactB])}
        filters={{
          ...emptyFilterTree(),
          entreprise: {
            ...emptyFilterTree().entreprise,
            tiers: ['A'],
          },
        }}
        onCreate={onCreate}
      />,
    );

    // 1. On est à l'Étape 1 (Cibler)
    expect(screen.getByRole('button', { name: /Tier A & B/i })).toBeTruthy();
    await user.click(
      screen.getAllByRole('button', { name: /Continuer vers Composer/i })[0],
    );

    // 2. On est à l'Étape 2 (Composer)
    expect(screen.getByText('2 sélectionnés / 2')).toBeTruthy();
    // Désélectionner Bob
    const bobCheckbox = screen.getByLabelText('Sélectionner Bob Durand');
    await user.click(bobCheckbox);
    expect((bobCheckbox as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('1 sélectionné / 2')).toBeTruthy();

    // Avancer vers Planifier
    await user.click(
      screen.getAllByRole('button', { name: /Continuer vers Planifier/i })[0],
    );

    // 3. On est à l'Étape 3 (Planifier)
    const nameInput = screen.getByLabelText('Nom de la séance');
    await user.type(nameInput, 'Campagne Q4');
    expect((nameInput as HTMLInputElement).value).toBe('Campagne Q4');

    // 4. RÉVERSIBILITÉ : Revenir à l'Étape 1 (Cibler) via le Stepper
    await user.click(
      screen.getByRole('button', { name: /Étape 1: Cibler/i }),
    );
    expect(screen.getByRole('button', { name: /Tier A & B/i })).toBeTruthy();
    // Revenir à l'Étape 2 (Composer) via le Stepper
    await user.click(
      screen.getByRole('button', { name: /Étape 2: Composer/i }),
    );
    // VÉRIFICATION : Bob est toujours désélectionné (state intact !)
    expect(screen.getByText('1 sélectionné / 2')).toBeTruthy();
    expect(
      (screen.getByLabelText('Sélectionner Bob Durand') as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText('Sélectionner Alice Martin') as HTMLInputElement)
        .checked,
    ).toBe(true);

    // Revenir à l'Étape 3 (Planifier) via le Stepper
    await user.click(
      screen.getByRole('button', { name: /Étape 3: Planifier/i }),
    );
    // VÉRIFICATION : Le nom de séance est toujours 'Campagne Q4' (state intact !)
    expect(
      (screen.getByLabelText('Nom de la séance') as HTMLInputElement).value,
    ).toBe('Campagne Q4');

    // Lancer la séance
    await user.click(
      screen.getAllByRole('button', { name: 'Lancer la séance' })[0],
    );
    expect(onCreate).toHaveBeenCalledWith(
      'Campagne Q4',
      [contactA],
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'prospection',
      [],
    );
  });

  it('enforces progression gates: step 1 requires filters/preview, step 2 requires selected contacts', async () => {
    render(
      <NewSessionView
        {...baseProps([])}
        filters={emptyFilterTree()}
        matchCount={null}
      />,
    );

    // 1. À vide (0 filtre, 0 preview, 0 match) : bouton continuer désactivé
    const continueBtn = screen.getAllByRole('button', {
      name: /Continuer vers Composer/i,
    })[0];
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true);

    // Clic stepper vers étape 2 ou 3 : désactivé / inaccessible
    const step2Btn = screen.getByRole('button', { name: /Étape 2: Composer/i });
    expect((step2Btn as HTMLButtonElement).disabled).toBe(true);

    const step3Btn = screen.getByRole('button', {
      name: /Étape 3: Planifier/i,
    });
    expect((step3Btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks step 3 when 0 contacts are selected in step 2, but allows backward navigation', async () => {
    const user = userEvent.setup();
    render(
      <NewSessionView
        {...baseProps([contactA])}
        initialStep={1}
      />,
    );

    // Étape 2 avec 1 contact sélectionné
    expect(screen.getByText('1 sélectionné / 1')).toBeTruthy();
    // Tout désélectionner
    await user.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.getByText('0 sélectionné / 1')).toBeTruthy();

    // Le bouton Continuer vers Planifier est désactivé
    const nextBtn = screen.getAllByRole('button', {
      name: /Continuer vers Planifier/i,
    })[0];
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);

    // Le bouton Stepper Étape 3 est désactivé
    const step3Btn = screen.getByRole('button', {
      name: /Étape 3: Planifier/i,
    });
    expect((step3Btn as HTMLButtonElement).disabled).toBe(true);

    // Mais le retour vers l'étape 1 (Cibler) est TOUJOURS accessible
    const step1Btn = screen.getByRole('button', { name: /Étape 1: Cibler/i });
    expect((step1Btn as HTMLButtonElement).disabled).toBe(false);
    await user.click(step1Btn);
    expect(screen.getByRole('button', { name: /Tier A & B/i })).toBeTruthy();
  });

  it('keeps the primary CTA in the recap sidebar, not in step footers', async () => {
    const user = userEvent.setup();
    render(
      <NewSessionView
        {...baseProps([contactA])}
        filters={{
          ...emptyFilterTree(),
          entreprise: {
            ...emptyFilterTree().entreprise,
            tiers: ['A'],
          },
        }}
      />,
    );

    const continueComposer = screen.getByRole('button', {
      name: /Continuer vers Composer/i,
    });
    expect(continueComposer.closest('.calls-wizard-recap')).toBeTruthy();
    expect(document.querySelector('.calls-wizard-nav')).toBeNull();

    await user.click(continueComposer);
    expect(
      screen
        .getByRole('button', { name: /Continuer vers Planifier/i })
        .closest('.calls-wizard-recap'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Précédent : Cibler/i })
        .closest('.calls-wizard-nav'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Continuer vers Planifier/i })
        .closest('.calls-wizard-nav'),
    ).toBeNull();
  });

  it('accurately displays active filter and audience counters in the lateral recap', () => {
    render(
      <NewSessionView
        {...baseProps([contactA, contactB])}
        filters={{
          ...emptyFilterTree(),
          entreprise: {
            ...emptyFilterTree().entreprise,
            tiers: ['A', 'B'],
          },
          contact: {
            ...emptyFilterTree().contact,
            fonctions: ['direction_generale'],
          },
        }}
        matchCount={120}
      />,
    );

    // Récapitulatif :
    // Filtres actifs = 2 (1 tier + 1 fonction)
    expect(screen.getByText('Votre sélection')).toBeTruthy();
    expect(screen.getByText('Entreprise :')).toBeTruthy();
    expect(screen.getByText('Contact :')).toBeTruthy();
    // Audience
    expect(screen.getByText('120')).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.textContent?.trim() === '2 / 2'),
    ).toBeTruthy();
  });

  it('navigates back to step 1 when clicking an active filter chip in step 2', async () => {
    const user = userEvent.setup();
    render(
      <NewSessionView
        {...baseProps([contactA])}
        filters={{
          ...emptyFilterTree(),
          entreprise: {
            ...emptyFilterTree().entreprise,
            tiers: ['A', 'B'],
          },
        }}
        initialStep={1}
      />,
    );

    // On est en Étape 2 (Composer), un chip de filtre actif est affiché
    const chip = screen.getByRole('button', { name: /Tier : A, B/i });
    expect(chip).toBeTruthy();

    // Clic sur le chip de filtre actif -> retour immédiat à l'Étape 1 (Cibler)
    await user.click(chip);
    expect(screen.getByRole('button', { name: /Tier A & B/i })).toBeTruthy();
  });

  it('splits the planifier step into Informations, Équipe and Découpage cards', () => {
    render(
      <NewSessionView
        {...baseProps([contactA])}
        team={[{ user_id: 'user-2', label: 'Alice', sf_user_id: '005A' }]}
        onCreateAudience={vi.fn()}
        initialStep={2}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Informations' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Équipe' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Découpage' })).toBeTruthy();
    expect(document.querySelector('.calls-name-form')).toBeNull();
    expect(screen.queryByText(/contacts? sélectionnés?/)).toBeNull();
  });

  it("places Toute l'équipe inside the team chips group, not the card header", () => {
    render(
      <NewSessionView
        {...baseProps([contactA])}
        team={[{ user_id: 'user-2', label: 'Alice', sf_user_id: '005A' }]}
        onCreateAudience={vi.fn()}
        initialStep={2}
      />,
    );

    const group = screen.getByRole('group', { name: 'Collègues' });
    expect(
      within(group).getByRole('button', { name: "Toute l'équipe" }),
    ).toBeTruthy();
    expect(document.querySelector('.calls-plan-card__head')).toBeNull();
    expect(
      screen.getByRole('button', { name: "Toute l'équipe" }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false');
  });
});
