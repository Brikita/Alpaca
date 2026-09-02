import assert from 'node:assert/strict';
import test from 'node:test';
import { priorTradingSession, selectExpirationFromCalendar } from '../lib/market-calendar.ts';

const sessions = [
  { date: '2026-07-01', open: '09:30', close: '16:00', sessionOpen: '0930', sessionClose: '1600' },
  { date: '2026-07-02', open: '09:30', close: '13:00', sessionOpen: '0930', sessionClose: '1300' },
];

test('moves a holiday-Friday expiration to the last verified session', () => {
  assert.equal(selectExpirationFromCalendar('2026-07-03', sessions), '2026-07-02');
});

test('finds the actual prior trading session instead of assuming weekdays', () => {
  assert.equal(priorTradingSession('2026-07-06', sessions)?.date, '2026-07-02');
});

test('fails closed when no verified session is available', () => {
  assert.throws(() => selectExpirationFromCalendar('2026-06-30', sessions), /No verified trading session/);
});
