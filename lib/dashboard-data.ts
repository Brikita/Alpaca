// Optional panels must fail independently; a news/control outage cannot hide the account.
export async function readDashboardJson<T>(url: string, fetchImpl?: typeof fetch): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const request = fetchImpl ?? globalThis.fetch;
    if (typeof request !== 'function') return null;
    const response = await request(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
