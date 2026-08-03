import { describe, expect, it } from 'vitest';
import { loadDialerConfig } from './config.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv(overrides = {}) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

describe('loadDialerConfig', () => {
  it('throws when TELNYX_ENV is invalid', () => {
    resetEnv({ TELNYX_ENV: 'staging' });
    expect(() => loadDialerConfig()).toThrow(/TELNYX_ENV/);
  });

  it('defaults to dev when NODE_ENV is not production', () => {
    resetEnv({
      TELNYX_ENV: '',
      NODE_ENV: 'test',
      TELNYX_API_KEY_DEV: 'KEY_DEV',
      WEBHOOK_TELNYX_PUBLIC_KEY: 'PK',
    });
    const cfg = loadDialerConfig();
    expect(cfg.env).toBe('dev');
    expect(cfg.isDryRun).toBe(false);
    expect(cfg.apiKey).toBe('KEY_DEV');
  });

  it('defaults to prod when NODE_ENV is production', () => {
    resetEnv({
      TELNYX_ENV: '',
      NODE_ENV: 'production',
      TELNYX_API_KEY_PROD: 'KEY_PROD',
      WEBHOOK_TELNYX_PUBLIC_KEY: 'PK',
    });
    const cfg = loadDialerConfig();
    expect(cfg.env).toBe('prod');
    expect(cfg.apiKey).toBe('KEY_PROD');
  });

  it('throws when dev API key missing (fail-closed)', () => {
    resetEnv({
      TELNYX_ENV: 'dev',
      TELNYX_API_KEY_DEV: '',
      WEBHOOK_TELNYX_PUBLIC_KEY: 'PK',
    });
    expect(() => loadDialerConfig()).toThrow(/TELNYX_API_KEY_DEV/);
  });

  it('dry-run: never requires real API key', () => {
    resetEnv({
      TELNYX_ENV: 'dryrun',
      TELNYX_API_KEY_DEV: '',
      TELNYX_API_KEY_PROD: '',
      WEBHOOK_TELNYX_PUBLIC_KEY: '',
    });
    const cfg = loadDialerConfig();
    expect(cfg.env).toBe('dryrun');
    expect(cfg.isDryRun).toBe(true);
    expect(cfg.apiKey).toBe('DRYRUN_KEY');
  });

  it('throws when webhook public key missing in prod/dev', () => {
    resetEnv({
      TELNYX_ENV: 'dev',
      TELNYX_API_KEY_DEV: 'KEY',
      WEBHOOK_TELNYX_PUBLIC_KEY: '',
    });
    expect(() => loadDialerConfig()).toThrow(/WEBHOOK_TELNYX_PUBLIC_KEY/);
  });

  it('dry-run does not require webhook key', () => {
    resetEnv({
      TELNYX_ENV: 'dryrun',
      WEBHOOK_TELNYX_PUBLIC_KEY: '',
    });
    expect(() => loadDialerConfig()).not.toThrow();
  });

  it('uses caller ID from env matching the resolved env', () => {
    resetEnv({
      TELNYX_ENV: 'prod',
      TELNYX_API_KEY_PROD: 'KEY',
      TELNYX_CALLER_ID_PROD: '+33-P',
      TELNYX_CALLER_ID_DEV: '+33-D',
      WEBHOOK_TELNYX_PUBLIC_KEY: 'PK',
    });
    const cfg = loadDialerConfig();
    expect(cfg.callerId).toBe('+33-P');
  });

  it('freezes the config object', () => {
    resetEnv({
      TELNYX_ENV: 'dryrun',
      WEBHOOK_TELNYX_PUBLIC_KEY: '',
    });
    const cfg = loadDialerConfig();
    expect(() => {
      cfg.env = 'tampered';
    }).toThrow();
  });

  it('parses tolerance seconds with safe default', () => {
    resetEnv({
      TELNYX_ENV: 'dryrun',
      WEBHOOK_TELNYX_TOLERANCE_SEC: 'not-a-number',
    });
    const cfg = loadDialerConfig();
    expect(cfg.webhookToleranceSec).toBe(300);
  });
});