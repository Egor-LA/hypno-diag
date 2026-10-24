// Проверка слоя Postgres: ядро Worker в Node + pglite (настоящий Postgres в WASM) + поддельный Telegram на 8788
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import worker from '../worker/src/index.js';
import { makePgDb, applySchema } from '../worker/src/pg.js';

const pg = new PGlite();
const query = async (q, p) => (await pg.query(q, p)).rows;
await applySchema(query, fs.readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
await applySchema(query, fs.readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8')); // повтор безопасен
const env = { DB: makePgDb(query), BOT_TOKEN: '123456:TESTTOKEN', ADMIN_CHAT_ID: '1001', REPORT_SECRET: 'rs', WEBHOOK_SECRET: 'ws', CRON_SECRET: 'cs',
  TG_API: 'http://127.0.0.1:8788', PAGES_URL: 'http://x.test', BOT_USERNAME: 'testbot', THERAPIST_TG: 'egor', CLIENT_SEES_RESULTS: 'true' };
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = (path, init) => worker.fetch(new Request('http://w.test' + path, init), env);
const hook = (u) => call('/functions/v1/diag/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'ws' }, body: JSON.stringify(u) });
const msg = (from, text) => ({ message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const cb = (from, data) => ({ callback_query: { id: 'c', from: { id: from }, data, message: { message_id: 5, chat: { id: from, type: 'private' } } } });
const log = async () => (await fetch('http://127.0.0.1:8788/_log')).json();
await fetch('http://127.0.0.1:8788/_clear');

await hook(msg(1001, '/new Пг Тест'));
let l = await log();
const invite = l.at(-1).body.text.match(/start=([0-9a-f]+)/)[1];
ok(!!invite, '/new на Postgres');
await hook(msg(2002, '/start ' + invite));
const row = (await pg.query("select * from clients where name='Пг Тест'")).rows[0];
ok(row && Number(row.chat_id) === 2002, 'клиент привязан к chat_id');

// подписанный initData
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 2002, first_name: 'Пг' }) });
p.set('hash', hmac(hmac('WebAppData', env.BOT_TOKEN), [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')).toString('hex'));
const SPEC = [2,5,5,2,0,0, 0,0,4,0,0,0, 0,2,0,0,0, 3,4,4,0,2,0, 5,0,2,4,5, 0,5,5,2,2, 5,4,8,3,4,1, 0,2,3,0,0, 0,0,0,0,0, 0,0,0,0,0,0];
const body = { initData: p.toString(), kind: 'full', answers: SPEC, concernText: 'Тревога', concernScore: 7, successText: 'Буду спокоен', tz: 'Europe/Moscow' };
let r = await (await call('/functions/v1/diag/api/submit', { method: 'POST', body: JSON.stringify(body) })).json();
ok(r.ok && r.sees === true, 'submit на Postgres');
l = await log();
ok(l.some((x) => x.body.text?.includes('Сумма 16,7/100')) && l.some((x) => x.body.chat_id === 2002 && x.body.text?.startsWith('Ваши результаты')), 'сообщения Егору и клиенту');
const init = await (await call('/api/init', { method: 'POST', body: JSON.stringify({ initData: p.toString(), kind: 'short' }) })).json();
ok(init.ok && init.kind === 'short' && init.items.length === 10, 'init: короткий ретест, 10 пунктов');
const short = { ...body, kind: 'short', answers: SPEC.map((v, i) => (init.items.includes(i) ? Math.max(0, v - 1) : null)), concernScore: 5 };
r = await (await call('/api/submit', { method: 'POST', body: JSON.stringify(short) })).json();
ok(r.ok, 'короткий ретест на Postgres');

// расписание + cron + /cron по секрету
const id = (await pg.query("select id from clients where name='Пг Тест'")).rows[0].id;
await hook(cb(1001, `sm:${id}:mix_1w`));
let rem = (await pg.query('select * from reminders')).rows[0];
ok(rem && rem.next_kind === 'short' && Number(rem.next_at) > Date.now(), 'расписание записано (upsert)');
await pg.query('update reminders set next_at = $1', [Date.now() - 1000]);
await fetch('http://127.0.0.1:8788/_clear');
const bad = await call('/cron', { method: 'POST', headers: { 'x-cron-secret': 'no' } });
ok(bad.status === 403, '/cron с неверным секретом: 403');
const good = await (await call('/functions/v1/diag/cron', { method: 'POST', headers: { 'x-cron-secret': 'cs' } })).json();
l = await log();
ok(good.ok && l.some((x) => x.body.chat_id === 2002 && x.body.text === 'Пг Тест, пора отметить, как вы. Займёт 2-3 минуты.'), 'cron отправил напоминание');

// карта
const k = hmac('rs', 'report:' + id).toString('hex').slice(0, 32);
const rep = await (await call(`/api/report?id=${id}&k=${k}`)).json();
ok(rep.ok && rep.submissions.length === 2 && rep.submissions[0].answers.length > 0, 'report отдаёт данные');
ok((await call(`/api/report?id=${id}&k=bad`)).status === 403, 'report с неверным ключом: 403');

// экспорт и удаление
await fetch('http://127.0.0.1:8788/_clear');
await hook(msg(1001, '/export Пг'));
l = await log();
ok(l.some((x) => x.method === 'sendDocument'), '/export');
await hook(msg(1001, '/delete Пг'));
l = await log();
await hook(cb(1001, l.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data));
ok((await pg.query('select count(*)::int n from clients')).rows[0].n === 0 && (await pg.query('select count(*)::int n from submissions')).rows[0].n === 0, '/delete (batch) на Postgres');
console.log(fails ? 'ПРОВАЛОВ: ' + fails : 'POSTGRES: ВСЁ ОК');
process.exit(fails ? 1 : 0);
