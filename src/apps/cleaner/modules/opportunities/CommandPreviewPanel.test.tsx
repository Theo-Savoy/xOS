// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUsePicklistValues } = vi.hoisted(() => ({
  mockUsePicklistValues: vi.fn(),
}));

vi.mock('../../../crm/usePicklistValues', () => ({
  usePicklistValues: mockUsePicklistValues,
}));

import { CommandPreviewPanel } from './CommandPreviewPanel';

const baseProps = {
  action: 'close-lost' as const,
  selectedCount: 1,
  selectedItems: [{ id: '006000000000001', name: 'Alpha' }],
  saleTypeOptions: ['Catalogue', 'Sur-mesure', 'Conseil'],
  onClose: vi.fn(),
  onPreview: vi.fn(),
  onExecute: vi.fn(),
};

describe('CommandPreviewPanel', () => {
  afterEach(cleanup);
  beforeEach(() => {
    mockUsePicklistValues.mockReset();
    mockUsePicklistValues.mockReturnValue({
      values: [],
      loading: false,
      error: null,
    });
  });

  it('renders Salesforce picklist values and a local free-text option', () => {
    const onPreview = vi.fn();
    mockUsePicklistValues.mockReturnValue({
      values: [
        { label: 'Budget insuffisant', active: true, default: false },
        { label: 'Priorité différente', active: true, default: false },
      ],
      loading: false,
      error: null,
    });

    render(<CommandPreviewPanel {...baseProps} onPreview={onPreview} />);

    expect(mockUsePicklistValues).toHaveBeenCalledWith('', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Type de vente' }));
    fireEvent.click(screen.getByRole('option', { name: 'Catalogue' }));
    expect(mockUsePicklistValues).toHaveBeenLastCalledWith(
      'Raison_de_perte_V2__c',
      'Catalogue',
    );
    expect(
      screen.getByRole('button', { name: 'Raison de perte' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raison de perte' }));
    expect(
      screen.getByRole('option', { name: 'Budget insuffisant' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', { name: 'Priorité différente' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', { name: 'Autre (saisie libre)' }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('option', { name: 'Autre (saisie libre)' }),
    );
    fireEvent.change(screen.getByLabelText('Autre raison de perte'), {
      target: { value: 'Autre motif Salesforce' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Prévisualiser les changements' }),
    );
    expect(onPreview).toHaveBeenCalledWith({
      stage: 'Fermée / Perdue',
      loss_reason: 'Autre motif Salesforce',
    });
  });

  it('falls back to the existing free-text field when the picklist is empty', () => {
    render(<CommandPreviewPanel {...baseProps} />);

    const input = screen.getByLabelText('Raison de perte');
    expect(input.tagName).toBe('INPUT');
    expect(
      screen.queryByRole('button', { name: 'Raison de perte' }),
    ).toBeNull();
  });

  it('falls back to the existing free-text field when the picklist fails', () => {
    mockUsePicklistValues.mockReturnValue({
      values: [],
      loading: false,
      error: 'Salesforce indisponible',
    });

    render(<CommandPreviewPanel {...baseProps} />);

    const input = screen.getByLabelText('Raison de perte');
    expect(input.tagName).toBe('INPUT');
    expect(
      screen.queryByRole('button', { name: 'Raison de perte' }),
    ).toBeNull();
  });

  it('refetches loss reasons when the sale type changes', () => {
    render(<CommandPreviewPanel {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Type de vente' }));
    fireEvent.click(screen.getByRole('option', { name: 'Catalogue' }));
    expect(mockUsePicklistValues).toHaveBeenLastCalledWith(
      'Raison_de_perte_V2__c',
      'Catalogue',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Type de vente' }));
    fireEvent.click(screen.getByRole('option', { name: 'Conseil' }));
    expect(mockUsePicklistValues).toHaveBeenLastCalledWith(
      'Raison_de_perte_V2__c',
      'Conseil',
    );
  });

  it('does not render a native select element', () => {
    mockUsePicklistValues.mockReturnValue({
      values: [{ label: 'Budget insuffisant', active: true, default: false }],
      loading: false,
      error: null,
    });

    const { container } = render(<CommandPreviewPanel {...baseProps} />);

    expect(container.querySelector('select')).toBeNull();
  });

  it('requires a loss reason before asking the server for a preview', () => {
    const onPreview = vi.fn();
    render(<CommandPreviewPanel {...baseProps} onPreview={onPreview} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Prévisualiser les changements' }),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/raison de perte/i);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('does not offer confirmation until preview data exists, and cancel does not write', () => {
    const onPreview = vi.fn();
    const onExecute = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <CommandPreviewPanel
        {...baseProps}
        onPreview={onPreview}
        onExecute={onExecute}
        onClose={onClose}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Confirmer et exécuter' }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('Raison de perte'), {
      target: { value: 'Budget' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Prévisualiser les changements' }),
    );
    expect(onPreview).toHaveBeenCalledWith({
      stage: 'Fermée / Perdue',
      loss_reason: 'Budget',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onExecute).not.toHaveBeenCalled();

    rerender(
      <CommandPreviewPanel
        {...baseProps}
        preview={{
          previewId: '42',
          fingerprint: 'fingerprint',
          expiresAt: '2026-07-13T10:00:00.000Z',
          changes: { stage: 'Fermée / Perdue', loss_reason: 'Budget' },
          eligible: [
            {
              id: '006000000000001',
              reason: 'eligible',
              before: { stage: 'Qualification' },
              after: { stage: 'Fermée / Perdue' },
            },
          ],
          excluded: [],
        }}
        onExecute={onExecute}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Confirmer et exécuter' }),
    ).toBeTruthy();
  });

  it('displays partial results and keeps failed records visible', () => {
    render(
      <CommandPreviewPanel
        {...baseProps}
        result={{
          previewId: '42',
          fingerprint: 'fingerprint',
          idempotencyKey: 'idem-1',
          commandId: 9,
          status: 'partial',
          updated: 1,
          failed: 1,
          results: [
            { id: '006000000000001', success: true, error: null },
            { id: '006000000000002', success: false, error: 'Scope refusé' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/partiel/i);
    expect(screen.getByText('Scope refusé')).toBeTruthy();
    expect(screen.getByText(/idem-1/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /réessayer|relancer/i }),
    ).toBeNull();
  });
});
