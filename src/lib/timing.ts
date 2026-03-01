// Back-timing utilities — pure functions, no side effects
// Used by both Go Live (webapp) and Automator (copy at automator/src/lib/timing.ts)

export interface BlockTiming {
  startedAt: string | null;   // ISO timestamp
  endedAt: string | null;     // ISO timestamp
  actualDurationSec: number | null;
}

/** Seconds elapsed since an ISO timestamp. Returns 0 if null. */
export function elapsedSec(startIso: string | null): number {
  if (!startIso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
}

/** Remaining seconds for current block. Negative = overrun. */
export function blockRemaining(estimatedSec: number, elapsedSec: number): number {
  if (estimatedSec <= 0) return 0;
  return estimatedSec - elapsedSec;
}

/** Total remaining seconds for the show from current block onward. */
export function showRemaining(
  blocks: { estimated_duration_sec: number; actual_duration_sec?: number | null }[],
  currentBlockIdx: number,
  currentBlockElapsedSec: number
): number {
  if (blocks.length === 0 || currentBlockIdx < 0) return 0;

  const current = blocks[currentBlockIdx];
  let total = Math.max(0, current.estimated_duration_sec - currentBlockElapsedSec);

  for (let i = currentBlockIdx + 1; i < blocks.length; i++) {
    total += blocks[i].estimated_duration_sec;
  }
  return total;
}

/** Compute back-times: wall clock time each future block should start. */
export function computeBackTimes(
  blocks: { id: string; estimated_duration_sec: number }[],
  currentBlockIdx: number,
  currentBlockElapsedSec: number,
  nowMs?: number
): Record<string, number> {
  const now = nowMs ?? Date.now();
  const result: Record<string, number> = {};

  if (blocks.length === 0 || currentBlockIdx < 0) return result;

  const current = blocks[currentBlockIdx];
  let accMs = Math.max(0, current.estimated_duration_sec - currentBlockElapsedSec) * 1000;

  for (let i = currentBlockIdx + 1; i < blocks.length; i++) {
    result[blocks[i].id] = now + accMs;
    accMs += blocks[i].estimated_duration_sec * 1000;
  }
  return result;
}

/** Over/under delta for a completed block. Positive = overrun, negative = under. */
export function overUnder(estimatedSec: number, actualSec: number): number {
  return actualSec - estimatedSec;
}

/** Format seconds as MM:SS or H:MM:SS. */
export function formatDuration(totalSec: number): string {
  const abs = Math.abs(Math.floor(totalSec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format a signed delta as +MM:SS or -MM:SS. */
export function formatDelta(deltaSec: number): string {
  const sign = deltaSec >= 0 ? '+' : '-';
  return `${sign}${formatDuration(Math.abs(deltaSec))}`;
}

/** Timer color based on remaining time. */
export function timerColor(remainingSec: number, estimatedSec: number): string {
  if (estimatedSec <= 0) return 'text-white';
  if (remainingSec < 0) return 'text-red-400';
  const ratio = remainingSec / estimatedSec;
  if (ratio < 0.2) return 'text-red-400';
  if (ratio < 0.4) return 'text-yellow-400';
  return 'text-green-400';
}

/** Format a timestamp (ms since epoch) as HH:MM clock time. */
export function formatClockTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
