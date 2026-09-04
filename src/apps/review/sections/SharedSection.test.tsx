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

    // Ouvre le dropdown custom et vérifie les destinataires éligibles
    await user.click(screen.getByRole('button', { name: 'Destinataire' }));
    const menu = screen.getByRole('listbox', { name: 'Destinataire' });
    const options = Array.from(menu.querySelectorAll('button'));
    expect(options.map((btn) => btn.textContent)).toEqual([
      'Sélectionner un destinataire…',
      'Destinataire valide',
    ]);

    // Sélectionne, saisit la note et envoie
    await user.click(
      screen.getByRole('option', { name: 'Destinataire valide' }),
    );
    await user.type(screen.getByPlaceholderText('Note optionnelle'), 'Super analyse');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onShare).toHaveBeenCalledWith('789', 'Super analyse');
  });
});
