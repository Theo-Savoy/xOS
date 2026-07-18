import type { ReactNode } from "react";
import { Button, Modal } from "../../components/ui";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={() => !loading && onCancel()} variant="glass">
      <div className="calls-muted">{description}</div>
      <div className="calls-runner-actions">
        <Button onClick={onConfirm} disabled={loading}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
