// Show state machine — valid transitions per the spec
import type { ShowStatus } from './types';

const TRANSITIONS: Record<ShowStatus, ShowStatus[]> = {
  draft: ['ready'],
  ready: ['draft', 'rehearsal', 'live', 'archived'],
  rehearsal: ['ready', 'live'],
  live: ['ready'],
  archived: ['ready'],
};

export function validateTransition(
  from: ShowStatus,
  to: ShowStatus
): { valid: boolean; error?: string } {
  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, error: `Unknown status: ${from}` };
  }
  if (!allowed.includes(to)) {
    return {
      valid: false,
      error: `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

// Fields editable when show is live (only scripts and lower third text)
export function isEditableInLive(
  entityType: 'block' | 'element' | 'action',
  field: string
): boolean {
  if (entityType === 'block') {
    return field === 'script' || field === 'notes';
  }
  if (entityType === 'element') {
    return field === 'title' || field === 'subtitle' || field === 'gt_field_values';
  }
  return false;
}

// Filter update body to only include editable fields when show is live
export function filterLiveEdits(
  entityType: 'block' | 'element' | 'action',
  body: Record<string, unknown>
): { filtered: Record<string, unknown>; blocked: string[] } {
  const filtered: Record<string, unknown> = {};
  const blocked: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (isEditableInLive(entityType, key)) {
      filtered[key] = value;
    } else {
      blocked.push(key);
    }
  }
  return { filtered, blocked };
}
