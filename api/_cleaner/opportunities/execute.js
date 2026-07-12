import mapping from '../../_crm/mapping.js';
import { fetchSFToken, updateSObjects } from '../../_crm/salesforce.js';
import { journalCleanerAction } from '../core/audit.js';
import { CleanerError } from '../core/errors.js';
import { reserveCommand } from '../core/idempotency.js';
import { evaluateOpportunitySelection, fingerprintsFor } from './preview.js';

const MAX_BATCH = 200;

function invalid(message, status = 422, details) {
  throw new CleanerError('invalid_command', message, status, details);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error, fallback = 'Salesforce write failed.') {
  if (typeof error === 'string' && error) return error;
  if (error && typeof error.message === 'string' && error.message)
    return error.message;
  return fallback;
}

async function updateCommand(context, id, patch) {
  const result = await context.supabase
    .from('cleaner_commands')
    .update(patch)
    .eq('id', id);
  if (result?.error)
    throw new CleanerError(
      'supabase_error',
      'Cleaner command could not be updated.',
      500,
      result.error,
    );
  return result;
}

async function loadPreview(context, previewId) {
  const result = await context.supabase
    .from('cleaner_commands')
    .select('*')
    .eq('id', previewId)
    .eq('actor', context.user.id)
    .maybeSingle();
  if (result?.error)
    throw new CleanerError(
      'supabase_error',
      'Cleaner preview lookup failed.',
      500,
      result.error,
    );
  if (!result?.data || result.data.module_id !== 'opportunities') {
    throw new CleanerError(
      'invalid_preview',
      'Preview introuvable ou non accessible.',
      409,
    );
  }
  const stored = object(result.data.preview) ? result.data.preview : {};
  return {
    row: result.data,
    preview: {
      previewId: String(result.data.id),
      fingerprint: result.data.fingerprint,
      expiresAt: result.data.expires_at || stored.expiresAt,
      changes: stored.changes || {},
      eligible: Array.isArray(stored.eligible) ? stored.eligible : [],
      excluded: Array.isArray(stored.excluded) ? stored.excluded : [],
    },
  };
}

function assertExecuteInput(input) {
  for (const key of ['previewId', 'fingerprint', 'idempotencyKey']) {
    if (typeof input?.[key] !== 'string' || !input[key].trim())
      invalid(`${key} est requis.`, 400, { field: key });
  }
  if (input.idempotencyKey.length > 200)
    invalid('idempotencyKey est trop long.', 400, { field: 'idempotencyKey' });
}

function staleError(message = "Le preview n'est plus applicable.") {
  return new CleanerError('stale_preview', message, 409);
}

function recordsForSalesforce(eligible) {
  const opportunity = mapping.objects.opportunity;
  const fields = opportunity.fields;
  return eligible.map((item) => {
    const record = { id: item.id };
    const changes = {};
    if (item.before.owner_id !== item.after.owner_id)
      changes[fields.ownerId] = item.after.owner_id;
    if (item.before.close_date !== item.after.close_date)
      changes[fields.closeDate] = item.after.close_date;
    if (item.before.stage !== item.after.stage)
      changes[fields.stageName] = item.after.stage;
    if (item.before.type_vente !== item.after.type_vente)
      changes[opportunity.saleTypeField] = item.after.type_vente;
    if (item.before.loss_reason !== item.after.loss_reason)
      changes[opportunity.lossReasonField] = item.after.loss_reason;
    Object.assign(record, changes);
    if (
      item.after.stage === opportunity.closedLostStage &&
      item.after.type_vente
    ) {
      record[opportunity.saleTypeField] = item.after.type_vente;
    }
    return record;
  });
}

function aggregateSalesforceResults(eligible, batches, batchResults) {
  const byId = new Map();
  eligible.forEach((item) =>
    byId.set(item.id, {
      id: item.id,
      success: false,
      errors: ['salesforce_missing_result'],
      before: item.before,
      after: item.after,
    }),
  );
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const response = batchResults[index];
    if (response?.error || !Array.isArray(response?.records)) {
      const message = errorMessage(
        response?.message || response?.error,
        'Salesforce batch failed.',
      );
      batch.forEach((record) => {
        const row = byId.get(record.id);
        if (row) row.errors = [message];
      });
      continue;
    }
    for (const record of response.records) {
      const id = record?.id || record?.Id;
      const row = byId.get(id);
      if (!row) continue;
      const errors = Array.isArray(record.errors) ? record.errors : [];
      row.success = record.success === true;
      row.errors = row.success
        ? []
        : errors.length
          ? errors.map(errorMessage)
          : ['salesforce_record_failed'];
    }
  }
  return [...byId.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => ({
      ...row,
      error: row.success ? null : row.errors.join(' ; '),
    }));
}

function resultFor(preview, idempotencyKey, commandId, results) {
  const updated = results.filter((result) => result.success).length;
  const failed = results.length - updated;
  return {
    previewId: preview.previewId,
    fingerprint: preview.fingerprint,
    idempotencyKey,
    commandId,
    status: failed === 0 ? 'succeeded' : updated === 0 ? 'failed' : 'partial',
    updated,
    failed,
    results,
  };
}

