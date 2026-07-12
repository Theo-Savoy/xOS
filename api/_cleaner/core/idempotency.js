const DUPLICATE_CODE = '23505';

function invalid(message) {
  return {
    data: null,
    error: { code: 'invalid_command', message },
    reserved: false,
    replay: false,
  };
}

export async function reserveCommand(client, options = {}) {
  const actorId = options.actorId;
  const idempotencyKey = options.idempotencyKey;
  const fingerprint = options.fingerprint;
  if (!actorId) return invalid('actorId is required');
  if (!idempotencyKey) return invalid('idempotencyKey is required');
  if (!fingerprint) return invalid('fingerprint is required');

  const payload = {
    actor: actorId,
    idempotency_key: idempotencyKey,
    fingerprint,
    module_id: options.moduleId ?? options.module_id ?? 'opportunities',
    status: 'reserved',
    preview: options.preview ?? {},
    expires_at: options.expiresAt ?? options.expires_at ?? null,
    result: {},
  };
  const inserted = await client
    .from('cleaner_commands')
    .insert(payload)
    .select('*')
    .single();
  if (!inserted.error)
    return { data: inserted.data, error: null, reserved: true, replay: false };
  if (inserted.error.code !== DUPLICATE_CODE) {
    return {
      data: inserted.data ?? null,
      error: inserted.error,
      reserved: false,
      replay: false,
    };
  }

  const existing = await client
    .from('cleaner_commands')
    .select('*')
    .eq('actor', actorId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing.error)
    return {
      data: null,
      error: existing.error,
      reserved: false,
      replay: false,
    };
  if (!existing.data) {
    return {
      data: null,
      error: {
        code: 'reservation_lost',
        message: 'The idempotency reservation disappeared.',
      },
      reserved: false,
      replay: false,
    };
  }
  if (existing.data.fingerprint !== fingerprint) {
    return {
      data: existing.data,
      error: {
        code: 'idempotency_collision',
        message: 'The idempotency key belongs to another command fingerprint.',
      },
      reserved: false,
      replay: false,
    };
  }
  return { data: existing.data, error: null, reserved: false, replay: true };
}
