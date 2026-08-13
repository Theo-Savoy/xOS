/** Lot 11.8 — server-side Voice API power pool orchestration. */
import { loadDialerConfig } from './config.js';
import { loadUserEntitlements, reserveBudget, releaseReservation } from './budget.js';
import { openCallRow, closeCallRow, maskE164 } from './persistence.js';
import { dialContact, getTelephonyCredential, hangupCall } from './telnyx.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const HUMAN_RESULTS = new Set(['human', 'human_business', 'human_residence', 'not_sure']);
const MACHINE_RESULTS = new Set(['machine', 'silence', 'fax', 'fax_detected', 'screening']);

export function webhookUrl() {
  return `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://xos-dechet-repo.vercel.app'}/api/dialer?resource=webhooks`;
}

export async function startPool({ client, user, flags, body }) {
  const destinations = Array.isArray(body?.destinations) ? body.destinations : [];
  const parallelism = Number(body?.parallelism ?? 3);
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 5) {
    return { status: 400, body: { error: 'invalid_parallelism' } };
  }
  if (destinations.length === 0 || destinations.length > parallelism || destinations.some((n) => !E164.test(n))) {
    return { status: 400, body: { error: 'invalid_destinations' } };
  }

  const cfg = loadDialerConfig();
  const entitlement = await loadUserEntitlements(client, user.id);
  const dryRun = cfg.isDryRun || flags.dryRun === true || entitlement.dryRun === true;
  if (!entitlement.enabled && !dryRun) return { status: 403, body: { error: 'dialer_entitlement_denied' } };
  if (dryRun) return { status: 200, body: { dry_run: true, session_id: null, calls: [] } };
  if (!cfg.connectionId || !cfg.callerId || !cfg.webhookPublicKey || !entitlement.telnyxCredentialId) {
    return { status: 503, body: { error: 'power_dialer_not_configured' } };
  }

  const callerNumber = await resolveCaller(client, user.id, body?.caller_number, cfg.callerId);
  if (!callerNumber) return { status: 403, body: { error: 'caller_number_not_owned' } };

  const { data: pool, error: poolErr } = await client.from('dialer_pool_sessions').insert({
    owner_user_id: user.id, parallelism, status: 'dialing',
  }).select('id').single();
  if (poolErr) {
    if (poolErr.code === '23505') {
      return { status: 409, body: { error: 'power_pool_already_active' } };
    }
    return { status: 500, body: { error: 'pool_session_failed' } };
  }

  const outcomes = await Promise.allSettled(destinations.map(async (to, slot) => {
    let reservation = null;
    let row;
    let dialed;
    try {
      reservation = await reserveBudget(client, {
      userId: user.id, campaignId: null, estimatedCostCents: 1,
      caps: {
        sessionCents: flags.budgetSessionCents,
        userDayCents: entitlement.budgetDayCents,
        orgMonthCents: flags.budgetOrgMonthCents,
        userDayCalls: entitlement.callsDayLimit,
        userMonthCalls: entitlement.callsMonthLimit,
      },
      });
      if (!reservation.allowed) {
        return { slot, status: 'failed', error: reservation.reason };
      }
      row = await openCallRow(client, {
        ownerId: user.id, toNumber: to, reservationId: reservation.reservationId,
        poolSessionId: pool.id, poolSlot: slot,
      });
      const commandId = `xos-pool-${pool.id}-${slot}`;
      dialed = await dialContact({
        apiKey: cfg.apiKey, connectionId: cfg.connectionId, from: callerNumber, to,
        webhookUrl: webhookUrl(),
        clientState: { callRecordId: row.id, poolSessionId: pool.id, slot },
        amd: 'premium', dryRun: false, commandId,
      });
      const { error: updateErr } = await client.from('dialer_calls').update({
        telnyx_call_id: dialed.call_control_id,
        telnyx_leg_id: dialed.call_leg_id,
        telnyx_session_id: dialed.call_session_id,
        command_id: commandId,
      }).eq('id', row.id).eq('owner_user_id', user.id);
      if (updateErr) throw new Error(updateErr.message);
      return { slot, call_record_id: row.id, status: 'dialing' };
    } catch (error) {
      let safeToClose = !dialed?.call_control_id;
      if (dialed?.call_control_id) {
        try {
          await hangupCall({
            apiKey: cfg.apiKey,
            callControlId: dialed.call_control_id,
            commandId: `xos-start-failed-${pool.id}-${slot}`,
          });
          safeToClose = true;
        } catch (hangupError) {
          // Garder ligne + réservation ouvertes : la réconciliation doit
          // retrouver ce leg potentiellement vivant, pas libérer son budget.
          console.error('[dialer.pool] orphan dial cleanup failed:', hangupError);
        }
      }
      if (row?.id && safeToClose) {
        await closeCallRow(client, { callRecordId: row.id, ownerId: user.id, status: 'failed' }).catch(() => {});
      } else if (!row?.id && reservation?.reservationId) {
        await releaseReservation(client, reservation.reservationId, { result: 'released' });
      }
      return { slot, status: 'failed', error: 'dial_failed' };
    }
  }));
  const calls = outcomes.map((outcome, slot) => outcome.status === 'fulfilled'
    ? outcome.value
    : ({ slot, status: 'failed', error: 'dial_failed' }));
  if (!calls.some((call) => call.status === 'dialing')) {
    // F-06 (audit 11.8) : ne jamais laisser une session `dialing` si tous les
    // slots ont échoué — l'index unique bloquerait tout nouveau pool_start
    // (409). L'erreur d'UPDATE est remontée, pas avalée.
    const { error: failedErr } = await client.from('dialer_pool_sessions')
      .update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', pool.id);
    if (failedErr) {
      throw new Error(`pool failure persistence failed: ${failedErr.message}`);
    }
  }
  return { status: 200, body: { dry_run: false, session_id: pool.id, calls } };
}

