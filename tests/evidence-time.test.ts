import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceAgeSeconds, timestampMs } from '../lib/evidence-time.ts';

const asOf = '2026-09-03T14:30:00.000Z';

test('computes evidence age across explicit timezones and preserves broker subsecond precision', () => {
  assert.equal(evidenceAgeSeconds('2026-09-03T17:29:30+03:00', asOf), 30);
  assert.equal(evidenceAgeSeconds('2026-09-03T14:30:00.000000000Z', asOf), 0);
  assert.equal(evidenceAgeSeconds('2026-09-03T14:29:00.000Z', asOf), 60);
});

test('invalid, missing, timezone-free, and future evidence fail closed', () => {
  for (const stamp of [undefined, null, '', 'not-a-date', '2026-09-03', '2026-09-03T14:30:00',
    '2026-02-30T14:30:00Z', '2026-09-03T14:30:00.001Z']) {
    assert.equal(evidenceAgeSeconds(stamp, asOf), Infinity, String(stamp));
  }
  assert.equal(evidenceAgeSeconds(asOf, 'invalid'), Infinity);
  assert.equal(evidenceAgeSeconds(asOf, Number.NaN), Infinity);
  assert.equal(Number.isNaN(timestampMs('2026-13-01T00:00:00Z')), true);
});
