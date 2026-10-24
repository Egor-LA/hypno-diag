// Проверка на живых сервисах. Секреты читаются из ../.prod-secrets (в репозиторий не попадает).
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(fs.readFileSync(fileURLToPath(new URL('../.prod-secrets', import.meta.url)), 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const U = `https://${env.SUPABASE_REF}.supabase.co/functions/v1/diag`;
const PAGES = 'https://egor-la.github.io/hypno-diag';
const ADMIN = Number(env.ADMIN_CHAT_ID);
const SPEC = [2,5,5,2,0,0, 0,0,4,0,0,0, 0,2,0,0,0, 3,4,4,0,2,0, 5,0,2,4,5, 0,5,5,2,2, 5,4,8,3,4,1, 0,2,3,0,0, 0,0,0,0,0, 0,0,0,0,0,0];
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
const initData = (id) => { const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q' + Math.random(), user: JSON.stringify({ id, first_name: 'Тест' }) });
  p.set('hash', hmac(hmac('WebAppData', env.BOT_TOKEN), [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')).toString('hex')); return p.toString(); };
const reportKey = (id) => hmac(env.REPORT_SECRET, 'report:' + id).toString('hex').slice(0, 32);

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_REF}/database/query`, { method: 'POST', headers: { authorization: 'Bearer ' + env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j)); return j;
}
async function hook(update, secret = env.WEBHOOK_SECRET) {
  const r = await fetch(U + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
  return r.status;
}
const msg = (from, text) => ({ message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const cb = (from, data) => ({ callback_query: { id: 'cb' + Math.random(), from: { id: from }, data, message: { message_id: 5, chat: { id: from, type: 'private' } } } });

const stub = (data) => `window.Telegram={WebApp:{initData:${JSON.stringify(data)},initDataUnsafe:{user:{id:${ADMIN},first_name:'Тест'}},themeParams:{},ready(){},expand(){},onEvent(){},offEvent(){},HapticFeedback:{impactOccurred(){}},MainButton:{setText(t){window.__mbText=t},show(){},hide(){},enable(){},disable(){},showProgress(){},hideProgress(){},onClick(f){window.__mb=f},offClick(){}},close(){window.__closed=true},openTelegramLink(){}}};`;
const browser = await chromium.launch();
async function newPage(tg, kind = 'full') {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await page.route('**/telegram-web-app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: tg ? stub(initData(ADMIN)) : 'window.Telegram={WebApp:{initData:"",ready(){},expand(){}}};' }));
  await page.goto(`${PAGES}/index.html?kind=${kind}`);
  return page;
}
const setAns = (page, m) => page.evaluate((m) => { for (const [i, v] of Object.entries(m)) { const el = document.getElementById(i.startsWith('s') && isNaN(i) ? i : 's' + i); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, m);
async function main(page, o = {}) {
  if (await page.$('#concernText')) { await page.fill('#concernText', o.concern || 'Постоянное напряжение и тревога'); await setAns(page, { sc: o.score ?? 8 }); await page.fill('#successText', 'Буду спокойно спать'); await page.fill('#otherText', 'Иногда болит голова'); }
  else { await setAns(page, { sc: o.score ?? 5 }); await page.fill('#weekNote', 'Стало чуть легче'); }
}

await sql("delete from submissions where client_id in (select id from clients where name in ('Тест','Веб Клиент')); delete from reminders where client_id in (select id from clients where name in ('Тест','Веб Клиент')); delete from clients where name in ('Тест','Веб Клиент');");

// 1. /new
ok(await hook(msg(ADMIN, '/new Тест')) === 200, 'webhook принял /new');
const c = (await sql("select * from clients where name='Тест'"))[0];
ok(c && c.invite && c.schedule === 'off', 'клиент создан, режим off по умолчанию, инвайт ' + c?.invite);
ok(await hook(msg(ADMIN, '/clients'), 'wrong') === 403, 'неверный секрет webhook: 403');

// 2. /start
await hook(msg(ADMIN, '/start ' + c.invite));
ok(String((await sql("select chat_id from clients where name='Тест'"))[0].chat_id) === String(ADMIN), 'клиент привязан по инвайту');

// 3. Mini App, 360px
let page = await newPage(true);
await page.waitForSelector('#btnStart', { timeout: 15000 });
ok((await page.textContent('h1')) === 'Опросник состояния', 'Mini App открылся на живых Pages и прошёл init (подпись проверена)');
await page.check('#consent'); await page.click('#btnStart'); await page.waitForSelector('.sticky');
const map = {}; SPEC.forEach((v, i) => { map[i] = v; });
await setAns(page, map); await main(page);
await page.screenshot({ path: '/tmp/live_quiz.png' });
await page.evaluate(() => window.__mb());
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 20000 });
ok((await page.textContent('#app')).includes('Спасибо, результаты пришли вам в чат.'), 'экран «Спасибо, результаты пришли вам в чат»');
await page.waitForFunction(() => window.__closed === true, null, { timeout: 6000 }); ok(true, 'Mini App закрылся');
await page.context().close();
let subs = await sql("select * from submissions where client_id='" + c.id + "'");
ok(subs.length === 1 && subs[0].kind === 'full', 'прохождение сохранено в базе');

// 4. карта
page = await newPage(false);
await page.goto(`${PAGES}/report.html?id=${c.id}&k=${reportKey(c.id)}`);
await page.waitForSelector('h1'); await sleep(800);
let t = await page.textContent('#root');
ok(t.includes('Главное для клиента') && t.includes('Выброс') && t.includes('Мысли «лучше бы меня не было»: сейчас 1/10'), 'карта открывается по ключу: выброс и жёлтая плашка');
await page.screenshot({ path: '/tmp/live_report.png', fullPage: true });
await page.goto(`${PAGES}/report.html?id=${c.id}&k=000`); await page.waitForSelector('h1');
ok((await page.textContent('#root')).includes('Нет доступа'), 'неверный ключ: «Нет доступа»');
await page.context().close();

// 5. режимы
const DAY = 864e5;
const tz = (await sql("select tz from clients where id='" + c.id + "'"))[0].tz;
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
const hr = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
for (const [m, d, kind] of [['full_1w', 7, 'full'], ['full_4w', 28, 'full'], ['mix_1w', 7, 'short']]) {
  await hook(cb(ADMIN, `sm:${c.id}:${m}`));
  const r = (await sql("select * from reminders where client_id='" + c.id + "'"))[0];
  ok(r && ruDate(Number(r.next_at)) === ruDate(Date.now() + d * DAY) && hr(Number(r.next_at)).startsWith('11') && r.next_kind === kind, `режим ${m}: дата +${d} дн., 11:00 (${tz}), тип ${r?.next_kind}`);
}
await hook(cb(ADMIN, `sm:${c.id}:off`));
ok((await sql("select * from reminders where client_id='" + c.id + "'")).length === 0, 'режим off: расписание убрано');
await hook(cb(ADMIN, `sm:${c.id}:mix_1w`));

// 6. короткий ретест + неделя 4 в mix_1w
await sql(`update reminders set attempts=1, last_sent_at=${Date.now()}, next_kind='short', cycle_pos=2 where client_id='${c.id}'`);
page = await newPage(true, 'short');
await page.waitForSelector('#btnStart'); await page.evaluate(() => window.__mb()); await page.waitForSelector('.sticky');
ok((await page.textContent('#pcount')) === 'Отвечено 0 из 10', 'короткий ретест: 10 пунктов');
const idxs = await page.evaluate(() => [...document.querySelectorAll('.q[data-i]')].map((e) => Number(e.dataset.i)));
const nv = {}; idxs.forEach((i, k) => { nv[i] = Math.max(0, SPEC[i] - (k % 2 ? 2 : -2)); });
await setAns(page, nv); await main(page, { score: 5 });
await page.evaluate(() => window.__mb());
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 20000 });
await page.context().close();
let r = (await sql("select * from reminders where client_id='" + c.id + "'"))[0];
ok(r.next_kind === 'full' && Number(r.cycle_pos) === 3 && Number(r.attempts) === 0, 'mix_1w: после 3-го короткого следующий полный (неделя 4)');
// 7. карта с динамикой
page = await newPage(false);
await page.goto(`${PAGES}/report.html?id=${c.id}&k=${reportKey(c.id)}`); await page.waitForSelector('h1'); await sleep(1500);
ok((await page.textContent('#root')).includes('Динамика') && await page.evaluate(() => !!window.Chart && !!Chart.getChart('ch')), 'карта: динамика и график');
await page.screenshot({ path: '/tmp/live_report2.png', fullPage: true });
await page.context().close();

// 8. напоминания через настоящий cron-эндпоинт
await sql(`update reminders set next_at=${Date.now() - 5000}, attempts=0, last_sent_at=null, next_kind='short' where client_id='${c.id}'`);
const cron = () => fetch(U + '/cron', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } }).then((r) => r.json());
ok((await fetch(U + '/cron', { method: 'POST', headers: { 'x-cron-secret': 'no' } })).status === 403, '/cron без секрета: 403');
let j = await cron(); ok(j.ok && j.log.some((x) => x.startsWith('sent Тест short attempt 1')), 'cron: первое напоминание ушло ' + JSON.stringify(j.log));
j = await cron(); ok(j.log.length === 0, 'cron: повторно сразу ничего');
await sql(`update reminders set last_sent_at=${Date.now() - 24 * 3600e3} where client_id='${c.id}'`);
j = await cron(); ok(j.log.some((x) => x.includes('attempt 2')), 'cron: через 24 ч повторное напоминание');
await sql(`update reminders set last_sent_at=${Date.now() - 24 * 3600e3} where client_id='${c.id}'`);
j = await cron(); ok(j.log.some((x) => x.startsWith('missed Тест')), 'cron: ещё через 24 ч «не прошёл(ла) ретест» Егору');
r = (await sql("select * from reminders where client_id='" + c.id + "'"))[0];
ok(Number(r.attempts) === 0 && Number(r.next_at) > Date.now() + 6 * DAY, 'цикл сдвинут на следующую неделю');
// pg_cron действительно настроен
const job = await sql("select jobname, schedule, active from cron.job where jobname='diag-hourly'");
ok(job.length === 1 && job[0].active && job[0].schedule === '0 * * * *', 'pg_cron: задание «каждый час» активно');
await hook(cb(ADMIN, `sm:${c.id}:off`));

// 9. чужой chat_id и подделки
const before = (await sql('select count(*)::int n from clients'))[0].n;
for (const t of ['/clients', '/export Тест', '/delete Тест', '/new Хакер']) await hook(msg(9999, t));
await hook(cb(9999, 'del:' + c.id)); await hook(cb(9999, 'ai:' + c.id));
ok((await sql('select count(*)::int n from clients'))[0].n === before && (await sql("select * from clients where name='Хакер'")).length === 0, 'чужой chat_id: ни /clients, ни /delete, ни /new не работают');
const bad = await fetch(U + '/api/submit', { method: 'POST', body: JSON.stringify({ initData: initData(ADMIN).replace(/hash=.{4}/, 'hash=0000'), kind: 'full', answers: SPEC, concernText: 'a', concernScore: 1, successText: 'b' }) });
ok(bad.status === 401, 'initData с неверной подписью: 401');

// 10. веб-вход + deep link + красный флаг
page = await newPage(false);
await page.waitForSelector('#btnStart');
await page.fill('#name', 'Веб Клиент'); await page.check('#consent'); await page.click('#btnStart'); await page.waitForSelector('.sticky');
const mw = { ...map, 38: 8 }; await setAns(page, mw); await main(page);
await page.click('#btnSubmit');
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 20000 });
t = await page.textContent('#app');
ok(t.includes('Вы отметили, что бывают мысли') && t.includes('Написать терапевту'), 'веб: мягкий текст безопасности при ответе 8');
const href = await page.getAttribute('a[href*="start=s_"]', 'href');
ok(/^https:\/\/t\.me\/depression_test_from_egor_bot\?start=s_[0-9a-f]+$/.test(href), 'веб: deep link ' + href);
await page.screenshot({ path: '/tmp/live_web_done.png' });
await page.context().close();
await hook(msg(5005, '/start ' + href.split('start=')[1]));
ok(String((await sql("select chat_id from clients where name='Веб Клиент'"))[0].chat_id) === '5005', 'deep link привязал чат к веб-клиенту');

// 11. удаление
await hook(msg(ADMIN, '/delete Тест'));
ok((await sql("select count(*)::int n from clients where name='Тест'"))[0].n === 1, '/delete без подтверждения ничего не удаляет');
await hook(cb(ADMIN, 'del:' + c.id));
const w = (await sql("select id from clients where name='Веб Клиент'"))[0];
await hook(cb(ADMIN, 'del:' + w.id));
ok((await sql('select (select count(*) from clients)::int a, (select count(*) from submissions)::int b, (select count(*) from reminders)::int d'))[0].a === 0, 'тестовые клиенты удалены полностью');

await browser.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nВСЕ ПРОВЕРКИ НА ЖИВЫХ СЕРВИСАХ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
