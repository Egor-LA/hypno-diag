// Серверная функция опросника по весу: webhook бота и API мини-приложения
import {
  STATEMENTS, FOLLOWUPS, TEXTS, S3_1_OPTIONS, S3_2_OPTIONS, S4_2_OPTIONS, S4_3_OPTIONS, S4_4_OPTIONS, NONE, ANSWER_OPTIONS,
} from './questions.js';
import { evaluate } from './scoring.js';
import { reportText, reportMarkdown, splitMessage, fmtDateTime } from './report.js';
import { screens, firstIncomplete } from '../../web/weight/steps.js';
import { randomId, timingSafeEqual, verifyInitData, hmac, hex } from '../../worker/src/util.js';

// Несекретные настройки по умолчанию; секрет только один: WT_BOT_TOKEN
const DEFAULTS = { WT_PAGES_URL: 'https://egor-la.github.io/hypno-diag/weight', WT_BOT_USERNAME: 'overweight_gnm_bot' };

// Секрет webhook выводится из токена бота, если не задан отдельно
export async function webhookSecret(env) {
  return env.WT_WEBHOOK_SECRET || hex(await hmac(env.WT_BOT_TOKEN, 'wt-webhook')).slice(0, 48);
}

const NO_LINK = 'Этот опросник открывается по личной ссылке. Попросите её у Егора';

// ---------- Telegram ----------

async function tg(env, method, body) {
  const base = env.TG_API || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.WT_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log('tg error', method, JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) {
    console.log('tg fetch failed', method, String(e));
    return { ok: false };
  }
}

const send = (env, chat_id, text, extra = {}) => tg(env, 'sendMessage', { chat_id, text, link_preview_options: { is_disabled: true }, ...extra });

async function sendDocument(env, chat_id, filename, text) {
  const fd = new FormData();
  fd.append('chat_id', String(chat_id));
  fd.append('document', new Blob([text], { type: 'text/markdown' }), filename);
  const base = env.TG_API || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.WT_BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.log('sendDocument failed', String(e));
    return { ok: false };
  }
}

const isAdmin = (env, id) => String(id) === String(env.ADMIN_CHAT_ID);
const pagesUrl = (env) => String(env.WT_PAGES_URL || '').replace(/\/$/, '');
const startButton = (env) => ({ inline_keyboard: [[{ text: 'Пройти опросник', web_app: { url: `${pagesUrl(env)}/index.html` } }]] });

async function botUsername(env) {
  if (env.WT_BOT_USERNAME) return env.WT_BOT_USERNAME;
  const r = await tg(env, 'getMe', {});
  return r.result?.username || '';
}
const personalLink = async (env, client) => `https://t.me/${await botUsername(env)}?start=${client.token}`;

// ---------- база ----------

const db = (env) => env.DB;

async function lastSession(env, clientId) {
  return db(env).prepare('SELECT * FROM wt_sessions WHERE client_id = ? ORDER BY number DESC LIMIT 1').bind(clientId).first();
}

async function prevFinished(env, clientId, number) {
  return db(env).prepare("SELECT * FROM wt_sessions WHERE client_id = ? AND status = 'finished' AND number < ? ORDER BY number DESC LIMIT 1").bind(clientId, number).first();
}

async function loadAnswers(env, sessionId) {
  const { results } = await db(env).prepare('SELECT question_key, value, text, skipped FROM wt_answers WHERE session_id = ?').bind(sessionId).all();
  const ans = {};
  for (const r of results) {
    let value = r.value;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { /* строка как есть */ } }
    ans[r.question_key] = { value, text: r.text, skipped: !!r.skipped };
  }
  return ans;
}

async function newSession(env, clientId, number) {
  const s = { id: randomId(8), client_id: clientId, number, started_at: Date.now() };
  await db(env).prepare("INSERT INTO wt_sessions (id, client_id, number, status, current_step, started_at) VALUES (?, ?, ?, 'in_progress', 'start', ?)")
    .bind(s.id, clientId, number, s.started_at).run();
  return { ...s, status: 'in_progress', current_step: 'start' };
}

async function allClients(env) {
  const { results } = await db(env).prepare('SELECT * FROM wt_clients ORDER BY created_at DESC').all();
  return results;
}

async function findByName(env, name) {
  const n = name.trim().toLowerCase();
  const all = await allClients(env);
  const exact = all.filter((c) => c.name.toLowerCase() === n);
  return exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(n));
}

// ---------- отчёт ----------

async function buildReport(env, client, session) {
  const ans = await loadAnswers(env, session.id);
  const ev = evaluate(ans);
  const prev = await prevFinished(env, client.id, session.number);
  let prevScores = prev?.scores ?? null;
  if (typeof prevScores === 'string') prevScores = JSON.parse(prevScores);
  const data = { name: client.name, number: session.number, finishedAt: Number(session.finished_at), ans, ev, prevScores };
  return { ev, text: reportText(data), md: reportMarkdown(data) };
}