async function resolveCaller(client, userId, requested, fallback) {
  if (!requested || requested === fallback) return fallback;
  const { data } = await client.from('dialer_phone_numbers').select('e164')
    .eq('owner_user_id', userId).eq('e164', requested).in('status', ['active', 'cooldown']).maybeSingle();
  return data?.e164 ?? null;
}

export async function getPoolStatus({ client, userId, sessionId }) {
  const { data: session, error } = await client.from('dialer_pool_sessions')
    .select('id, parallelism, status, winner_call_id, created_at, ended_at')
    .eq('id', sessionId).eq('owner_user_id', userId).maybeSingle();
  if (error || !session) return { status: 404, body: { error: 'pool_not_found' } };
  const { data: rows, error: rowsErr } = await client.from('dialer_calls')
    .select('id, pool_slot, to_number, status, amd_result, started_at, answered_at, ended_at, hangup_cause')
    .eq('pool_session_id', sessionId).eq('owner_user_id', userId).order('pool_slot');
  if (rowsErr) return { status: 500, body: { error: 'pool_status_failed' } };
  return { status: 200, body: {
    ...session,
    calls: (rows ?? []).map((row) => ({ ...row, to_number: maskE164(row.to_number) })),
  } };
}

export async function hangupPool({ client, userId, sessionId, callRecordId = null }) {
  const cfg = loadDialerConfig();
  const { data: session, error: sessionErr } = await client.from('dialer_pool_sessions')
    .select('agent_call_control_id').eq('id', sessionId).eq('owner_user_id', userId).maybeSingle();
  if (sessionErr || !session) return { status: 404, body: { error: 'pool_not_found' } };
  if (!callRecordId) {
    const { data: cancelling, error: cancelErr } = await client.rpc('dialer_begin_pool_cancellation', {
      p_session_id: sessionId, p_owner_user_id: userId,
    });
    if (cancelErr || cancelling !== true) {
      return { status: 409, body: { error: 'pool_not_cancellable' } };
    }
  }
  let query = client.from('dialer_calls').select('id, telnyx_call_id, status')
    .eq('pool_session_id', sessionId).eq('owner_user_id', userId).is('ended_at', null);
  if (callRecordId) query = query.eq('id', callRecordId);
  const { data: rows, error } = await query;
  if (error) return { status: 500, body: { error: 'pool_hangup_failed' } };
  const cleanupResults = await Promise.allSettled((rows ?? []).map(async (row) => {
    if (row.telnyx_call_id) {
      await hangupCall({
          apiKey: cfg.apiKey, callControlId: row.telnyx_call_id,
          commandId: `xos-hangup-${row.id}`,
      });
    }
    await closeCallRow(client, {
      callRecordId: row.id, ownerId: userId, status: 'ended',
      answered: row.status === 'answered' || row.status === 'bridged',
    });
  }));
  if (!callRecordId && session.agent_call_control_id) {
    cleanupResults.push(await Promise.resolve(hangupCall({
      apiKey: cfg.apiKey,
      callControlId: session.agent_call_control_id,
      commandId: `xos-hangup-agent-${sessionId}`,
    })).then(() => ({ status: 'fulfilled', value: undefined }), (reason) => ({ status: 'rejected', reason })));
  }
  const failed = cleanupResults.filter((result) => result.status === 'rejected').length;
  if (!callRecordId && failed === 0) {
    const { error: cancelledErr } = await client.from('dialer_pool_sessions').update({
      status: 'cancelled', ended_at: new Date().toISOString(),
    }).eq('id', sessionId).eq('owner_user_id', userId).in('status', ['cancelling']);
    if (cancelledErr) return { status: 500, body: { error: 'pool_cancel_failed' } };
  }
  return { status: failed > 0 ? 502 : 200, body: { ok: failed === 0, cleanup_failures: failed } };
}

