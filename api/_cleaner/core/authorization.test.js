import { describe, expect, it } from 'vitest';
import {
  authorizeContext,
  capabilitiesForRole,
  scopeOpportunityItems,
} from './authorization.js';

describe('Cleaner authorization', () => {
  it('exposes read-only self capabilities for a commercial', () => {
    expect(capabilitiesForRole('commercial')).toMatchObject({
      canViewTeam: false,
      canReadOwn: true,
      canReassign: false,
      canBulkEdit: false,
      canBulkClose: false,
      canManageRules: false,
    });
  });

  it('exposes team read capabilities without write capabilities for managers and admins', () => {
    for (const role of ['manager', 'admin']) {
      expect(capabilitiesForRole(role)).toMatchObject({
        canViewTeam: true,
        canReadOwn: true,
        canReassign: false,
        canBulkEdit: false,
        canBulkClose: false,
      });
    }
  });

  it('rejects an absent user and an unknown role with structured statuses', () => {
    expect(authorizeContext({ role: 'commercial' })).toMatchObject({
      ok: false,
      status: 401,
      error: 'unauthorized',
    });
    expect(
      authorizeContext({ user: { id: 'u' }, role: 'director' }),
    ).toMatchObject({
      ok: false,
      status: 403,
      error: 'forbidden',
    });
  });

  it('cannot widen commercial scope with query parameters', () => {
    const context = {
      user: { id: 'u' },
      role: 'commercial',
      sfUserId: 'sf-self',
      teamSfUserIds: ['sf-self', 'sf-other'],
    };
    const items = [
      { id: 'one', owner_id: 'sf-self' },
      { id: 'two', owner_id: 'sf-other' },
    ];

    expect(
      scopeOpportunityItems(items, context, { ownerId: 'sf-other' }),
    ).toEqual([items[0]]);
  });

  it('uses the explicit team owner ids for manager scope', () => {
    expect(
      scopeOpportunityItems(
        [
          { id: 'one', owner_id: 'sf-a' },
          { id: 'two', owner_id: 'sf-b' },
          { id: 'three', owner_id: 'sf-outside' },
        ],
        {
          user: { id: 'manager' },
          role: 'manager',
          teamSfUserIds: ['sf-a', 'sf-b'],
        },
      ).map((item) => item.id),
    ).toEqual(['one', 'two']);
  });
});
