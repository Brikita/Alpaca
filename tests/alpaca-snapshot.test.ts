import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeSnapshot } from '../lib/alpaca-snapshot.ts';

test('creates a numeric, paper-only snapshot without account identifiers', () => {
  const snapshot = sanitizeSnapshot(
    {
      status: 'ACTIVE', currency: 'USD', cash: '100000', equity: '100000',
      last_equity: '100000', buying_power: '400000', options_buying_power: '100000',
      options_trading_level: 3, account_blocked: false, trading_blocked: false,
    },
    {
      timestamp: '2026-08-29T14:00:00Z', is_open: true,
      next_open: '2026-08-30T13:30:00Z', next_close: '2026-08-29T20:00:00Z',
    },
    [{ symbol: 'SPY', asset_class: 'us_equity', qty: '2', side: 'long', market_value: '1300', cost_basis: '1280', unrealized_pl: '20', unrealized_plpc: '0.015625' }],
    [{ id: 'broker-order-id', client_order_id: 'volguard-1', symbol: 'SPY', qty: '1', side: 'buy', type: 'limit', status: 'new' }],
    '2026-08-29T14:00:05Z',
  );

  assert.equal(snapshot.mode, 'paper');
  assert.equal(snapshot.account.equity, 100000);
  assert.equal(snapshot.positions[0]?.quantity, 2);
  assert.equal(snapshot.openOrders[0]?.clientOrderId, 'volguard-1');
  assert.equal('id' in snapshot.account, false);
  assert.equal(JSON.stringify(snapshot).includes('broker-order-id'), false);
});
