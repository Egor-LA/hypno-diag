import {
  TOTAL_QUESTIONS, SCHEDULES, describe, normalizeAnswers, shortItems, isScore, buildMarkdown, analyze,
  clientSafetyTriggered, fmtDate, fmtDateTime,
} from '../../web/shared.js';
import { esc, randomId, reportKey, timingSafeEqual, validTz, verifyInitData } from './util.js';
import { advancePos, planNext, posFromSubs } from './schedule.js';
import { adminText, cardText, clientResultsText, SCHEDULE_ORDER } from './messages.js';

const H = 3600 * 1000;

// ---------- Telegram ----------

async function tg(env, method, body) {
  const base = env.TG_API || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
const sendHtml = (env, chat_id, text, markup) => send(env, chat_id, text, { parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) });

async function sendDocument(env, chat_id, filename, text, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chat_id));
  if (caption) fd.append('caption', caption);
  fd.append('document', new Blob([text], { type: 'text/markdown' }), filename);
  const base = env.TG_API || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log('sendDocument error', JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) {
    console.log('sendDocument failed', String(e));
    return { ok: false };
  }
}

const isAdminId = (env, id) => String(id) === String(env.ADMIN_CHAT_ID);
const sees = (env) => String(env.CLIENT_SEES_RESULTS ?? 'true') !== 'false';
const pagesUrl = (env) => String(env.PAGES_URL || '').replace(/\/$/, '');
const appUrl = (env, kind) => `${pagesUrl(env)}/index.html?kind=${kind}`;
const webAppButton = (env, kind, text = 'Пройти опросник') => ({ inline_keyboard: [[{ text, web_app: { url: appUrl(env, kind) } }]] });

async function botUsername(env) {
  if (env.BOT_USERNAME) return env.BOT_USERNAME;
  const r = await tg(env, 'getMe', {});
  return r.result?.username || '';
}

// ---------- БД ----------

const rowToSub = (r) => ({ ...r, answers: normalizeAnswers(JSON.parse(r.answers)) });

async function getClient(env, id) {
  return env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
}

async function getSubs(env, clientId) {
  const { results } = await env.DB.prepare('SELECT * FROM submissions WHERE client_id = ? ORDER BY created_at ASC').bind(clientId).all();
  return results.map(rowToSub);
}

async function allClients(env) {
  const { results } = await env.DB.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  return results;
}

async function findByName(env, name) {
  const n = name.trim().toLowerCase();
  const all = await allClients(env);
  const exact = all.filter((c) => c.name.toLowerCase() === n);
  return exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(n));
}

// ---------- расписание ----------

async function applySchedule(env, client, mode, now = Date.now()) {
  await env.DB.prepare('UPDATE clients SET schedule = ? WHERE id = ?').bind(mode, client.id).run();
  if (mode === 'off') {
    await env.DB.prepare('DELETE FROM reminders WHERE client_id = ?').bind(client.id).run();
    return null;
  }
  const subs = await getSubs(env, client.id);
  const last = subs[subs.length - 1];
  const plan = planNext({
    mode, lastTs: last ? last.created_at : null, now, tz: client.tz, pos: posFromSubs(subs), hasFull: subs.some((s) => s.kind === 'full'),
  });
  await env.DB.prepare(
    `INSERT INTO reminders (client_id, next_at, attempts, next_kind, cycle_pos, last_sent_at) VALUES (?, ?, 0, ?, ?, NULL)
     ON CONFLICT(client_id) DO UPDATE SET next_at = excluded.next_at, attempts = 0, next_kind = excluded.next_kind, cycle_pos = excluded.cycle_pos, last_sent_at = NULL`,
  ).bind(client.id, plan.next_at, plan.next_kind, plan.cycle_pos).run();
  return plan;
}

const kindWord = (k) => (k === 'full' ? 'полный' : 'короткий');

