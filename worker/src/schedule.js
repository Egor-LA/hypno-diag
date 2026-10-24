import { snapTo11 } from './util.js';

export const DAY = 24 * 3600 * 1000;
export const INTERVAL_DAYS = { full_1w: 7, full_4w: 28, mix_1w: 7 };

// Следующий ретест: от последнего прохождения; если срок уже прошёл, от момента смены.
export function planNext({ mode, lastTs, now, tz, pos = 0, hasFull = true }) {
  const days = INTERVAL_DAYS[mode];
  if (!days) return null;
  let cand = (lastTs ?? now) + days * DAY;
  if (cand <= now) cand = now + days * DAY;
  let kind = mode === 'mix_1w' ? (pos >= 3 ? 'full' : 'short') : 'full';
  if (kind === 'short' && !hasFull) kind = 'full';
  return { next_at: snapTo11(cand, tz, now), next_kind: kind, cycle_pos: pos };
}

// Позиция в цикле mix_1w: недели 1-3 короткие, неделя 4 полная
export function advancePos(mode, pos, sentKind) {
  if (mode !== 'mix_1w') return 0;
  return sentKind === 'full' ? 0 : Math.min(pos + 1, 3);
}

export function posFromSubs(subs) {
  let n = 0;
  for (let i = subs.length - 1; i >= 0 && subs[i].kind === 'short'; i--) n++;
  return Math.min(n, 3);
}