export async function executeOpportunityCommand(context = {}, input = {}) {
  if (!context.user || !context.supabase?.from)
    throw new CleanerError('unauthorized', 'Session X OS requise.', 401);
  assertExecuteInput(input);
  const loaded = await loadPreview(context, input.previewId);
  const preview = loaded.preview;
  if (preview.fingerprint !== input.fingerprint)
    throw new CleanerError(
      'fingerprint_mismatch',
      'Le fingerprint ne correspond pas au preview.',
      409,
    );

  const reservation = await reserveCommand(context.supabase, {
    actorId: context.user.id,
    idempotencyKey: input.idempotencyKey,
    fingerprint: input.fingerprint,
    moduleId: 'opportunities',
    preview: preview,
    expiresAt: preview.expiresAt,
  });
  if (reservation.error) {
    if (reservation.error.code === 'idempotency_collision')
      throw new CleanerError(
        'idempotency_collision',
        reservation.error.message,
        409,
        { commandId: reservation.data?.id },
      );
    throw new CleanerError(
      'supabase_error',
      reservation.error.message || 'Idempotency reservation failed.',
      500,
      reservation.error,
    );
  }
  if (reservation.replay) {
    return reservation.data?.result &&
      Object.keys(reservation.data.result).length
      ? reservation.data.result
      : reservation.data?.result || {};
  }
  const commandId = reservation.data?.id;
  const expiry = Date.parse(preview.expiresAt || '');
  if (
    !Number.isFinite(expiry) ||
    expiry <= (context.now ? new Date(context.now).getTime() : Date.now())
  ) {
    const failure = { error: 'stale_preview', message: 'Le preview a expiré.' };
    await updateCommand(context, commandId, {
      status: 'expired',
      result: failure,
    });
    throw staleError(failure.message);
  }
  await updateCommand(context, commandId, { status: 'running' });

  const current = await evaluateOpportunitySelection(context, {
    ids: preview.eligible.map((item) => item.id),
    changes: preview.changes,
  });
  const currentFingerprint = fingerprintsFor(current.eligible, context);
  const expectedIds = preview.eligible.map((item) => item.id).sort();
  const actualIds = current.eligible.map((item) => item.id).sort();
  if (
    currentFingerprint !== preview.fingerprint ||
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    const failure = {
      error: 'stale_preview',
      message: 'Les données Salesforce ont changé depuis le preview.',
    };
    await updateCommand(context, commandId, {
      status: 'failed',
      result: failure,
    });
    throw staleError(failure.message);
  }

  const tokenLoader = context.fetchSFToken || fetchSFToken;
  let tokenResult;
  try {
    tokenResult = await tokenLoader({
      client: context.supabase,
      userId: context.user.id,
    });
  } catch (error) {
    const failure = {
      error: 'salesforce_auth_error',
      message: errorMessage(error, 'Salesforce token unavailable.'),
    };
    await updateCommand(context, commandId, {
      status: 'failed',
      result: failure,
    });
    throw new CleanerError('salesforce_error', failure.message, 502, failure);
  }
  if (tokenResult?.error || !tokenResult?.accessToken) {
    const failure = {
      error: 'salesforce_auth_error',
      message: tokenResult?.error || 'Salesforce token unavailable.',
    };
    await updateCommand(context, commandId, {
      status: 'failed',
      result: failure,
    });
    throw new CleanerError('salesforce_error', failure.message, 502, failure);
  }

  const records = recordsForSalesforce(current.eligible);
  const batches = [];
  for (let index = 0; index < records.length; index += MAX_BATCH)
    batches.push(records.slice(index, index + MAX_BATCH));
  const updater = context.updateSObjects || updateSObjects;
  const batchResults = [];
  for (const batch of batches) {
    try {
      batchResults.push(
        await updater(
          tokenResult.accessToken,
          mapping.objects.opportunity.name,
          batch,
        ),
      );
    } catch (error) {
      batchResults.push({ error: errorMessage(error) });
    }
  }

  const results = aggregateSalesforceResults(
    current.eligible,
    batches,
    batchResults,
  );
  const result = resultFor(preview, input.idempotencyKey, commandId, results);
  const targets = results.map((record) => ({
    objectType: mapping.objects.opportunity.name,
    sfRecordId: record.id,
    sfOwnerId: record.before.owner_id,
    before: record.before,
    after: record.after,
    success: record.success,
    error: record.error,
  }));

  const audit = context.journalCleanerAction || journalCleanerAction;
  let auditResult;
  try {
    auditResult = await audit(context.supabase, {
      actorId: context.user.id,
      actorLabel: context.profile?.fullName || context.user.email || null,
      moduleId: 'opportunities',
      actionType: 'opportunity_update',
      commandId,
      idempotencyKey: input.idempotencyKey,
      source: 'labo',
      changes: preview.changes,
      targets,
      result,
    });
  } catch (error) {
    auditResult = {
      error: {
        code: 'audit_exception',
        message: errorMessage(error, 'Cleaner audit failed.'),
      },
    };
  }
  if (auditResult?.error || !auditResult?.data) {
    const auditError = auditResult?.error?.message || 'Cleaner audit failed.';
    const failedResult = { ...result, auditError };
    await updateCommand(context, commandId, {
      status: 'failed',
      result: failedResult,
    });
    throw new CleanerError('audit_error', auditError, 502, failedResult);
  }

  await updateCommand(context, commandId, { status: result.status, result });
  return result;
}

export { MAX_BATCH, recordsForSalesforce };
