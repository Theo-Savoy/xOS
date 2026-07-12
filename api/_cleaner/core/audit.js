import { createHash } from 'node:crypto';

const LEGACY_SOURCE = 'legacy_blob';
const DEFAULT_SOURCE = 'labo';
const HISTORY_PAGE_SIZE = 100;

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectOrDefault(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const sfRecordId = textOrNull(
    target.sfRecordId ?? target.sf_record_id ?? target.id,
  );
  if (!sfRecordId) return null;
  return {
    action_journal_id: null,
    object_type:
      textOrNull(target.objectType ?? target.object_type) || 'Opportunity',
    sf_record_id: sfRecordId,
    sf_owner_id: textOrNull(
      target.sfOwnerId ??
        target.sf_owner_id ??
        target.ownerId ??
        target.owner_id,
    ),
    before_state: objectOrDefault(
      target.before ?? target.beforeState ?? target.before_state,
      {},
    ),
    after_state: objectOrDefault(
      target.after ?? target.afterState ?? target.after_state,
      {},
    ),
    success: target.success === true,
    error: textOrNull(target.error ?? target.message),
  };
}

export function sourceIdFromPathname(pathname) {
  const normalized = textOrNull(pathname);
  if (!normalized) throw new TypeError('pathname is required');
  return `${LEGACY_SOURCE}:${createHash('sha256').update(normalized).digest('hex')}`;
}

function normalizedEntry(entry = {}) {
  const source = textOrNull(entry.source) || DEFAULT_SOURCE;
  const actor = textOrNull(entry.actorId ?? entry.actor ?? entry.actor_id);
  const targets = (Array.isArray(entry.targets) ? entry.targets : [])
    .map(normalizeTarget)
    .filter(Boolean);

  return {
    actor,
    actorLabel: textOrNull(entry.actorLabel ?? entry.actor_label),
    source,
    sourceId: textOrNull(entry.sourceId ?? entry.source_id),
    moduleId: textOrNull(entry.moduleId ?? entry.module_id),
    commandId: entry.commandId ?? entry.command_id ?? null,
    idempotencyKey: textOrNull(entry.idempotencyKey ?? entry.idempotency_key),
    actionType:
      textOrNull(entry.actionType ?? entry.action_type) || 'cleaner_action',
    at: textOrNull(entry.at),
    changes: objectOrDefault(entry.changes, {}),
    result: objectOrDefault(entry.result, {}),
    targets,
  };
}

export async function journalCleanerAction(client, entry = {}) {
  const normalized = normalizedEntry(entry);
  if (!normalized.actor && normalized.source !== LEGACY_SOURCE) {
    return {
      data: null,
      error: {
        code: 'actor_required',
        message: 'A new Cleaner action requires an actor.',
      },
    };
  }

  const payload = {
    ...(normalized.at ? { at: normalized.at } : {}),
    actor: normalized.actor,
    actor_label: normalized.actorLabel,
    action_type: normalized.actionType,
    changes: normalized.changes,
    targets: [],
    result: normalized.result,
    source: normalized.source,
    source_id: normalized.sourceId,
    module_id: normalized.moduleId,
    command_id: normalized.commandId,
    idempotency_key: normalized.idempotencyKey,
  };

  const journalResult = await client
    .from('action_journal')
    .insert(payload)
    .select('*')
    .single();
  if (journalResult.error || !journalResult.data) return journalResult;

  if (normalized.targets.length === 0) return journalResult;

  const journalRow = Array.isArray(journalResult.data)
    ? journalResult.data[0]
    : journalResult.data;
  const targetRows = normalized.targets.map((target) => ({
    ...target,
    action_journal_id: journalRow.id,
  }));
  const targetResult = await client
    .from('cleaner_action_targets')
    .insert(targetRows);
  if (targetResult.error)
    return { data: journalResult.data, error: targetResult.error };
  return journalResult;
}

function cursorOffset(cursor) {
  if (!cursor) return 0;
  if (/^\d+$/.test(String(cursor))) return Number(cursor);
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return Number.isInteger(parsed.offset) && parsed.offset >= 0
      ? parsed.offset
      : 0;
  } catch {
    return 0;
  }
}

function makeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

function historyQuery(
  client,
  { moduleId, offset, limit, actorId, targetOwnerId },
) {
  let query = client
    .from('action_journal')
    .select('*, cleaner_action_targets(*)')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    // Scope queries are unioned in memory (actor actions + target-owner
    // actions). Fetch each scope from the beginning so the final page cursor
    // is applied after deduplication and sorting.
    .range(0, offset + limit);
  if (moduleId) query = query.eq('module_id', moduleId);
  if (actorId) query = query.eq('actor', actorId);
  if (targetOwnerId)
    query = query.eq('cleaner_action_targets.sf_owner_id', targetOwnerId);
  return query;
}

export async function listCleanerHistory(client, query = {}) {
  const role = query.role || 'commercial';
  const actorId = textOrNull(query.actorId ?? query.actor_id);
  const sfOwnerId = textOrNull(query.sfOwnerId ?? query.sf_owner_id);
  if (!actorId)
    return {
      data: null,
      error: {
        code: 'actor_required',
        message: 'History scope requires an actor.',
      },
    };

  const limit = Math.min(
    Math.max(Number(query.limit) || 25, 1),
    HISTORY_PAGE_SIZE,
  );
  const offset = cursorOffset(query.cursor ?? query.offset);
  const fetchLimit = limit + 1;
  const queries = [];

  if (role === 'commercial') {
    queries.push(
      historyQuery(client, {
        moduleId: query.moduleId ?? query.module_id,
        offset,
        limit: fetchLimit,
        actorId,
      }),
    );
    if (sfOwnerId) {
      queries.push(
        historyQuery(client, {
          moduleId: query.moduleId ?? query.module_id,
          offset,
          limit: fetchLimit,
          targetOwnerId: sfOwnerId,
        }),
      );
    }
  } else if (role === 'manager' || role === 'admin') {
    queries.push(
      historyQuery(client, {
        moduleId: query.moduleId ?? query.module_id,
        offset,
        limit: fetchLimit,
      }),
    );
  } else {
    return {
      data: null,
      error: { code: 'forbidden', message: 'Unknown Cleaner history role.' },
    };
  }

  const results = await Promise.all(queries);
  const failed = results.find((result) => result?.error);
  if (failed) return { data: null, error: failed.error };

  const teamOwners = new Set(
    (query.teamSfOwnerIds ?? query.team_sf_owner_ids ?? []).filter(Boolean),
  );
  const rows = [
    ...new Map(
      results
        .flatMap((result) => result.data || [])
        .map((row) => [row.id, row]),
    ).values(),
  ]
    .filter((row) => {
      const targets = Array.isArray(row.cleaner_action_targets)
        ? row.cleaner_action_targets
        : [];
      if (role === 'commercial') {
        return (
          row.actor !== null &&
          (row.actor === actorId ||
            targets.some((target) => target.sf_owner_id === sfOwnerId))
        );
      }
      if (teamOwners.size === 0) return true;
      if (row.actor === null) return true;
      return (
        row.actor === actorId ||
        targets.some((target) => teamOwners.has(target.sf_owner_id))
      );
    })
    .sort((a, b) => {
      const dateOrder = String(b.at || '').localeCompare(String(a.at || ''));
      return dateOrder || Number(b.id || 0) - Number(a.id || 0);
    });

  const page = rows.slice(0, limit);
  return {
    data: page,
    error: null,
    nextCursor: rows.length > limit ? makeCursor(offset + limit) : null,
  };
}
