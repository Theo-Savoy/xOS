import { verifyJWT, respond } from '../_auth.js';
import { getServiceClient } from '../_calls/http.js';
import { fetchSFToken } from '../_crm/salesforce.js';

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*__c$/;
const CACHE_TTL_MS = 60 * 60 * 1000;
const picklistCache = new Map();

export function __resetPicklistCache() {
  picklistCache.clear();
}

function noStore(status, body) {
  const response = respond(status, body);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function isValidForController(validFor, controllingValueIndex) {
  const bytes = Buffer.from(validFor, 'base64');
  const byte = bytes[Math.floor(controllingValueIndex / 8)];
  if (byte === undefined) return false;
  return (byte & (0x80 >> (controllingValueIndex % 8))) !== 0;
}

export async function GET(request) {
  const user = await verifyJWT(request);
  if (!user) return noStore(401, { error: 'unauthorized' });

  const searchParams = new URL(request.url).searchParams;
  const field = searchParams.get('field');
  const controllingValue = searchParams.get('controllingValue');
  if (!field) return noStore(400, { error: 'missing_field' });
  if (field.length > 80 || !FIELD_NAME.test(field))
    return noStore(400, { error: 'invalid_field' });

  const now = Date.now();
  const cacheKey = `${field}:${controllingValue ?? ''}`;
  const cached = picklistCache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL_MS)
    return noStore(200, cached.data);
  if (cached) picklistCache.delete(cacheKey);

  const client = getServiceClient();
  if (!client) return noStore(500, { error: 'service_unavailable' });

  const tokenResult = await fetchSFToken({ client, userId: user.id });
  if (tokenResult?.error || !tokenResult?.accessToken)
    return noStore(502, {
      error: tokenResult?.error || 'sf_auth_error',
    });

  const instanceUrl = process.env.SF_INSTANCE_URL;
  if (!instanceUrl) return noStore(500, { error: 'sf_missing_instance_url' });

  let response;
  try {
    response = await fetch(
      `${instanceUrl}/services/data/v67.0/sobjects/Opportunity/describe`,
      {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return noStore(502, { error: 'sf_describe_failed' });
  }
  if (!response.ok) return noStore(502, { error: 'sf_describe_failed' });

  let describe;
  try {
    describe = await response.json();
  } catch {
    return noStore(502, { error: 'sf_describe_invalid_response' });
  }
  const describedField = Array.isArray(describe?.fields)
    ? describe.fields.find((item) => item?.name === field)
    : null;
  if (!describedField) return noStore(404, { error: 'field_not_found' });

  const controllerField = describedField.controllerName
    ? describe.fields.find(
        (item) => item?.name === describedField.controllerName,
      )
    : null;
  const controllerValues = Array.isArray(controllerField?.picklistValues)
    ? controllerField.picklistValues
    : [];
  const controllingValueIndex =
    controllingValue !== null && controllerField
      ? controllerValues.findIndex(
          (value) =>
            value?.value === controllingValue ||
            value?.label === controllingValue,
        )
      : -1;
  const dependents = describedField.controllerName
    ? describe.fields
        .filter(
          (item) =>
            item?.name !== field &&
            item?.controllerName === describedField.controllerName,
        )
        .map((item) => item.name)
        .filter((name) => typeof name === 'string')
    : [];

  const data = {
    field,
    values: (Array.isArray(describedField.picklistValues)
      ? describedField.picklistValues
      : []
    )
      .filter((value) => value?.active === true)
      .filter(
        (value) =>
          controllingValue === null ||
          typeof value?.validFor !== 'string' ||
          (controllingValueIndex >= 0 &&
            isValidForController(value.validFor, controllingValueIndex)),
      )
      .map((value) => ({
        label: String(value.label ?? value.value ?? ''),
        active: true,
        default: value.defaultValue === true,
      })),
    controllerName: describedField.controllerName ?? null,
    controllingValue,
    dependents,
    cachedAt: new Date(now).toISOString(),
  };
  picklistCache.set(cacheKey, { data, ts: now });
  return noStore(200, data);
}