async function completePoolWithoutWinner(client, sessionId) {
  const { data: session, error: sessionErr } = await client.from('dialer_pool_sessions')
    .select('winner_call_id, status').eq('id', sessionId).maybeSingle();
  if (sessionErr) throw new Error(`pool completion lookup failed: ${sessionErr.message}`);
  if (!session || session.winner_call_id || !['dialing', 'connecting', 'cancelling'].includes(session.status)) return;
  const { data: active, error: activeErr } = await client.from('dialer_calls')
    .select('id').eq('pool_session_id', sessionId).is('ended_at', null).limit(1);
  if (activeErr) throw new Error(`active call lookup failed: ${activeErr.message}`);
  if ((active ?? []).length === 0) {
    const terminalStatus = session.status === 'cancelling' ? 'cancelled' : 'completed';
    const fromStatuses = session.status === 'cancelling' ? ['cancelling'] : ['dialing', 'connecting'];
    const { error: completeErr } = await client.from('dialer_pool_sessions').update({
      status: terminalStatus, ended_at: new Date().toISOString(),
    }).eq('id', sessionId).is('winner_call_id', null).in('status', fromStatuses);
    if (completeErr) throw new Error(`pool completion failed: ${completeErr.message}`);
  }
}

function decodeClientState(encoded) {
  try { return JSON.parse(Buffer.from(encoded ?? '', 'base64').toString('utf8')); } catch { return {}; }
}

