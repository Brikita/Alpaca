// Broker timestamps must identify an instant, not depend on the runner's local timezone.
export function timestampMs(value: unknown): number {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  ) return Number.NaN;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    return Number.NaN;
  }
  return Date.parse(value);
}

// Infinity is an internal fail-closed sentinel. Do not serialize it as usable evidence.
export function evidenceAgeSeconds(timestamp: unknown, asOf: string | number = Date.now()): number {
  const captured = timestampMs(timestamp);
  const current = typeof asOf === 'number' ? asOf : timestampMs(asOf);
  if (!Number.isFinite(captured) || !Number.isFinite(current) || captured > current) {
    return Number.POSITIVE_INFINITY;
  }
  return (current - captured) / 1000;
}