async function sendReport(env, chatId, client, session) {
  const r = await buildReport(env, client, session);
  for (const part of splitMessage(r.text)) await send(env, chatId, part);
  await sendDocument(env, chatId, r.md.filename, r.md.text);
  return r;
}

// ---------- проверка ответов ----------

const clean = (v, max = 3000) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const subsetOf = (arr, opts) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => opts.includes(x)) && new Set(arr).size === arr.length;
const ALL_KEYS = new Set([...STATEMENTS.map((s) => s.key), ...FOLLOWUPS.map((f) => f.key), 's3_1', 's3_1_text', 's3_2', 's3_3', 's4_1', 's4_2', 's4_3', 's4_4']);

// Возвращает { value, text, skipped } или null, если ответ не годится
function normalizeAnswer(key, b) {
  const skipped = b.skipped === true;
  const text = skipped ? null : clean(b.text) || null;
  if (/^q\d+$/.test(key)) return Number.isInteger(b.value) && b.value >= 0 && b.value <= 3 ? { value: b.value, text: null, skipped: false } : null;
  if (/^f\d+$/.test(key) || key === 's3_1_text' || key === 's3_3') return skipped || text ? { value: null, text, skipped } : null;
  if (key === 's3_1') return S3_1_OPTIONS.includes(b.value) ? { value: b.value, text: null, skipped: false } : null;
  if (key === 's3_2') return subsetOf(b.value, S3_2_OPTIONS) ? { value: b.value, text: b.value.includes('Другое') ? clean(b.text) || null : null, skipped: false } : null;
  if (key === 's4_1') {
    if (b.value === 'Нет') return { value: 'Нет', text: null, skipped: false };
    return b.value === 'Да' && clean(b.text) ? { value: 'Да', text: clean(b.text), skipped: false } : null;
  }
  if (key === 's4_2') {
    if (!S4_2_OPTIONS.includes(b.value)) return null;
    const dev = b.value === 'Сдавала, были отклонения';
    return { value: b.value, text: dev && !skipped ? clean(b.text) || null : null, skipped: dev && (skipped || !clean(b.text)) };
  }
  if (key === 's4_3' || key === 's4_4') {
    const opts = key === 's4_3' ? S4_3_OPTIONS : S4_4_OPTIONS;
    if (!subsetOf(b.value, opts)) return null;
    if (b.value.includes(NONE) && b.value.length > 1) return null;
    return { value: b.value, text: null, skipped: false };
  }
  return null;
}

// ---------- API мини-приложения ----------

function cors(env) {
  let origin = '*';
  try { if (env.WT_PAGES_URL) origin = new URL(env.WT_PAGES_URL).origin; } catch { /* оставляем * */ }
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
}
const json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(env) } });

async function identify(env, initData) {
  const v = await verifyInitData(initData, env.WT_BOT_TOKEN);
  if (!v) return { error: 'bad_signature', status: 401 };
  const client = await db(env).prepare('SELECT * FROM wt_clients WHERE tg_user_id = ?').bind(v.user.id).first();
  if (!client) return { error: 'no_link', status: 403 };
  let session = await lastSession(env, client.id);
  if (!session) session = await newSession(env, client.id, 1);
  return { client, session };
}

// Контент для экранов: тексты без блоков и баллов
function content() {
  return {
    statements: STATEMENTS.map((s) => ({ key: s.key, n: s.n, text: s.text })),
    options: ANSWER_OPTIONS,
    followups: Object.fromEntries(FOLLOWUPS.map((f) => [f.key, { n: f.n, prompt: f.prompt, statement: STATEMENTS[f.n - 1].text }])),
    texts: TEXTS,
    s3_1: S3_1_OPTIONS, s3_2: S3_2_OPTIONS, s4_2: S4_2_OPTIONS, s4_3: S4_3_OPTIONS, s4_4: S4_4_OPTIONS,
  };
}

async function apiState(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { session } = who;
  const finished = session.status === 'finished';
  return json(env, {
    ok: true,
    status: session.status,
    step: finished ? null : session.current_step || 'start',
    answers: finished ? {} : await loadAnswers(env, session.id),
    content: finished ? null : content(),
  });
}

