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
  assert.doesNotThrow(() =>
    assertCommandAllowed(['data', 'option', 'latest-quotes', '--symbols', 'SPY260904C00700000'], {
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

test('exit unlock permits only multi-leg orders whose every intent closes', () => {
  const closingLegs = JSON.stringify([
    { symbol: 'GLD260904P00398000', position_intent: 'sell_to_close' },
    { symbol: 'GLD260904P00391000', position_intent: 'buy_to_close' },
  ]);
  assert.doesNotThrow(() =>
    assertCommandAllowed(['order', 'submit', '--legs', closingLegs], {
      VOLGUARD_EXIT_ENABLED: 'paper',
    }),
  );
  const openingLegs = JSON.stringify([
    { symbol: 'GLD260904P00398000', position_intent: 'buy_to_open' },
    { symbol: 'GLD260904P00391000', position_intent: 'sell_to_open' },
  ]);
  assert.throws(
    () => assertCommandAllowed(['order', 'submit', '--legs', openingLegs], {
      VOLGUARD_EXIT_ENABLED: 'paper',
    }),
    /execution lock/,
  );
});
