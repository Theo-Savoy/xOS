// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { contactMatchesFonctionPresets } from './fonctionPresetMatch';

describe('contactMatchesFonctionPresets', () => {
  it('shows every contact when no preset is active', () => {
    expect(contactMatchesFonctionPresets('Directeur', [])).toBe(true);
    expect(contactMatchesFonctionPresets(null, [])).toBe(true);
  });

  it('matches titles against the Responsable formation preset', () => {
    expect(
      contactMatchesFonctionPresets('Responsable formation', [
        'responsable_formation',
      ]),
    ).toBe(true);
    expect(
      contactMatchesFonctionPresets('RF', ['responsable_formation']),
    ).toBe(true);
    expect(
      contactMatchesFonctionPresets('Directeur', ['responsable_formation']),
    ).toBe(false);
  });

  it('matches Chargée de formation without treating Directeur as a hit', () => {
    expect(
      contactMatchesFonctionPresets('Chargée de formation', [
        'charge_formation',
      ]),
    ).toBe(true);
    expect(
      contactMatchesFonctionPresets('Directeur', ['charge_formation']),
    ).toBe(false);
  });

  it('ORs several selected presets', () => {
    expect(
      contactMatchesFonctionPresets('Responsable formation', [
        'responsable_formation',
        'charge_formation',
      ]),
    ).toBe(true);
    expect(
      contactMatchesFonctionPresets('Chargée de formation', [
        'responsable_formation',
        'charge_formation',
      ]),
    ).toBe(true);
    expect(
      contactMatchesFonctionPresets('Directeur', [
        'responsable_formation',
        'charge_formation',
      ]),
    ).toBe(false);
  });
});