async function runReminders(env, now = Date.now()) {
  const { results } = await env.DB.prepare(
    `SELECT r.client_id, r.next_at, r.attempts, r.next_kind, r.cycle_pos, r.last_sent_at, c.name, c.chat_id, c.tz, c.schedule
     FROM reminders r JOIN clients c ON c.id = r.client_id WHERE r.next_at <= ?`,
  ).bind(now).all();
  const log = [];
  for (const r of results) {
    if (r.schedule === 'off') { await env.DB.prepare('DELETE FROM reminders WHERE client_id = ?').bind(r.client_id).run(); continue; }
    if (!r.chat_id) continue;
    const waited = r.last_sent_at ? now - r.last_sent_at : Infinity;
    if (r.attempts === 0 || (r.attempts === 1 && waited >= 23.5 * H)) {
      let kind = r.next_kind;
      if (kind === 'short') {
        const fulls = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE client_id = ? AND kind = 'full'").bind(r.client_id).first();
        if (!fulls.n) kind = 'full';
      }
      const lead = r.attempts === 0 ? '' : 'Напоминаю. ';
      const dur = kind === 'full' ? '10-15 минут' : '2-3 минуты';
      await send(env, r.chat_id, `${lead}${r.name}, пора отметить, как вы. Займёт ${dur}.`, { reply_markup: webAppButton(env, kind, 'Отметить состояние') });
      await env.DB.prepare('UPDATE reminders SET attempts = attempts + 1, last_sent_at = ?, next_kind = ? WHERE client_id = ?').bind(now, kind, r.client_id).run();
      log.push(`sent ${r.name} ${kind} attempt ${r.attempts + 1}`);
    } else if (r.attempts >= 2 && waited >= 23.5 * H) {
      await send(env, env.ADMIN_CHAT_ID, `${r.name} не прошёл(ла) ретест`);
      const pos = advancePos(r.schedule, r.cycle_pos, r.next_kind);
      const subs = await getSubs(env, r.client_id);
      const plan = planNext({ mode: r.schedule, lastTs: now, now, tz: r.tz, pos, hasFull: subs.some((s) => s.kind === 'full') });
      await env.DB.prepare('UPDATE reminders SET next_at = ?, attempts = 0, next_kind = ?, cycle_pos = ?, last_sent_at = NULL WHERE client_id = ?')
        .bind(plan.next_at, plan.next_kind, plan.cycle_pos, r.client_id).run();
      log.push(`missed ${r.name}`);
    }
  }
  return log;
}

// ---------- кнопки Егора ----------

async function clientButtons(env, client) {
  const key = await reportKey(env, client.id);
  return {
    inline_keyboard: [
      [{ text: 'Открыть карту', url: `${pagesUrl(env)}/report.html?id=${client.id}&k=${key}` }],
      [{ text: 'Файл для ИИ', callback_data: `ai:${client.id}` }],
      [{ text: 'Ретест', callback_data: `rt:${client.id}` }],
      [{ text: 'Полный ретест сейчас', callback_data: `now:${client.id}:full` }, { text: 'Короткий ретест сейчас', callback_data: `now:${client.id}:short` }],
    ],
  };
}

function scheduleKeyboard(client) {
  return {
    inline_keyboard: SCHEDULE_ORDER.map((m) => [{
      text: (client.schedule === m ? '✓ ' : '') + (m === 'off' ? 'Выключить' : SCHEDULES[m]),
      callback_data: `sm:${client.id}:${m}`,
    }]),
  };
}

async function sendResultsToClient(env, client, chatId, d) {
  const extra = {};
  if (clientSafetyTriggered(d.sub.answers) && env.THERAPIST_TG) {
    extra.reply_markup = { inline_keyboard: [[{ text: 'Написать терапевту', url: `https://t.me/${String(env.THERAPIST_TG).replace(/^@/, '')}` }]] };
  }
  await send(env, chatId, clientResultsText(d), extra);
}

async function notifyAfterSubmit(env, client, subs, idx) {
  const d = describe(subs, idx);
  const markup = await clientButtons(env, client);
  await sendHtml(env, env.ADMIN_CHAT_ID, adminText(client, d, client.tz), markup);
  if (sees(env) && client.chat_id) await sendResultsToClient(env, client, client.chat_id, d);
}

// ---------- HTTP API ----------

function cors(env) {
  let origin = '*';
  try { if (env.PAGES_URL) origin = new URL(env.PAGES_URL).origin; } catch { /* оставляем * */ }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(env) } });

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

async function identify(env, initData) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v) return { error: 'bad_signature' };
  const client = await env.DB.prepare('SELECT * FROM clients WHERE chat_id = ?').bind(v.user.id).first();
  if (!client) return { error: 'unknown_client' };
  return { client };
}

