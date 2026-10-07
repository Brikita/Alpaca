import type { PaperOrderEvent } from './paper-order.ts';

export interface BrokerActivity {
  id: string;
  activity_type: string;
  symbol?: string;
  qty?: string;
  date?: string;
  status?: string;
}

// A date alone never closes a position: every leg needs broker evidence that
// offsets its entire signed quantity, and must be absent from broker positions.
export function reconcileOptionSettlement(
  entry: PaperOrderEvent,
  activities: BrokerActivity[],
  brokerSymbols: Set<string>,
  recordedAt = new Date().toISOString(),
): PaperOrderEvent | null {
  if (entry.eventType !== 'reconciled' || entry.brokerStatus !== 'filled'
    || entry.filledQuantity !== entry.quantity || entry.exit || entry.filledAveragePrice === null) return null;
  const evidence: NonNullable<PaperOrderEvent['settlement']>['activities'] = [];
  for (const leg of entry.legs) {
    if (brokerSymbols.has(leg.symbol)) return null;
    const rows = [...new Map(activities.filter((activity) => activity.symbol === leg.symbol
      && activity.status === 'executed'
      && ['OPEXP', 'OPEXC', 'OPASN'].includes(activity.activity_type)
      && activity.date && activity.date >= entry.recordedAt.slice(0, 10)
      && activity.date <= recordedAt.slice(0, 10)).map((activity) => [activity.id, activity])).values()];
    const offset = leg.positionIntent === 'buy_to_open' ? -entry.filledQuantity :
      leg.positionIntent === 'sell_to_open' ? entry.filledQuantity : NaN;
    if (!rows.length || rows.some((row) => !row.id || !Number.isFinite(Number(row.qty))
      || Math.sign(Number(row.qty)) !== Math.sign(offset))
      || rows.reduce((sum, row) => sum + Number(row.qty), 0) !== offset) return null;
    for (const row of rows) evidence.push({ id: row.id,
      type: row.activity_type as 'OPEXP' | 'OPEXC' | 'OPASN', symbol: leg.symbol,
      quantity: Number(row.qty), date: row.date! });
  }
  const expired = evidence.every((row) => row.type === 'OPEXP');
  return { ...entry, eventType: 'settled', eventKey: `${entry.clientOrderId}:settled`, recordedAt,
    brokerStatus: expired ? 'expired' : 'exercised_or_assigned',
    settlement: { entryClientOrderId: entry.clientOrderId, activities: evidence,
      outcome: expired ? 'expired' : 'exercise_or_assignment',
      realizedPnl: expired ? -Math.round(entry.filledAveragePrice * 100 * entry.filledQuantity * 100) / 100 : null },
    message: expired
      ? 'All option legs expired according to Alpaca activity records. Entry premium is a realized loss before fees.'
      : 'Option legs settled through exercise or assignment and expiry. Review resulting underlying shares; combined P&L remains unresolved.' };
}
