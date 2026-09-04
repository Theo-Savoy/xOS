// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SharedSection } from './SharedSection';

describe('SharedSection', () => {
  it('filtre map: et soi-même, et onShare reçoit le bon user_id', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    const team = [
      { user_id: '123', label: 'Theo (soi-même)' },
      { user_id: 'map:456', label: 'Inconnu SF' },
      { user_id: '789', label: 'Destinataire valide' },
    ];

    render(
      <SharedSection
        shared={[]}
        loading={false}
        error={null}
        isManager={true}
        currentUserId="123"
        team={team}
        onShare={onShare}
        onRevoke={vi.fn()}
      />
    );

    // Ouvre le bandeau
    await user.click(screen.getByRole('button', { name: "Partager l'analyse" }));

    // Seul le destinataire valide doit être dans le sélecteur (en plus du placeholder)
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('Sélectionner un destinataire...');
    expect(options[1].textContent).toBe('Destinataire valide');

    // Sélectionne et envoie
    await user.selectOptions(screen.getByRole('combobox'), '789');
    await user.type(screen.getByPlaceholderText('Note optionnelle'), 'Super analyse');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onShare).toHaveBeenCalledWith('789', 'Super analyse');
  });
});
