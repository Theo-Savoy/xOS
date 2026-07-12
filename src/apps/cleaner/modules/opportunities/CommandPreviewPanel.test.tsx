// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPreviewPanel } from './CommandPreviewPanel';

const baseProps = {
  action: 'close-lost' as const,
  selectedCount: 1,
  selectedItems: [{ id: '006000000000001', name: 'Alpha' }],
  onClose: vi.fn(),
  onPreview: vi.fn(),
  onExecute: vi.fn(),
};

describe('CommandPreviewPanel', () => {
  afterEach(cleanup);
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
