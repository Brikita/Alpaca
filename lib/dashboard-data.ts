// Optional panels must fail independently; a news/control outage cannot hide the account.
export async function readDashboardJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T | null> {
  try {
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}
