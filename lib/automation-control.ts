import { evidenceAgeSeconds } from './evidence-time.ts';

export type AutomationMode = 'active' | 'entries_paused' | 'halt_all';

export interface AutomationControlState {
  schemaVersion: 2;
  controlMode: AutomationMode;
  paused: boolean;
  entriesPaused: boolean;
  haltAll: boolean;
  reason: string;
  updatedAt: string | null;
  updatedBy: string;
  runId: string | null;
}

export interface AutomationStatus extends AutomationControlState {
  mode: 'paper';
  observedAt: string;
  exitCadenceMinutes: number;
  entryCadenceMinutes: number;
  dispatchWindow: string;
  dispatchEligibleNow: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stateFor(controlMode: AutomationMode): Pick<AutomationControlState, 'schemaVersion' | 'controlMode' | 'paused' | 'entriesPaused' | 'haltAll'> {
  return { schemaVersion: 2, controlMode, paused: controlMode !== 'active',
    entriesPaused: controlMode !== 'active', haltAll: controlMode === 'halt_all' };
}

export function normalizeStoredControl(value: unknown): AutomationControlState {
  const stored = record(value) ? value : {};
  let mode: AutomationMode = 'halt_all';
  if (value === undefined || value === null) mode = 'active';
  else if (stored.schemaVersion === 2
    && ['active', 'entries_paused', 'halt_all'].includes(String(stored.controlMode))) {
    mode = stored.controlMode as AutomationMode;
  } else if (stored.schemaVersion === undefined && typeof stored.paused === 'boolean') {
    // Preserve the meaning of an existing emergency pause across upgrades.
    mode = stored.paused ? 'halt_all' : 'active';
  }
  return {
    ...stateFor(mode),
    reason: typeof stored.reason === 'string' ? stored.reason : mode === 'active'
      ? 'Automation is scheduled.' : 'Unrecognized control state; all automation is halted.',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : 'system-default',
    runId: typeof stored.runId === 'string' ? stored.runId : null,
  };
}

export function changeAutomationControl(
  current: AutomationControlState,
  action: 'pause' | 'resume' | 'halt_all',
  reason: string,
  updatedBy = 'authenticated-operator',
  runId: string | null = null,
  now = new Date().toISOString(),
): AutomationControlState {
  // A normal pause must never silently undo an existing full halt.
  const mode = action === 'resume' ? 'active' : action === 'halt_all' || current.haltAll ? 'halt_all' : 'entries_paused';
  return { ...stateFor(mode), reason, updatedAt: now, updatedBy, runId };
}

export function parseAutomationStatus(value: unknown): AutomationStatus | null {
  if (!record(value) || value.mode !== 'paper' || value.schemaVersion !== 2
    || !['active', 'entries_paused', 'halt_all'].includes(String(value.controlMode))
    || typeof value.reason !== 'string' || typeof value.observedAt !== 'string'
    || typeof value.dispatchEligibleNow !== 'boolean' || typeof value.dispatchWindow !== 'string'
    || typeof value.exitCadenceMinutes !== 'number' || !Number.isFinite(value.exitCadenceMinutes) || value.exitCadenceMinutes <= 0
    || typeof value.entryCadenceMinutes !== 'number' || !Number.isFinite(value.entryCadenceMinutes) || value.entryCadenceMinutes <= 0
  ) return null;
  const control = normalizeStoredControl(value);
  if (control.paused !== value.paused || control.entriesPaused !== value.entriesPaused || control.haltAll !== value.haltAll) return null;
  return { ...control, mode: 'paper', observedAt: value.observedAt,
    exitCadenceMinutes: value.exitCadenceMinutes, entryCadenceMinutes: value.entryCadenceMinutes,
    dispatchWindow: value.dispatchWindow, dispatchEligibleNow: value.dispatchEligibleNow };
}

export function automationPermission(status: AutomationStatus | null, operation: 'entry' | 'exit', asOf = Date.now()): boolean {
  if (!status || evidenceAgeSeconds(status.observedAt, asOf) > 60 || status.haltAll) return false;
  return operation === 'exit' || !status.entriesPaused;
}

export function automationLabel(status: AutomationStatus | null, asOf = Date.now()): string {
  if (!status || evidenceAgeSeconds(status.observedAt, asOf) > 60) return 'Status unknown';
  if (status.haltAll) return 'All halted';
  if (status.entriesPaused) return 'Entries paused';
  return status.dispatchEligibleNow ? 'Scheduled' : 'Off hours';
}