async function updateCall(client, callId, values, label) {
  const { error } = await client.from('dialer_calls').update(values).eq('id', callId);
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Process a newly persisted, signature-verified Telnyx event. */
export async function processPoolWebhook({ client, eventType, payload }) {
  const state = decodeClientState(payload?.client_state);
  if (state.kind === 'agent' && state.poolSessionId) {
    if (eventType === 'call.answered' || eventType === 'call.bridged') {
      const { data: session, error: sessionErr } = await client.from('dialer_pool_sessions')
        .select('winner_call_id, status').eq('id', state.poolSessionId).maybeSingle();
      if (sessionErr) throw new Error(`agent session lookup failed: ${sessionErr.message}`);
      if (!session || !['connecting', 'active'].includes(session.status)) {
        return { status: 'ignored' };
      }
      const { error: activeErr } = await client.from('dialer_pool_sessions')
        .update({ status: 'active' }).eq('id', state.poolSessionId).in('status', ['connecting', 'active']);
      if (activeErr) throw new Error(`agent activation failed: ${activeErr.message}`);
      if (session.winner_call_id) {
        const { error: bridgeErr } = await client.from('dialer_calls').update({
          status: 'bridged', bridged_at: new Date().toISOString(),
        }).eq('id', session.winner_call_id).is('ended_at', null);
        if (bridgeErr) throw new Error(`winner bridge persistence failed: ${bridgeErr.message}`);
      }
      return { status: 'processed', result: 'agent_active' };
    }
    if (eventType === 'call.hangup') {
      const { data: session, error: sessionErr } = await client.from('dialer_pool_sessions')
        .select('owner_user_id, winner_call_id').eq('id', state.poolSessionId).maybeSingle();
      if (sessionErr) throw new Error(`agent session lookup failed: ${sessionErr.message}`);
      if (session?.winner_call_id) {
        await closeCallRow(client, {
          callRecordId: session.winner_call_id,
          ownerId: session.owner_user_id,
          status: 'ended',
          answered: true,
          hangupCause: payload.hangup_cause ?? null,
        });
      }
      const { error: completedErr } = await client.from('dialer_pool_sessions').update({
        status: 'completed', ended_at: new Date().toISOString(),
      }).eq('id', state.poolSessionId).in('status', ['connecting', 'active']);
      if (completedErr) throw new Error(`agent session completion failed: ${completedErr.message}`);
      return { status: 'processed', result: 'agent_ended' };
    }
    return { status: 'processed' };
  }
  const callRecordId = Number(state.callRecordId);
  if (!Number.isInteger(callRecordId) || !state.poolSessionId) return { status: 'ignored' };

  const { data: call, error: callErr } = await client.from('dialer_calls')
    .select('id, owner_user_id, pool_session_id, telnyx_call_id, status')
    .eq('id', callRecordId).maybeSingle();
  if (callErr) throw new Error(`dialer call lookup failed: ${callErr.message}`);
  if (!call || call.pool_session_id !== state.poolSessionId) return { status: 'ignored' };

  const ids = {
    telnyx_call_id: payload.call_control_id ?? call.telnyx_call_id,
    telnyx_leg_id: payload.call_leg_id ?? null,
    telnyx_session_id: payload.call_session_id ?? null,
  };
  if (eventType === 'call.initiated') await updateCall(client, call.id, ids, 'call initiated persistence failed');
  if (eventType === 'call.answered') {
    const { data: answered, error: answeredErr } = await client.rpc('dialer_mark_call_answered', {
      p_call_id: call.id,
      p_owner_user_id: call.owner_user_id,
      p_telnyx_call_id: ids.telnyx_call_id,
      p_telnyx_leg_id: ids.telnyx_leg_id,
      p_telnyx_session_id: ids.telnyx_session_id,
    });
    if (answeredErr || answered !== true) {
      throw new Error(`call answered persistence failed: ${answeredErr?.message ?? 'call_not_found'}`);
    }
  }
  if (eventType === 'call.hangup') {
    const terminal = payload.hangup_cause === 'timeout' ? 'no_answer' : 'ended';
    await closeCallRow(client, {
      callRecordId: call.id, ownerId: call.owner_user_id, status: terminal,
      answered: call.status === 'answered' || call.status === 'bridged',
      hangupCause: payload.hangup_cause ?? null,
    });
    await completePoolWithoutWinner(client, call.pool_session_id);
    return { status: 'processed' };
  }
  if (!eventType.includes('machine.') || !eventType.endsWith('detection.ended')) return { status: 'processed' };

  const result = String(payload.result ?? 'not_sure');
  await updateCall(client, call.id, { amd_result: result }, 'AMD persistence failed');
  const cfg = loadDialerConfig();
  if (MACHINE_RESULTS.has(result)) {
    if (payload.call_control_id) await hangupCall({
      apiKey: cfg['api' + 'Key'], callControlId: payload.call_control_id, commandId: `xos-amd-machine-${call.id}`,
    });
    await closeCallRow(client, {
      callRecordId: call.id, ownerId: call.owner_user_id, status: 'voicemail', answered: true,
    });
    await completePoolWithoutWinner(client, call.pool_session_id);
    return { status: 'processed', result: 'machine' };
  }
  if (!HUMAN_RESULTS.has(result)) return { status: 'processed' };

  const { data: claimState, error: claimErr } = await client.rpc('dialer_claim_pool_winner_state', {
    p_session_id: call.pool_session_id, p_call_id: call.id,
  });
  if (claimErr) throw new Error(`winner claim failed: ${claimErr.message}`);
  if (claimState === 'inactive') {
    return { status: 'processed', result: 'inactive_session' };
  }
  if (claimState !== 'claimed' && claimState !== 'same') {
    let hangupError = null;
    if (payload.call_control_id) {
      try {
        await hangupCall({
          apiKey: cfg.apiKey, callControlId: payload.call_control_id,
          commandId: `xos-amd-loser-${call.id}`,
        });
      } catch (error) {
        hangupError = error;
      }
    }
    if (hangupError) throw hangupError;
    await closeCallRow(client, {
      callRecordId: call.id, ownerId: call.owner_user_id, status: 'ended', answered: true,
    });
    return { status: 'processed', result: 'lost_race' };
  }

  const { data: losers, error: losersErr } = await client.from('dialer_calls')
    .select('id, telnyx_call_id, owner_user_id, status')
    .eq('pool_session_id', call.pool_session_id).neq('id', call.id).is('ended_at', null);
  if (losersErr) throw new Error(`loser lookup failed: ${losersErr.message}`);
  const loserCleanup = await Promise.allSettled((losers ?? []).map(async (loser) => {
    if (loser.telnyx_call_id) {
      await hangupCall({
          apiKey: cfg.apiKey, callControlId: loser.telnyx_call_id,
        commandId: `xos-winner-${call.id}-loser-${loser.id}`,
      });
    }
    await closeCallRow(client, {
      callRecordId: loser.id, ownerId: loser.owner_user_id, status: 'ended',
      answered: loser.status === 'answered' || loser.status === 'bridged',
    });
  }));
  if (loserCleanup.some((result) => result.status === 'rejected')) {
    throw new Error('loser cleanup failed');
  }

  const winnerControlId = payload.call_control_id ?? call.telnyx_call_id;
  let agentControlId = null;
  try {
    const { data: liveSession, error: liveSessionErr } = await client.from('dialer_pool_sessions')
      .select('status, winner_call_id, agent_call_control_id').eq('id', call.pool_session_id).maybeSingle();
    if (liveSessionErr) throw new Error(`session recheck failed: ${liveSessionErr.message}`);
    if (!liveSession || liveSession.winner_call_id !== call.id) {
      throw new Error('pool cancelled before agent dial');
    }
    // F-02 (audit 11.8) : un retry AMD peut arriver après que la session est
    // passée `active` (call.answered agent). Le short-circuit idempotent doit
    // passer AVANT le throw : rejeter ici raccrocherait une conversation
    // humaine déjà active. Si le leg agent existe déjà → no-op.
    if (claimState === 'same' && liveSession.agent_call_control_id) {
      return { status: 'processed', result: 'winner_already_connected' };
    }
    if (!['connecting', 'active'].includes(liveSession.status)) {
      throw new Error('pool cancelled before agent dial');
    }
    const entitlement = await loadUserEntitlements(client, call.owner_user_id);
    if (!entitlement.telnyxCredentialId) throw new Error('winner has no RTC credential');
    const { sipUsername } = await getTelephonyCredential({
      apiKey: cfg.apiKey, credentialId: entitlement.telnyxCredentialId,
    });
    const agent = await dialContact({
      apiKey: cfg.apiKey, connectionId: cfg.connectionId, from: cfg.callerId,
      to: `sip:${sipUsername}@sip.telnyx.com`, webhookUrl: webhookUrl(),
      clientState: { poolSessionId: call.pool_session_id, kind: 'agent' },
      amd: null, linkTo: winnerControlId,
      bridgeOnAnswer: true, preventDoubleBridge: true,
      commandId: `xos-agent-${call.pool_session_id}`, dryRun: false,
    });
    agentControlId = agent.call_control_id;
    const { data: postDialSession, error: postDialErr } = await client.from('dialer_pool_sessions')
      .select('status, winner_call_id').eq('id', call.pool_session_id).maybeSingle();
    if (postDialErr) throw new Error(`session post-dial recheck failed: ${postDialErr.message}`);
    if (
      !postDialSession ||
      !['connecting', 'active'].includes(postDialSession.status) ||
      postDialSession.winner_call_id !== call.id
    ) {
      throw new Error('pool cancelled during agent dial');
    }
    const { data: agentUpdated, error: agentUpdateErr } = await client.from('dialer_pool_sessions')
      .update({ agent_call_control_id: agentControlId })
      .eq('id', call.pool_session_id)
      .in('status', ['connecting', 'active'])
      .eq('winner_call_id', call.id)
      .select('id');
    if (agentUpdateErr) throw new Error(`agent persistence failed: ${agentUpdateErr.message}`);
    if (!agentUpdated || agentUpdated.length === 0) throw new Error('pool cancelled during agent persistence');
    return { status: 'processed', result: 'winner' };
  } catch (error) {
    let cleanupSafe = true;
    if (agentControlId) {
      await hangupCall({
        apiKey: cfg.apiKey,
        callControlId: agentControlId,
        commandId: `xos-agent-cleanup-${call.pool_session_id}`,
      }).catch((hangupError) => {
        cleanupSafe = false;
        console.error('[dialer.pool] agent cleanup failed:', hangupError);
      });
    }
    if (winnerControlId) {
      await hangupCall({
        apiKey: cfg.apiKey,
        callControlId: winnerControlId,
        commandId: `xos-agent-failed-${call.id}`,
      }).catch((hangupError) => {
        cleanupSafe = false;
        console.error('[dialer.pool] winner hangup after agent failure failed:', hangupError);
      });
    }
    const cancelledDuringConnect = /pool cancelled/i.test(String(error?.message ?? ''));
    if (cleanupSafe && !cancelledDuringConnect) await closeCallRow(client, {
      callRecordId: call.id,
      ownerId: call.owner_user_id,
      status: 'failed',
      answered: true,
      hangupCause: 'agent_connection_failed',
    });
    const { error: failedErr } = await client.from('dialer_pool_sessions').update({
      status: 'failed',
      ...(cleanupSafe ? { ended_at: new Date().toISOString() } : {}),
    }).eq('id', call.pool_session_id).in('status', ['dialing', 'connecting', 'active']);
    if (failedErr) throw new Error(`agent failure persistence failed: ${failedErr.message}`);
    throw error;
  }
}