async function apiInit(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.error === 'bad_signature' ? 401 : 404);
  const subs = await getSubs(env, who.client.id);
  const fulls = subs.filter((s) => s.kind === 'full');
  const kind = body.kind === 'short' && fulls.length ? 'short' : 'full';
  const res = {
    ok: true, name: who.client.name, kind, firstTime: subs.length === 0, therapist: env.THERAPIST_TG || '',
  };
  if (kind === 'short') {
    res.items = shortItems(fulls[0].answers);
    res.concernText = fulls[0].concern_text || '';
  }
  return json(env, res);
}

async function apiSubmit(env, body) {
  const now = Date.now();
  let client;
  let viaTelegram = false;
  if (body.initData) {
    const who = await identify(env, body.initData);
    if (who.error) return json(env, { ok: false, error: who.error }, who.error === 'bad_signature' ? 401 : 404);
    client = who.client;
    viaTelegram = true;
  } else {
    const name = clean(body.name, 100);
    if (!name) return json(env, { ok: false, error: 'name_required' }, 400);
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM clients WHERE chat_id IS NULL AND invite IS NULL AND created_at > ?').bind(now - H).first();
    if (recent.n >= 60) return json(env, { ok: false, error: 'too_many' }, 429);
  }

  const tz = validTz(body.tz) ? body.tz : null;
  const subs = client ? await getSubs(env, client.id) : [];
  const fulls = subs.filter((s) => s.kind === 'full');
  const kind = viaTelegram && body.kind === 'short' && fulls.length ? 'short' : 'full';

  if (!Array.isArray(body.answers) || body.answers.length !== TOTAL_QUESTIONS) return json(env, { ok: false, error: 'bad_answers' }, 400);
  const answers = body.answers.map((v) => (v === null ? null : v));
  if (kind === 'full') {
    if (!answers.every(isScore)) return json(env, { ok: false, error: 'bad_answers' }, 400);
  } else {
    const want = shortItems(fulls[0].answers);
    const got = answers.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (got.join() !== want.join() || !got.every((i) => isScore(answers[i]))) return json(env, { ok: false, error: 'bad_answers' }, 400);
  }

  const concernScore = body.concernScore;
  if (!isScore(concernScore)) return json(env, { ok: false, error: 'bad_concern' }, 400);
  const concernText = clean(body.concernText, 3000);
  const successText = clean(body.successText, 3000);
  if (kind === 'full' && (!concernText || !successText)) return json(env, { ok: false, error: 'bad_concern' }, 400);

  if (!client) {
    client = {
      id: randomId(6), name: clean(body.name, 100), contact: clean(body.contact, 200) || null, chat_id: null, tz: tz || 'Europe/Moscow',
      invite: null, schedule: 'off', created_at: now,
    };
    await env.DB.prepare('INSERT INTO clients (id, name, contact, chat_id, tz, invite, schedule, created_at) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)')
      .bind(client.id, client.name, client.contact, client.tz, client.schedule, now).run();
  } else if (tz && tz !== client.tz) {
    await env.DB.prepare('UPDATE clients SET tz = ? WHERE id = ?').bind(tz, client.id).run();
    client.tz = tz;
  }

  const sub = {
    id: randomId(8), client_id: client.id, kind, answers, concern_text: kind === 'full' ? concernText : null, concern_score: concernScore,
    success_text: kind === 'full' ? successText : null, other_text: kind === 'full' ? clean(body.otherText, 3000) || null : null,
    week_note: kind === 'short' ? clean(body.weekNote, 3000) || null : null, created_at: now,
  };
  await env.DB.prepare(
    'INSERT INTO submissions (id, client_id, kind, answers, concern_text, concern_score, success_text, other_text, week_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(sub.id, sub.client_id, sub.kind, JSON.stringify(answers), sub.concern_text, sub.concern_score, sub.success_text, sub.other_text, sub.week_note, sub.created_at).run();

  // Плановый ретест пройден: двигаем цикл
  const rem = await env.DB.prepare('SELECT * FROM reminders WHERE client_id = ?').bind(client.id).first();
  if (rem && rem.attempts > 0) {
    const pos = advancePos(client.schedule, rem.cycle_pos, rem.next_kind);
    const plan = planNext({ mode: client.schedule, lastTs: now, now, tz: client.tz, pos, hasFull: true });
    if (plan) {
      await env.DB.prepare('UPDATE reminders SET next_at = ?, attempts = 0, next_kind = ?, cycle_pos = ?, last_sent_at = NULL WHERE client_id = ?')
        .bind(plan.next_at, plan.next_kind, plan.cycle_pos, client.id).run();
    }
  }

  const all = [...subs, { ...sub }];
  await notifyAfterSubmit(env, client, all, all.length - 1);

  return json(env, {
    ok: true, id: sub.id, sees: sees(env), critical: answers[38], safety: clientSafetyTriggered(answers), therapist: env.THERAPIST_TG || '',
    bot: await botUsername(env), viaTelegram,
  });
}

async function apiReport(env, url) {
  const id = url.searchParams.get('id') || '';
  const k = url.searchParams.get('k') || '';
  const client = id ? await getClient(env, id) : null;
  const expect = client ? await reportKey(env, id) : '';
  if (!client || !timingSafeEqual(k, expect)) return json(env, { ok: false, error: 'no_access' }, 403);
  const subs = await getSubs(env, id);
  const rem = await env.DB.prepare('SELECT next_at, next_kind FROM reminders WHERE client_id = ?').bind(id).first();
  return json(env, {
    ok: true,
    client: { id: client.id, name: client.name, contact: client.contact, tz: client.tz, schedule: client.schedule, created_at: client.created_at, next_at: rem?.next_at ?? null, next_kind: rem?.next_kind ?? null },
    submissions: subs,
  });
}

// ---------- webhook ----------

const HELP = [
  'Команды:',
  '/new Имя : создать клиента и получить ссылку-приглашение',
  '/clients : список клиентов и их карточки',
  '/export Имя : файл со всей историей клиента',
  '/delete Имя : удалить все данные клиента',
].join('\n');

async function greetClient(env, client, chatId) {
  await send(env, chatId,
    `Здравствуйте, ${client.name}! Это опросник состояния. Он помогает вам и вашему терапевту увидеть, как вы себя чувствуете. Займёт 10-15 минут. Нажмите кнопку, когда вам будет удобно.`,
    { reply_markup: webAppButton(env, 'full') });
}

async function bindClient(env, client, chatId) {
  if (client.chat_id && String(client.chat_id) !== String(chatId)) return false;
  if (!client.chat_id) {
    await env.DB.prepare('UPDATE clients SET chat_id = ? WHERE id = ?').bind(chatId, client.id).run();
    client.chat_id = chatId;
    await send(env, env.ADMIN_CHAT_ID, `${client.name} подключился(ась) к боту`);
  }
  return true;
}

async function onStart(env, msg, payload) {
  const chatId = msg.chat.id;
  if (payload) {
    let client = null;
    let subId = null;
    if (/^s_[0-9a-f]+$/.test(payload)) {
      subId = payload.slice(2);
      const row = await env.DB.prepare('SELECT client_id FROM submissions WHERE id = ?').bind(subId).first();
      if (row) client = await getClient(env, row.client_id);
    } else {
      client = await env.DB.prepare('SELECT * FROM clients WHERE invite = ?').bind(payload).first();
    }
    if (!client) return send(env, chatId, 'Эта ссылка не работает. Попросите терапевта прислать новую.');
    if (!(await bindClient(env, client, chatId))) return send(env, chatId, 'Эта ссылка уже привязана к другому чату. Попросите терапевта прислать новую.');
    if (subId) {
      await send(env, chatId, `Готово, ${client.name}. Теперь результаты и напоминания будут приходить сюда.`);
      if (sees(env)) {
        const subs = await getSubs(env, client.id);
        const i = subs.findIndex((s) => s.id === subId);
        if (i >= 0) await sendResultsToClient(env, client, chatId, describe(subs, i));
      }
      return;
    }
    return greetClient(env, client, chatId);
  }
  if (isAdminId(env, msg.from.id)) return send(env, chatId, 'Здравствуйте, Егор!\n\n' + HELP);
  const known = await env.DB.prepare('SELECT * FROM clients WHERE chat_id = ?').bind(chatId).first();
  if (known) return greetClient(env, known, chatId);
  return send(env, chatId, 'Чтобы начать, откройте ссылку, которую прислал вам терапевт.');
}

async function pickClient(env, chatId, name, cmd) {
  if (!name) { await send(env, chatId, `Напишите имя: /${cmd} Имя`); return null; }
  const found = await findByName(env, name);
  if (!found.length) { await send(env, chatId, `Клиент «${name}» не найден. Список: /clients`); return null; }
  if (found.length > 1) {
    await send(env, chatId, 'Нашлось несколько, уточните имя:\n' + found.map((c) => `${c.name} (${fmtDate(c.created_at)})`).join('\n'));
    return null;
  }
  return found[0];
}

async function sendExport(env, chatId, client) {
  const subs = await getSubs(env, client.id);
  if (!subs.length) return send(env, chatId, `У клиента ${client.name} ещё нет прохождений.`);
  const { filename, text } = buildMarkdown(client, subs);
  return sendDocument(env, chatId, filename, text, `${client.name}: файл для ИИ`);
}

async function sendCard(env, chatId, client) {
  const subs = await getSubs(env, client.id);
  const last = subs[subs.length - 1];
  const lastFull = [...subs].reverse().find((s) => s.kind === 'full');
  const total = lastFull ? analyze(lastFull.answers).total : null;
  return sendHtml(env, chatId, cardText(client, last, total, client.tz), await clientButtons(env, client));
}

async function onAdminCommand(env, chatId, cmd, arg) {
  switch (cmd) {
    case 'help': return send(env, chatId, HELP);
    case 'new': {
      const name = clean(arg, 60);
      if (!name) return send(env, chatId, 'Напишите имя: /new Имя');
      const id = randomId(6);
      const invite = randomId(8);
      await env.DB.prepare('INSERT INTO clients (id, name, contact, chat_id, tz, invite, schedule, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)')
        .bind(id, name, 'Europe/Moscow', invite, 'off', Date.now()).run();
      const bot = await botUsername(env);
      return send(env, chatId, `Клиент «${name}» создан. Отправьте ему эту ссылку:\n\nhttps://t.me/${bot}?start=${invite}\n\nКогда клиент пройдёт опросник, включите ретесты в карточке: /clients`);
    }
    case 'clients': {
      const list = await allClients(env);
      if (!list.length) return send(env, chatId, 'Клиентов пока нет. Создать: /new Имя');
      const lines = [];
      const buttons = [];
      for (const c of list) {
        const subs = await getSubs(env, c.id);
        const last = subs[subs.length - 1];
        const lastFull = [...subs].reverse().find((s) => s.kind === 'full');
        const total = lastFull ? `${analyze(lastFull.answers).total}`.replace('.', ',') + '/100' : '-';
        lines.push(`${c.name}: ${last ? fmtDate(last.created_at, c.tz) : 'не проходил(а)'}, ${SCHEDULES[c.schedule]}, сумма ${total}`);
        buttons.push([{ text: c.name, callback_data: `cl:${c.id}` }]);
      }
      return send(env, chatId, lines.join('\n'), { reply_markup: { inline_keyboard: buttons } });
    }
    case 'export': {
      const c = await pickClient(env, chatId, arg, 'export');
      return c ? sendExport(env, chatId, c) : null;
    }
    case 'delete': {
      const c = await pickClient(env, chatId, arg, 'delete');
      if (!c) return null;
      return send(env, chatId, `Удалить клиента «${c.name}» и все его данные? Это нельзя отменить.`, {
        reply_markup: { inline_keyboard: [[{ text: 'Да, удалить', callback_data: `del:${c.id}` }, { text: 'Отмена', callback_data: 'dn' }]] },
      });
    }
    case 'cron': {
      const log = await runReminders(env);
      return send(env, chatId, log.length ? log.join('\n') : 'Сейчас напоминать некому');
    }
    default: return null;
  }
}

async function onMessage(env, msg) {
  if (!msg.chat || msg.chat.type !== 'private' || !msg.from) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : null;
  const arg = m && m[2] ? m[2].trim() : '';
  if (cmd === 'start') return onStart(env, msg, arg);
  if (isAdminId(env, msg.from.id) && cmd) {
    const r = await onAdminCommand(env, chatId, cmd, arg);
    if (r !== null) return r;
  }
  if (isAdminId(env, msg.from.id)) return send(env, chatId, HELP);
  const known = await env.DB.prepare('SELECT * FROM clients WHERE chat_id = ?').bind(chatId).first();
  if (known) return send(env, chatId, `${known.name}, я бот для опросника и отвечать на сообщения не умею. Чтобы пройти опросник, нажмите кнопку.`, { reply_markup: webAppButton(env, 'full') });
  return send(env, chatId, 'Чтобы начать, откройте ссылку, которую прислал вам терапевт.');
}

async function onCallback(env, cq) {
  const answer = (text) => tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  if (!isAdminId(env, cq.from.id) || !cq.message) return answer();
  const chatId = cq.message.chat.id;
  const [act, id, extra] = String(cq.data || '').split(':');
  await answer();
  if (act === 'dn') return send(env, chatId, 'Отменено.');
  const client = id ? await getClient(env, id) : null;
  if (!client) return send(env, chatId, 'Клиент не найден (возможно, уже удалён).');

  switch (act) {
    case 'cl': return sendCard(env, chatId, client);
    case 'ai': return sendExport(env, chatId, client);
    case 'rt': return sendHtml(env, chatId, `Ретест для <b>${esc(client.name)}</b>. Выберите режим:`, scheduleKeyboard(client));
    case 'sm': {
      if (!SCHEDULES[extra]) return null;
      const plan = await applySchedule(env, client, extra);
      client.schedule = extra;
      await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: scheduleKeyboard(client) });
      if (!plan) return send(env, chatId, `Ретесты для ${client.name} выключены.`);
      return send(env, chatId, `Режим для ${client.name}: ${SCHEDULES[extra]}.\nСледующий ретест: ${fmtDateTime(plan.next_at, client.tz)} (${kindWord(plan.next_kind)}).`);
    }
    case 'now': {
      if (!client.chat_id) return send(env, chatId, `${client.name} ещё не подключился(ась) к боту. Отправьте клиенту ссылку-приглашение.`);
      let kind = extra === 'short' ? 'short' : 'full';
      if (kind === 'short') {
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE client_id = ? AND kind = 'full'").bind(id).first();
        if (!n.n) return send(env, chatId, 'Короткий ретест возможен только после первого полного прохождения.');
      }
      const dur = kind === 'full' ? '10-15 минут' : '2-3 минуты';
      await send(env, client.chat_id, `${client.name}, пора отметить, как вы. Займёт ${dur}.`, { reply_markup: webAppButton(env, kind, 'Отметить состояние') });
      return send(env, chatId, `Отправлено: ${client.name}, ${kindWord(kind)} ретест. Расписание не изменилось.`);
    }
    case 'del': {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM submissions WHERE client_id = ?').bind(id),
        env.DB.prepare('DELETE FROM reminders WHERE client_id = ?').bind(id),
        env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id),
      ]);
      return send(env, chatId, `Клиент «${client.name}» и все его данные удалены.`);
    }
    default: return null;
  }
}

