const enc = new TextEncoder();

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

export function timingSafeEqual(a, b) {
  a = String(a ?? '');
  b = String(b ?? '');
  let r = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

export function randomId(bytes = 6) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function reportKey(env, clientId) {
  return hex(await hmac(env.REPORT_SECRET, 'report:' + clientId)).slice(0, 32);
}

// Проверка подписи Telegram initData: HMAC-SHA256, ключ = HMAC("WebAppData", токен бота)
export async function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac('WebAppData', botToken);
  const calc = hex(await hmac(secret, dcs));
  if (!timingSafeEqual(calc, hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return { user, startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

export function validTz(tz) {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz });
    return typeof tz === 'string' && tz.length < 64;
  } catch {
    return false;
  }
}

function offsetMs(ts, tz) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ts));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ts / 1000) * 1000;
}

export function localParts(ts, tz) {
  const d = new Date(ts + offsetMs(ts, tz));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() };
}

export function zonedTime(y, m, d, h, tz) {
  const guess = Date.UTC(y, m - 1, d, h);
  let off = offsetMs(guess, tz);
  const r = guess - off;
  off = offsetMs(r, tz);
  return guess - off;
}

// Ближайшие 11:00 по местному времени на дату ts (или на следующий день, если уже прошло)
export function snapTo11(ts, tz, now) {
  const { y, m, d } = localParts(ts, tz);
  let r = zonedTime(y, m, d, 11, tz);
  if (r <= now) r = zonedTime(y, m, d + 1, 11, tz);
  return r;
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
