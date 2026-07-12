#!/usr/bin/env node
import { get, list } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import {
  journalCleanerAction,
  sourceIdFromPathname,
} from '../api/_cleaner/core/audit.js';

const DEFAULT_LIMIT = null;

export function parseArgs(args = []) {
  let limit = DEFAULT_LIMIT;
  let dryRun = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--apply') dryRun = false;
    else if (arg === '--limit') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1)
        throw new Error('--limit must be a positive integer');
      limit = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dryRun, limit };
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectOrDefault(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeTarget(target, changes) {
  if (!target || typeof target !== 'object') return null;
  const sfRecordId = textOrNull(
    target.sfRecordId ?? target.sf_record_id ?? target.id,
  );
  if (!sfRecordId) return null;
  return {
    objectType:
      textOrNull(target.objectType ?? target.object_type) || 'Opportunity',
    sfRecordId,
    sfOwnerId: textOrNull(
      target.sfOwnerId ?? target.sf_owner_id ?? target.owner_id,
    ),
    before: objectOrDefault(target.before ?? target.before_state, {}),
    after: objectOrDefault(target.after ?? target.after_state, changes),
    success: target.success === true,
    error: textOrNull(target.error ?? target.message),
  };
}

export function normalizeLegacyBlob(pathname, payload = {}) {
  const changes = objectOrDefault(payload.changes, {});
  const rawTargets = Array.isArray(payload.opps)
    ? payload.opps
    : Array.isArray(payload.targets)
      ? payload.targets
      : [];
  const targets = rawTargets
    .map((target) => normalizeTarget(target, changes))
    .filter(Boolean);
  const actorId = textOrNull(payload.actorId ?? payload.actor_id);
  return {
    actorId,
    actorLabel: actorId ? null : 'Legacy CRM Cleaner',
    actionType: 'legacy_cleaner_action',
    at: textOrNull(payload.at),
    changes,
    result: {
      source: 'vercel_blob',
      updated: targets.filter((target) => target.success).length,
      failed: targets.filter((target) => !target.success).length,
    },
    source: 'legacy_blob',
    sourceId: sourceIdFromPathname(pathname),
    moduleId: 'opportunities',
    targets,
  };
}

async function readBlobPayload(blobApi, pathname, token) {
  const blob = await blobApi.get(pathname, { access: 'private', token });
  if (!blob) throw new Error(`Blob not found: ${pathname}`);
  if (typeof blob.text === 'function') return JSON.parse(await blob.text());
  const stream = blob.stream || blob;
  return JSON.parse(await new Response(stream).text());
}

async function listHistoryBlobs(blobApi, token) {
  const pathnames = new Set();
  let cursor;
  do {
    const page = await blobApi.list({
      prefix: 'history/',
      token,
      ...(cursor ? { cursor } : {}),
    });
    for (const blob of page.blobs || []) {
      if (
        typeof blob.pathname === 'string' &&
        blob.pathname.startsWith('history/') &&
        blob.pathname.endsWith('.json')
      ) {
        pathnames.add(blob.pathname);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return [...pathnames].sort();
}

function emptyReport({ dryRun, limit }) {
  return {
    blocked: false,
    dryRun,
    limit,
    source: {
      discovered: 0,
      normalized: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
    },
    target: { discovered: 0, inserted: 0, failed: 0 },
    errors: [],
    exitCode: 0,
  };
}

export async function runMigration(options = {}) {
  const args = options.args ?? process.argv.slice(2);
  const { dryRun, limit } = parseArgs(args);
  const env = options.env ?? process.env;
  const injectedClient = Object.prototype.hasOwnProperty.call(
    options,
    'client',
  );
  const missing = ['BLOB_READ_WRITE_TOKEN'];
  if (!injectedClient)
    missing.push('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  const missingEnv = missing.filter((key) => !env[key]);
  const report = emptyReport({ dryRun, limit });
  if (missingEnv.length > 0) {
    return {
      ...report,
      blocked: true,
      reason: `Blocked: missing required environment: ${missingEnv.join(', ')}`,
    };
  }

  const blobApi = options.blobApi ?? { list, get };
  const client = injectedClient
    ? options.client
    : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const pathnames = await listHistoryBlobs(blobApi, env.BLOB_READ_WRITE_TOKEN);
  const selected = limit === null ? pathnames : pathnames.slice(0, limit);
  report.source.discovered = selected.length;

  for (const pathname of selected) {
    let normalized;
    try {
      normalized = normalizeLegacyBlob(
        pathname,
        await readBlobPayload(blobApi, pathname, env.BLOB_READ_WRITE_TOKEN),
      );
    } catch (error) {
      report.source.failed += 1;
      report.errors.push({
        pathname,
        message: String(error?.message || error),
      });
      continue;
    }
    report.source.normalized += 1;
    report.target.discovered += normalized.targets.length;
    report.target.failed += normalized.targets.filter(
      (target) => !target.success,
    ).length;
    if (dryRun) continue;

    const result = await journalCleanerAction(client, normalized);
    if (!result.error) {
      report.source.inserted += 1;
      report.target.inserted += normalized.targets.length;
      continue;
    }
    if (result.error.code === '23505') {
      report.source.skipped += 1;
      continue;
    }
    report.source.failed += 1;
    report.errors.push({
      pathname,
      message: String(result.error.message || result.error),
      code: result.error.code,
    });
  }

  report.exitCode = report.errors.length > 0 ? 1 : 0;
  return report;
}

async function main() {
  try {
    const report = await runMigration();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  } catch (error) {
    console.log(
      JSON.stringify(
        { blocked: false, error: String(error?.message || error), exitCode: 2 },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
