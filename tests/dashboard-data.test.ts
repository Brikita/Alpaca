import assert from 'node:assert/strict';
import test from 'node:test';
import { readDashboardJson } from '../lib/dashboard-data.ts';

test('optional service failures do not discard successful dashboard data', async () => {
  const mock: typeof fetch = async (url) => {
    if (url === '/automation') throw new Error('offline');
    if (url === '/history') return new Response(null, { status: 503 });
    return Response.json({ available: true });
  };
  const results = await Promise.all(['/account', '/automation', '/history'].map((url) => readDashboardJson(url, mock)));
  assert.deepEqual(results, [{ available: true }, null, null]);
  assert.equal(await readDashboardJson('/invalid', async () => new Response('not json')), null);
});

test('dashboard requests use a portable abort signal', async () => {
  let receivedSignal: AbortSignal | undefined;
  const mock: typeof fetch = async (_url, init) => {
    receivedSignal = init?.signal ?? undefined;
    return Response.json({ available: true });
  };

  assert.deepEqual(await readDashboardJson('/account', mock), { available: true });
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.equal(receivedSignal.aborted, false);
});
