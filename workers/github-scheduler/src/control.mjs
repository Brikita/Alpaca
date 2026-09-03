function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stateFor(controlMode) {
  return { schemaVersion: 2, controlMode, paused: controlMode !== 'active',
    entriesPaused: controlMode !== 'active', haltAll: controlMode === 'halt_all' };
}

export function normalizeStoredControl(value) {
  const stored = record(value) ? value : {};
  let mode = 'halt_all';
  if (value === undefined || value === null) mode = 'active';
  else if (stored.schemaVersion === 2 && ['active', 'entries_paused', 'halt_all'].includes(String(stored.controlMode))) {
    mode = stored.controlMode;
  } else if (stored.schemaVersion === undefined && typeof stored.paused === 'boolean') {
    mode = stored.paused ? 'halt_all' : 'active';
  }
  return { ...stateFor(mode), reason: typeof stored.reason === 'string' ? stored.reason : mode === 'active'
      ? 'Automation is scheduled.' : 'Unrecognized control state; all automation is halted.',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : 'system-default',
    runId: typeof stored.runId === 'string' ? stored.runId : null };
}

export function changeAutomationControl(current, action, reason, updatedBy = 'authenticated-operator', runId = null, now = new Date().toISOString()) {
  const mode = action === 'resume' ? 'active' : action === 'halt_all' || current.haltAll ? 'halt_all' : 'entries_paused';
  return { ...stateFor(mode), reason, updatedAt: now, updatedBy, runId };
}