async function apiAnswer(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { session } = who;
  if (session.status === 'finished') return json(env, { ok: false, error: 'finished' }, 409);
  const now = Date.now();
  if (body.key != null) {
    if (!ALL_KEYS.has(body.key)) return json(env, { ok: false, error: 'bad_key' }, 400);
    const a = normalizeAnswer(body.key, body);
    if (!a) return json(env, { ok: false, error: 'bad_value' }, 400);
    await db(env).prepare(
      `INSERT INTO wt_answers (session_id, question_key, value, text, skipped, updated_at) VALUES (?, ?, ?::jsonb, ?, ?, ?)
       ON CONFLICT (session_id, question_key) DO UPDATE SET value = excluded.value, text = excluded.text, skipped = excluded.skipped, updated_at = excluded.updated_at`,
    ).bind(session.id, body.key, a.value == null ? null : JSON.stringify(a.value), a.text, a.skipped, now).run();
  }
  if (typeof body.step === 'string' && body.step.length < 20) {
    await db(env).prepare('UPDATE wt_sessions SET current_step = ? WHERE id = ?').bind(body.step, session.id).run();
  }
  return json(env, { ok: true });
}

async function apiFinish(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { client, session } = who;
  if (session.status === 'finished') return json(env, { ok: true, already: true });
  const ans = await loadAnswers(env, session.id);
  const missing = firstIncomplete(ans);
  if (missing) return json(env, { ok: false, error: 'incomplete', step: missing }, 400);

  const ev = evaluate(ans);
  const now = Date.now();
  const primary = ev.primary.length ? ev.primary.join(' и ') : null;
  // Заканчиваем только если прохождение ещё открыто (защита от двойного нажатия)
  const upd = await db(env).prepare(
    `UPDATE wt_sessions SET status = 'finished', finished_at = ?, current_step = NULL, scores = ?::jsonb, primary_theme = ?, second_theme = ?, notes = ?::jsonb, flags = ?::jsonb
     WHERE id = ? AND status = 'in_progress' RETURNING id`,
  ).bind(now, JSON.stringify(ev.scores), primary, ev.second, JSON.stringify(ev.notes), JSON.stringify(ev.flags), session.id).first();
  if (!upd) return json(env, { ok: true, already: true });
  await sendReport(env, env.ADMIN_CHAT_ID, client, { ...session, status: 'finished', finished_at: now });
  return json(env, { ok: true });
}

// ---------- бот ----------

const HELP = [
  'Команды:',
  '/new Имя : создать клиентку и получить личную ссылку',
  '/list : список клиенток и статус',
  '/result Имя : последний отчёт и файл',
  '/retest Имя : открыть новое прохождение',
].join('\n');

async function pickClient(env, chatId, arg, cmd) {
  if (!arg) { await send(env, chatId, `Напишите имя: /${cmd} Имя`); return null; }
  const found = await findByName(env, arg);
  if (!found.length) { await send(env, chatId, `Клиентка «${arg}» не найдена. Список: /list`); return null; }
  if (found.length > 1) { await send(env, chatId, 'Нашлось несколько, уточните имя:\n' + found.map((c) => c.name).join('\n')); return null; }
  return found[0];
}

async function statusLine(env, c) {
  const s = await lastSession(env, c.id);
  if (!s) return `${c.name}: не начала`;
  const num = s.number > 1 ? ` (прохождение №${s.number})` : '';
  if (s.status === 'finished') return `${c.name}: прошла, ${fmtDateTime(Number(s.finished_at))}${num}`;
  const ans = await loadAnswers(env, s.id);
  if (!Object.keys(ans).length) return `${c.name}: не начала${num}${c.tg_user_id ? '' : ', ссылку ещё не открыла'}`;
  const list = screens(ans);
  const step = list.includes(s.current_step) ? s.current_step : firstIncomplete(ans) || list[list.length - 1];
  return `${c.name}: в процессе, вопрос ${list.indexOf(step)} из ${list.length - 1}${num}`;
}

async function onAdminCommand(env, chatId, cmd, arg) {
  switch (cmd) {
    case 'help': return send(env, chatId, HELP);
    case 'new': {
      const name = clean(arg, 60);
      if (!name) return send(env, chatId, 'Напишите имя: /new Имя');
      const client = { id: randomId(6), name, token: randomId(12), created_at: Date.now() };
      await db(env).prepare('INSERT INTO wt_clients (id, name, token, tg_user_id, created_at) VALUES (?, ?, ?, NULL, ?)')
        .bind(client.id, client.name, client.token, client.created_at).run();
      await newSession(env, client.id, 1);
      return send(env, chatId, `Клиентка «${name}» создана. Её личная ссылка:\n\n${await personalLink(env, client)}`);
    }
    case 'list': {
      const list = await allClients(env);
      if (!list.length) return send(env, chatId, 'Клиенток пока нет. Создать: /new Имя');
      const lines = [];
      for (const c of list) lines.push(await statusLine(env, c));
      return send(env, chatId, lines.join('\n'));
    }
    case 'result': {
      const c = await pickClient(env, chatId, arg, 'result');
      if (!c) return true;
      const s = await db(env).prepare("SELECT * FROM wt_sessions WHERE client_id = ? AND status = 'finished' ORDER BY number DESC LIMIT 1").bind(c.id).first();
      if (!s) return send(env, chatId, `${c.name} ещё не прошла опросник.`);
      return sendReport(env, chatId, c, s);
    }
    case 'retest': {
      const c = await pickClient(env, chatId, arg, 'retest');
      if (!c) return true;
      const s = await lastSession(env, c.id);
      const link = await personalLink(env, c);
      if (s && s.status === 'in_progress') return send(env, chatId, `У ${c.name} уже открыто прохождение №${s.number}. Ссылка:\n\n${link}`);
      const ns = await newSession(env, c.id, (s?.number ?? 0) + 1);
      return send(env, chatId, `Открыто прохождение №${ns.number} для ${c.name}. Ссылка:\n\n${link}`);
    }
    default: return null;
  }
}

