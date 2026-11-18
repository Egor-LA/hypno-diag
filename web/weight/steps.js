// Порядок экранов опросника по весу. Общий для мини-приложения и сервера.
// Здесь нет блоков и баллов: этот файл публичный.

export const FOLLOWUP_NUMS = [12, 14, 15, 16, 17, 19];
export const NONE = 'Ничего из этого';
const TEXT_KEYS = new Set(['s3_1_text', 's3_3']);

// ans: { ключ: { value, text, skipped } }
export function activeFollowups(ans) {
  return FOLLOWUP_NUMS.filter((n) => Number(ans[`q${n}`]?.value) >= 2);
}

export function screens(ans) {
  const list = ['start'];
  for (let n = 1; n <= 25; n++) list.push(`q${n}`);
  const f = activeFollowups(ans);
  if (f.length) list.push('intro', ...f.map((n) => `f${n}`));
  list.push('s3_1', 's3_1_text', 's3_2', 's3_3', 's4_1', 's4_2', 's4_3', 's4_4');
  return list;
}

const filled = (t) => typeof t === 'string' && t.trim().length > 0;

export function isAnswered(key, ans) {
  const a = ans[key];
  if (key === 'start' || key === 'intro') return true;
  if (!a) return false;
  if (/^q\d+$/.test(key)) return Number.isInteger(a.value) && a.value >= 0 && a.value <= 3;
  if (/^f\d+$/.test(key) || TEXT_KEYS.has(key)) return a.skipped === true || filled(a.text);
  if (key === 's3_1' || key === 's4_2') return typeof a.value === 'string' && a.value.length > 0;
  if (key === 's3_2') return Array.isArray(a.value) && a.value.length > 0;
  if (key === 's4_1') return a.value === 'Нет' || (a.value === 'Да' && filled(a.text));
  if (key === 's4_3' || key === 's4_4') return Array.isArray(a.value) && a.value.length > 0 && (!a.value.includes(NONE) || a.value.length === 1);
  return false;
}

export function firstIncomplete(ans) {
  return screens(ans).find((k) => !isAnswered(k, ans)) || null;
}