async function handleWebhook(request, env) {
  if (!timingSafeEqual(request.headers.get('x-telegram-bot-api-secret-token'), env.WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
  let upd;
  try { upd = await request.json(); } catch { return new Response('ok'); }
  try {
    if (upd.message) await onMessage(env, upd.message);
    else if (upd.callback_query) await onCallback(env, upd.callback_query);
  } catch (e) {
    console.log('webhook error', String(e), e?.stack);
  }
  return new Response('ok');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // на Supabase функция живёт под префиксом /functions/v1/diag
    const path = url.pathname.replace(/^\/(functions\/v1\/)?diag(?=\/|$)/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (path === '/telegram/webhook' && request.method === 'POST') return await handleWebhook(request, env);
      if (path === '/api/report' && request.method === 'GET') return await apiReport(env, url);
      if (request.method === 'POST' && (path === '/api/init' || path === '/api/submit')) {
        const len = Number(request.headers.get('content-length') || 0);
        if (len > 60000) return json(env, { ok: false, error: 'too_large' }, 413);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return json(env, { ok: false, error: 'bad_json' }, 400);
        return path === '/api/init' ? await apiInit(env, body) : await apiSubmit(env, body);
      }
      if (path === '/cron' && request.method === 'POST') {
        if (!env.CRON_SECRET || !timingSafeEqual(request.headers.get('x-cron-secret'), env.CRON_SECRET)) return new Response('forbidden', { status: 403 });
        return json(env, { ok: true, log: await runReminders(env) });
      }
      if (path === '/') return new Response('ok', { headers: cors(env) });
      return new Response('not found', { status: 404 });
    } catch (e) {
      console.log('error', String(e), e?.stack);
      return json(env, { ok: false, error: 'server_error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};

export { runReminders, applySchedule };
