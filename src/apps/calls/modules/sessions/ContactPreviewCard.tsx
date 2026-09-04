import type { ReactNode } from 'react';
import { Button, Checkbox, GlassCard, Select, Tag } from '../../../../components/ui';
import {
  CONTACT_LIMIT_OPTIONS,
  CONTACT_LIST_UNLIMITED,
  MAX_PER_COMPANY_OPTIONS,
  type ContactLimit,
  type MaxPerCompany,
} from '../../../../crm';
import { canSelectContact } from '../../selection';
import type { ContactPreview } from '../../types';

function Cell({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string | null;
  className?: string;
}) {
  const tip = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <span
      className={['calls-preview__cell', className].filter(Boolean).join(' ')}
      title={tip || undefined}
    >
      {children}
    </span>
  );
}

export function limitLabel(limit: ContactLimit): string {
  return limit === CONTACT_LIST_UNLIMITED
    ? 'Pas de limite (max 2000)'
    : String(limit);
}

export type ContactPreviewCardProps = {
  preview: ContactPreview[];
  selectedIds: Set<string>;
  selectedCount: number;
  maxPerCompany: MaxPerCompany | null;
  contactLimit: ContactLimit;
  capHint: string | null;
  inSessionOf: Map<string, string>;
  previewLoading: boolean;
  onToggle: (contactId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onContactLimitChange: (limit: ContactLimit) => void;
  onMaxPerCompanyChange: (value: MaxPerCompany | null) => void;
};

export function ContactPreviewCard({
  preview,
  selectedIds,
  selectedCount,
  maxPerCompany,
  contactLimit,
  capHint,
  inSessionOf,
  previewLoading,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onContactLimitChange,
  onMaxPerCompanyChange,
}: ContactPreviewCardProps) {
  if (preview.length === 0) return null;

  return (
    <GlassCard className="calls-preview">
      <div className="calls-preview__header">
        <div className="calls-preview__heading">
          <h3>
            Aperçu — {preview.length} contact
            {preview.length > 1 ? 's' : ''} trouvé
            {preview.length > 1 ? 's' : ''}
          </h3>
          <Tag>
            {selectedCount} sélectionné
            {selectedCount > 1 ? 's' : ''} / {preview.length}
          </Tag>
          {previewLoading && (
            <Tag role="status" aria-live="polite">
              Mise à jour…
            </Tag>
          )}
        </div>
        <div className="calls-preview__actions">
          <Button variant="secondary" onClick={onSelectAll}>
            Tout sélectionner
          </Button>
          <Button variant="secondary" onClick={onDeselectAll}>
            Tout désélectionner
          </Button>
        </div>
      </div>
      <div className="calls-preview__limits">
        <Select
          label="Contacts max"
          options={CONTACT_LIMIT_OPTIONS.map((limit) => ({
            value: String(limit),
            label: limitLabel(limit),
          }))}
          value={String(contactLimit)}
          onChange={(val) => onContactLimitChange(Number(val) as ContactLimit)}
          aria-label="Contacts max"
        />
        <Select
          label="Max / entreprise"
          options={[
            { value: '', label: 'Pas de limite' },
            ...MAX_PER_COMPANY_OPTIONS.map((limit) => ({
              value: String(limit),
              label: `${limit} par entreprise`,
            })),
          ]}
          value={maxPerCompany ? String(maxPerCompany) : ''}
          onChange={(val) =>
            onMaxPerCompanyChange(
              val ? (Number(val) as MaxPerCompany) : null,
            )
          }
          aria-label="Maximum de contacts par entreprise"
        />
      </div>
      {capHint && (
        <p
          className="calls-preview__cap-hint"
          role="status"
          aria-live="polite"
        >
          {capHint}
        </p>
      )}
      <div className="calls-preview__table-wrap">
        <ul className="calls-preview__list">
          <li className="calls-preview__list-header" aria-hidden="true">
            <span className="calls-preview__select" />
            <span>Contact</span>
            <span>Poste</span>
            <span>Entreprise</span>
            <span>Email</span>
            <span>Tél.</span>
            <span>LinkedIn</span>
            <span>Statut</span>
          </li>
          {preview.map((contact) => {
            const dup = inSessionOf.get(contact.sf_contact_id);
            const checked = selectedIds.has(contact.sf_contact_id);
            const blocked =
              !checked &&
              !canSelectContact(
                preview,
                selectedIds,
                contact.sf_contact_id,
                maxPerCompany,
              );
            const phone = contact.phone ?? contact.mobile_phone ?? null;
            return (
              <li
                key={contact.sf_contact_id}
                className={!checked ? 'calls-preview__row--excluded' : undefined}
              >
                <span className="calls-preview__select">
                  <Checkbox
                    checked={checked}
                    disabled={blocked}
                    onChange={() => onToggle(contact.sf_contact_id)}
                    aria-label={`Sélectionner ${contact.contact_name}`}
                  />
                </span>
                <Cell
                  className="calls-preview__name"
                  title={contact.contact_name}
                >
                  <strong>{contact.contact_name}</strong>
                </Cell>
                <Cell
                  className="calls-preview__cell--wrap"
                  title={contact.title}
                >
                  {contact.title ?? '—'}
                </Cell>
                <Cell
                  className="calls-preview__cell--wrap"
                  title={contact.account_name}
                >
                  {contact.account_name ?? '—'}
                </Cell>
                <Cell
                  className="calls-preview__cell--wrap"
                  title={contact.email}
                >
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="calls-preview__email"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </Cell>
                <Cell className="xos-numeric" title={phone}>
                  {phone ?? '—'}
                </Cell>
                {contact.linkedin_url ? (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="calls-preview__linkedin"
                  >
                    LinkedIn
                  </a>
                ) : (
                  <Cell>—</Cell>
                )}
                {dup ? (
                  <Tag
                    variant="alert"
                    className="calls-preview__dup"
                    title={`Déjà en séance — ${dup}`}
                  >
                    Déjà en séance — {dup}
                  </Tag>
                ) : (
                  <Cell>—</Cell>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </GlassCard>
  );
}