async function onStart(env, msg, payload) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!payload) {
    if (isAdmin(env, userId)) return send(env, chatId, 'Здравствуйте, Егор!\n\n' + HELP);
    const known = await db(env).prepare('SELECT * FROM wt_clients WHERE tg_user_id = ?').bind(userId).first();
    if (known) return send(env, chatId, 'Нажмите кнопку, чтобы открыть опросник.', { reply_markup: startButton(env) });
    return send(env, chatId, NO_LINK);
  }
  const client = /^[0-9a-f]{24}$/.test(payload) ? await db(env).prepare('SELECT * FROM wt_clients WHERE token = ?').bind(payload).first() : null;
  if (!client) return send(env, chatId, NO_LINK);
  if (client.tg_user_id && String(client.tg_user_id) !== String(userId)) return send(env, chatId, NO_LINK);
  if (!client.tg_user_id) {
    // Токен привязывается к первому вошедшему. Один Telegram ID может быть только у одной клиентки.
    const other = await db(env).prepare('SELECT id FROM wt_clients WHERE tg_user_id = ?').bind(userId).first();
    if (other) return send(env, chatId, NO_LINK);
    const upd = await db(env).prepare('UPDATE wt_clients SET tg_user_id = ? WHERE id = ? AND tg_user_id IS NULL RETURNING id').bind(userId, client.id).first();
    if (!upd) return send(env, chatId, NO_LINK);
    await send(env, env.ADMIN_CHAT_ID, `${client.name} открыла ссылку`);
  }
  return send(env, chatId, `Здравствуйте, ${client.name}! Нажмите кнопку, чтобы открыть опросник.`, { reply_markup: startButton(env) });
}

async function onMessage(env, msg) {
  if (!msg.chat || msg.chat.type !== 'private' || !msg.from) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : null;
  const arg = m && m[2] ? m[2].trim() : '';
  if (cmd === 'start') return onStart(env, msg, arg);
  if (isAdmin(env, msg.from.id)) {
    if (cmd) {
      const r = await onAdminCommand(env, chatId, cmd, arg);
      if (r !== null) return r;
    }
    return send(env, chatId, HELP);
  }
  const known = await db(env).prepare('SELECT id FROM wt_clients WHERE tg_user_id = ?').bind(msg.from.id).first();
  if (known) return send(env, chatId, 'Нажмите кнопку, чтобы открыть опросник.', { reply_markup: startButton(env) });
  return send(env, chatId, NO_LINK);
}

async function handleWebhook(request, env) {
  if (!timingSafeEqual(request.headers.get('x-telegram-bot-api-secret-token'), await webhookSecret(env))) return new Response('forbidden', { status: 403 });
  let upd;
  try { upd = await request.json(); } catch { return new Response('ok'); }
  try {
    if (upd.message) await onMessage(env, upd.message);
  } catch (e) {
    console.log('webhook error', String(e), e?.stack);
  }
  return new Response('ok');
}

export default {
  async fetch(request, rawEnv) {
    const env = { ...DEFAULTS, ...rawEnv };
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?weight(?=\/|$)/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (path === '/telegram/webhook' && request.method === 'POST') return await handleWebhook(request, env);
      if (request.method === 'POST' && ['/api/state', '/api/answer', '/api/finish'].includes(path)) {
        if (Number(request.headers.get('content-length') || 0) > 20000) return json(env, { ok: false, error: 'too_large' }, 413);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return json(env, { ok: false, error: 'bad_json' }, 400);
        if (path === '/api/state') return await apiState(env, body);
        if (path === '/api/answer') return await apiAnswer(env, body);
        return await apiFinish(env, body);
      }
      if (path === '/') return new Response('ok', { headers: cors(env) });
      return new Response('not found', { status: 404 });
    } catch (e) {
      console.log('error', String(e), e?.stack);
      return json(env, { ok: false, error: 'server_error' }, 500);
    }
  },
};

