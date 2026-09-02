import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';

export interface MarketCalendarSession {
  date: string;
  open: string;
  close: string;
  sessionOpen: string;
  sessionClose: string;
}

interface AlpacaCalendarSession {
  date?: string;
  open?: string;
  close?: string;
  session_open?: string;
  session_close?: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function collectMarketCalendar(
  start: Date,
  end: Date,
  environment: AlpacaEnvironment = process.env,
): Promise<MarketCalendarSession[]> {
  const result = await runAlpaca<AlpacaCalendarSession[]>([
    'calendar', '--start', dateOnly(start), '--end', dateOnly(end),
  ], environment);
  return result.data.flatMap((session) => (
    session.date && session.open && session.close
      ? [{
          date: session.date,
          open: session.open,
          close: session.close,
          sessionOpen: session.session_open ?? session.open.replace(':', ''),
          sessionClose: session.session_close ?? session.close.replace(':', ''),
        }]
      : []
  ));
}

export function selectExpirationFromCalendar(
  preferredExpiration: string,
  sessions: MarketCalendarSession[],
): string {
  const eligible = sessions
    .map((session) => session.date)
    .filter((date) => date <= preferredExpiration)
    .sort();
  const selected = eligible.at(-1);
  if (!selected) throw new Error('No verified trading session is available for the target expiration week.');
  return selected;
}

export function priorTradingSession(
  expiration: string,
  sessions: MarketCalendarSession[],
): MarketCalendarSession | null {
  return sessions
    .filter((session) => session.date < expiration)
    .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}
