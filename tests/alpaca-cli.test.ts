import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCommandAllowed, assertPaperEnvironment } from '../lib/alpaca-cli.ts';

test('rejects any live-trading environment', () => {
  assert.throws(
    () => assertPaperEnvironment({ ALPACA_LIVE_TRADE: 'true' }),
    /refuses to run/,
  );
});

test('allows read-only paper commands', () => {
  assert.doesNotThrow(() =>
    assertCommandAllowed(['data', 'option', 'chain', '--underlying-symbol', 'SPY'], {
      ALPACA_LIVE_TRADE: 'false',
    }),
  );
});

test('allows order previews while execution is locked', () => {
  assert.doesNotThrow(() =>
    assertCommandAllowed(['order', 'submit', '--symbol', 'SPY', '--dry-run'], {
      VOLGUARD_EXECUTION_ENABLED: 'false',
    }),
  );
});

test('blocks order submission until paper execution is explicitly unlocked', () => {
  assert.throws(
    () => assertCommandAllowed(['order', 'submit', '--symbol', 'SPY'], {}),
    /execution lock/,
  );
});
