import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDecisionMemories } from '../lib/decision-memory.ts';
import type { OptionScan, OptionScanBatch } from '../lib/option-intelligence.ts';

function scan(capturedAt: string, overrides: Partial<OptionScan> = {}): OptionScan {
  return {
    symbol: 'SPY', capturedAt, expiration: '2026-09-04', status: 'candidate',
    strategy: 'bear_put_spread', confidence: 0.78, thesis: 'Defined-risk directional setup',
    underlyingPrice: 640, atmStrike: 640, callSymbol: 'SPY260904C00640000',
    putSymbol: 'SPY260904P00640000', callMid: 4, putMid: 5,
    modelMovePct: 2.4, impliedMovePct: 1.8, directionalConfidence: 0.76,
    direction: 'bearish', spreadPct: 0.06, quoteAgeSeconds: 8, combinedVolume: 2_000,
    contracts: [], checks: [], ...overrides,
  };
}

function batch(capturedAt: string, current: OptionScan, marketOpen = true): OptionScanBatch {
  return {
    schemaVersion: 1, source: 'alpaca-cli', mode: 'paper', capturedAt, marketOpen,
    targetExpiration: '2026-09-04', universe: ['SPY'], scans: [current],
    leaderSymbol: current.symbol, candidateCount: current.status === 'candidate' ? 1 : 0,
  };
}

test('confirms a setup after two aligned open-market observations', () => {
  const memories = buildDecisionMemories([
    batch('2026-09-02T14:40:00.000Z', scan('2026-09-02T14:40:00.000Z')),
    batch('2026-09-02T14:30:00.000Z', scan('2026-09-02T14:30:00.000Z')),
  ]);
  assert.equal(memories[0].status, 'confirmed');
  assert.equal(memories[0].approved, true);
  assert.equal(memories[0].confirmations, 2);
  assert.equal(memories[0].agreementRatio, 1);
});

test('fails closed for a first isolated candidate', () => {
  const memories = buildDecisionMemories([
    batch('2026-09-02T14:40:00.000Z', scan('2026-09-02T14:40:00.000Z')),
  ]);
  assert.equal(memories[0].status, 'insufficient');
  assert.equal(memories[0].approved, false);
  assert.match(memories[0].rationale, /needs 2 matching/);
});

test('blocks conflicting recent analysis even with two old confirmations', () => {
  const memories = buildDecisionMemories([
    batch('2026-09-02T14:40:00.000Z', scan('2026-09-02T14:40:00.000Z')),
    batch('2026-09-02T14:30:00.000Z', scan('2026-09-02T14:30:00.000Z', { strategy: 'bull_call_spread', direction: 'bullish' })),
    batch('2026-09-02T14:20:00.000Z', scan('2026-09-02T14:20:00.000Z')),
    batch('2026-09-02T14:10:00.000Z', scan('2026-09-02T14:10:00.000Z', { status: 'abstain', strategy: 'abstain' })),
  ]);
  assert.equal(memories[0].confirmations, 2);
  assert.equal(memories[0].agreementRatio, 0.5);
  assert.equal(memories[0].approved, false);
});

test('never approves memory from a closed-market latest scan', () => {
  const memories = buildDecisionMemories([
    batch('2026-09-02T22:00:00.000Z', scan('2026-09-02T22:00:00.000Z'), false),
    batch('2026-09-02T21:50:00.000Z', scan('2026-09-02T21:50:00.000Z'), false),
  ]);
  assert.equal(memories[0].status, 'no_candidate');
  assert.equal(memories[0].approved, false);
  assert.match(memories[0].rationale, /outside the market session/);
});
