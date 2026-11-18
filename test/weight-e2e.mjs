// Сквозная проверка опросника по весу: функция в Node + pglite (Postgres) + поддельный Telegram (8788) + статика (8000)
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { chromium } from 'playwright';
import worker from '../weight/src/index.js';
import { makePgDb, applySchema } from '../worker/src/pg.js';

const TOKEN = '777:WEIGHTTEST';
const ADMIN = 1001;
const pg = new PGlite();
const query = async (q, p) => (await pg.query(q, p)).rows;
await applySchema(query, fs.readFileSync(new URL('../weight/schema.sql', import.meta.url), 'utf8'));
const env = { DB: makePgDb(query), WT_BOT_TOKEN: TOKEN, ADMIN_CHAT_ID: String(ADMIN), WT_WEBHOOK_SECRET: 'ws', TG_API: 'http://127.0.0.1:8788', WT_PAGES_URL: 'http://127.0.0.1:8000/weight', WT_BOT_USERNAME: 'weightbot' };

// HTTP-обёртка над функцией
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request('http://127.0.0.1:8790' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8790);
const W = 'http://127.0.0.1:8790/functions/v1/weight';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
const initData = (id) => { const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'К' }) });
  p.set('hash', hmac(hmac('WebAppData', TOKEN), [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')).toString('hex')); return p.toString(); };
const hook = (u, secret = 'ws') => fetch(W + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(u) }).then((r) => r.status);
const msg = (from, text) => ({ message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const getLog = async () => (await fetch('http://127.0.0.1:8788/_log')).json();
const clearLog = () => fetch('http://127.0.0.1:8788/_clear');
const to = (log, chat) => log.filter((l) => String(l.body.chat_id) === String(chat));
const api = (path, id, body = {}) => fetch(W + path, { method: 'POST', body: JSON.stringify({ initData: initData(id), ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

// ---------- бот: ссылки ----------
await clearLog();
ok(await hook(msg(ADMIN, '/new Анна')) === 200, '/new принят');
let log = await getLog();
const link = to(log, ADMIN).at(-1).body.text;
const token = (link.match(/start=([0-9a-f]+)/) || [])[1];
ok(!!token && link.includes('https://t.me/weightbot?start='), '/new: личная ссылка ' + link.split('\n').at(-1));
ok(await hook(msg(ADMIN, '/list'), 'bad') === 403, 'webhook с неверным секретом: 403');
const NO_LINK = 'Этот опросник открывается по личной ссылке. Попросите её у Егора';
await clearLog();
await hook(msg(4004, '/start'));
await hook(msg(4004, '/start 0123456789abcdef01234567'));
log = await getLog();
ok(to(log, 4004).length === 2 && to(log, 4004).every((m) => m.body.reply_markup?.inline_keyboard[0][0].text === 'Пройти опросник'), 'открытый вход: без токена человек сразу получает кнопку опросника');
ok((await pg.query('select count(*)::int n from wt_clients where tg_user_id = 4004')).rows[0].n === 1, 'без токена создаётся одна запись, повторный /start её не дублирует');
ok(to(log, ADMIN).some((m) => m.body.text.startsWith('Новый человек:')), 'Егору: «Новый человек»');
const CL = 3003;
await clearLog();
await hook(msg(CL, '/start ' + token));
log = await getLog();
const greet = to(log, CL).at(-1).body;
ok(greet.reply_markup?.inline_keyboard[0][0].text === 'Пройти опросник' && greet.reply_markup.inline_keyboard[0][0].web_app.url === 'http://127.0.0.1:8000/weight/index.html', 'клиентка привязана, кнопка «Пройти опросник»');
await hook(msg(4004, '/start ' + token));
log = await getLog();
ok((await pg.query("select tg_user_id from wt_clients where name='Анна'")).rows[0].tg_user_id == CL, 'чужой Telegram ID по чужому токену не перехватывает клиентку');
ok((await api('/api/state', 4005)).status === 403, 'мини-приложение для ID, который не нажимал «Старт»: 403');
ok((await fetch(W + '/api/state', { method: 'POST', body: JSON.stringify({ initData: initData(CL).replace(/hash=.{4}/, 'hash=0000') }) })).status === 401, 'подделанная подпись: 401');

// ---------- мини-приложение ----------
const stub = (id) => `window.Telegram={WebApp:{initData:${JSON.stringify(initData(id))},initDataUnsafe:{},themeParams:{},ready(){},expand(){},onEvent(){},HapticFeedback:{selectionChanged(){}},close(){}}};`;
const browser = await chromium.launch();
async function open(id) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await page.route('**/telegram-web-app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: stub(id) }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.goto(`http://127.0.0.1:8000/weight/index.html?api=${encodeURIComponent(W)}`);
  await page.waitForSelector('.q, h1');
  return page;
}
const qText = (p) => p.textContent('.q');
const tap = async (p, label) => { await p.click(`.opt:text-is("${label}")`); await sleep(120); };
const OPT = ['Не про меня', 'Иногда', 'Часто', 'Точно про меня'];
// ответы: q12=3, q14=2, q16=3 (уточнения 12, 14, 16), остальные по схеме
const A = {}; for (let n = 1; n <= 25; n++) A[n] = [1, 6, 11, 21].includes(n) ? 3 : [2, 7, 22].includes(n) ? 2 : [15, 17, 19].includes(n) ? 1 : 0;
A[12] = 3; A[14] = 2; A[16] = 3;

let page = await open(CL);
ok((await page.textContent('h1')) === 'Опросник по весу' && (await page.textContent('#app')).includes('Займёт 5–7 минут.') && (await page.textContent('#app')).includes('Ответы увидит только Егор.'), 'стартовый экран дословно');
ok(await page.$eval('#back', (b) => b.classList.contains('hidden')), 'на первом экране нет «Назад»');
await page.click('#go');
ok((await page.textContent('.head')) === 'Насколько это про вас?' && (await qText(page)).startsWith('Мой вес может прыгнуть'), 'вопрос 1 и заголовок «Насколько это про вас?»');
ok(!(await page.textContent('#app')).match(/вода|брошенност|ГНМ|балл/i), 'нет блоков, баллов и «ГНМ» на экране');
for (let n = 1; n <= 12; n++) await tap(page, OPT[A[n]]);
ok((await qText(page)).startsWith('Я сидела на жёстких диетах'), 'после 12 ответов открыт вопрос 13');
await sleep(500);
await page.context().close();
page = await open(CL);
ok((await qText(page)).startsWith('Я сидела на жёстких диетах'), 'закрыла на 13-м, открыла: продолжает с 13-го');
const bar1 = await page.$eval('.bar i', (i) => i.style.width);
ok(parseInt(bar1, 10) > 30, 'прогресс сохранился: ' + bar1);
for (let n = 13; n <= 25; n++) await tap(page, OPT[A[n]]);
ok((await qText(page)).startsWith('Теперь несколько уточнений'), 'переходный экран уточнений');
await page.click('#go');
ok((await page.textContent('.orig')).startsWith('Мне говорили обидное') && (await qText(page)) === 'Кто это сказал и что именно?', 'уточнение к 12: серым исходное утверждение');
await page.click('#skip'); await sleep(100);
ok((await qText(page)) === 'Кто это или что за ситуация?', 'уточнение к 14');
await page.fill('#t', 'Свекровь, когда приезжает'); await page.click('#go'); await sleep(100);
ok((await qText(page)) === 'Что случилось и когда?', 'уточнение к 16 (15, 17, 19 пропущены: ответы 0–1)');
// назад до вопроса 14 и меняем на «Иногда»
const backTo = async (start) => { while (!(await qText(page)).startsWith(start)) { await page.click('#back'); await sleep(100); } };
await backTo('В моей жизни есть человек или ситуация');
await tap(page, 'Иногда');
await backTo('В моей жизни есть человек');
ok(true, 'вернулась к 14 и сменила на «Иногда»');
// вперёд до уточнений: 14-го быть не должно
// шаг вперёд: выбранный вариант, «Дальше» или «Пропустить», если поле пустое
const step1 = async () => { if (await page.$('.opt.sel')) await page.click('.opt.sel'); else if (await page.isDisabled('#go') && await page.$('#skip')) await page.click('#skip'); else await page.click('#go'); await sleep(120); };
const forwardThrough = async () => { const seen = []; for (let i = 0; i < 20; i++) { const t = await qText(page); seen.push(t); if (t === 'Что случилось и когда?' || t.startsWith('Когда вес начал')) break; await step1(); } return seen; };
let seen = await forwardThrough();
ok(!seen.includes('Кто это или что за ситуация?') && seen.includes('Кто это сказал и что именно?'), 'уточнение к 14 исчезло');
await backTo('В моей жизни есть человек');
await tap(page, 'Часто');
seen = [];
for (let i = 0; i < 20; i++) { const t = await qText(page); if (t === 'Кто это или что за ситуация?') break; await step1(); }
ok((await page.inputValue('#t')) === 'Свекровь, когда приезжает', 'сменила обратно на «Часто»: текст на месте');
await page.click('#go'); await sleep(100);
await page.fill('#t', 'Развод в 2021 году'); await page.click('#go'); await sleep(100);
ok((await qText(page)) === 'Когда вес начал расти или перестал уходить?', 'этап 3.1');
await tap(page, '1–3 года назад');
ok((await qText(page)) === 'Что происходило в вашей жизни за год до этого?', '3.1 текст');
await page.fill('#t', 'Переезд'); await page.click('#go'); await sleep(100);
ok((await qText(page)) === 'Где в основном копится вес?' && await page.isDisabled('#go'), '3.2: «Дальше» неактивна без выбора');
await tap(page, 'Живот'); await tap(page, 'Другое');
ok(await page.isVisible('#t'), '3.2: при «Другое» появилось поле');
await page.fill('#t', 'Шея'); await page.click('#go'); await sleep(100);
await page.click('#skip'); await sleep(100);
ok((await qText(page)) === 'Принимаете ли вы постоянно какие-то препараты?', '4.1');
await page.click('#yes'); await sleep(100);
ok(await page.isDisabled('#go'), '4.1 «Да»: поле «Какие?» обязательное');
await page.fill('#t', 'Эутирокс'); await page.click('#go'); await sleep(100);
await tap(page, 'Сдавала, были отклонения');
ok(await page.isVisible('#t'), '4.2: при отклонениях поле «Какие?»');
await page.click('#skip'); await sleep(100);
await tap(page, 'Ем много и не могу остановиться'); await tap(page, 'Ничего из этого');
ok((await page.$$eval('.opt.sel', (e) => e.map((x) => x.textContent))).join() === 'Ничего из этого', '4.3: «Ничего из этого» снимает остальные');
await tap(page, 'Вызываю рвоту после еды');
ok((await page.$$eval('.opt.sel', (e) => e.map((x) => x.textContent))).join() === 'Вызываю рвоту после еды', '4.3: и наоборот');
await page.click('#go'); await sleep(100);
ok((await qText(page)) === 'Что из этого относится к вам сейчас?', '4.4');
await tap(page, 'Менопауза или её начало');
await clearLog();
await page.screenshot({ path: '/tmp/wt_44.png' });
await page.click('#go');
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Написать Егору'), null, { timeout: 8000 }).catch(async () => console.log('НА ЭКРАНЕ:', await page.textContent('#app'), await page.isVisible('#err')));
const fin = await page.textContent('#app');
ok(fin.includes('Спасибо. Ответы уже у Егора.') && fin.includes('Главная тема: вода / брошенность (фонит явно)') && fin.includes('Ещё участвует: внешность / жир (фонит явно)') && fin.includes('@egor_lakhtiuk') && !/\d+\/15|балл/.test(fin), 'финальный экран: темы и уровни без цифр, ссылка на Егора');
await page.context().close();
page = await open(CL);
await page.waitForSelector('#write');
ok((await page.textContent('#app')).includes('Главная тема: вода / брошенность'), 'повторное открытие: тот же итог');
await page.context().close();

log = await getLog();
const rep = to(log, ADMIN).filter((m) => m.method === 'sendMessage').map((m) => m.body.text).join('\n');
const doc = log.find((l) => l.method === 'sendDocument');
console.log('--- ОТЧЁТ ---\n' + rep + '\n-------------');
const toClient = to(log, CL).at(-1)?.body;
ok(toClient?.text.startsWith('Спасибо. Ответы уже у Егора.') && toClient.text.includes('Главная тема: вода / брошенность (фонит явно)') && toClient.reply_markup?.inline_keyboard[0][0].url === 'https://t.me/egor_lakhtiuk', 'клиентке в бот: итог и кнопка «Написать Егору»');
ok(rep.startsWith('🧾 Опросник по весу: Анна') && rep.includes('прохождение №1'), 'отчёт: заголовок');
ok(rep.includes('🔴 Флаги\n🔴 Рвота / слабительные. Возможное РПП, нужен врач'), 'отчёт: красный флаг');
ok(rep.includes('ГЛАВНАЯ ТЕМА: А вода / брошенность (15/15, фонит явно)'), 'отчёт: главная тема А');
ok(rep.includes('к вопросу 12 (обидное про фигуру): пропустила') && rep.includes('к вопросу 14 (страшно и противно): Свекровь, когда приезжает') && rep.includes('к вопросу 16 (событие-шок): Развод в 2021 году'), 'отчёт: её словами и «пропустила»');
ok(rep.includes('Начало: 1–3 года назад. За год до этого: Переезд') && rep.includes('Где копится: Живот, Другое: Шея') && rep.includes('Перед откатом: пропустила'), 'отчёт: этап 3');
ok(rep.includes('⚠️ Принимает препараты: Эутирокс') && rep.includes('⚠️ Отклонения в анализах: не уточнила') && rep.includes('⚠️ Менопауза или её начало'), 'отчёт: скрининг');
ok(rep.includes('Есть явное событие-шок (вопрос 16).'), 'отчёт: пометка про шок');
ok(doc && /^ves_Анна_\d{4}-\d{2}-\d{2}\.md$/.test(doc.body.filename) && doc.body.text.includes('## Ключ'), 'файл: ' + doc?.body.filename);
fs.writeFileSync('/tmp/ves_sample.md', doc.body.text.slice(doc.body.text.indexOf('# Опросник')));

// ---------- /list, /result, /retest ----------
await clearLog();
await hook(msg(ADMIN, '/new Мария'));
await hook(msg(ADMIN, '/list'));
log = await getLog();
const list = to(log, ADMIN).at(-1).body.text;
ok(list.includes('Анна: прошла,') && list.includes('Мария: не начала'), '/list: ' + list.replace(/\n/g, ' | '));
await clearLog();
await hook(msg(ADMIN, '/result Анна'));
log = await getLog();
ok(to(log, ADMIN).some((m) => m.body.text?.startsWith('🧾 Опросник по весу: Анна')) && log.some((l) => l.method === 'sendDocument'), '/result: отчёт и файл');
await clearLog();
await hook(msg(ADMIN, '/retest Анна'));
log = await getLog();
ok(to(log, ADMIN).at(-1).body.text.includes('Открыто прохождение №2') && to(log, ADMIN).at(-1).body.text.includes('start=' + token), '/retest: новое прохождение и ссылка');
let st = await api('/api/state', CL);
ok(st.status === 'in_progress' && st.step === 'start' && Object.keys(st.answers).length === 0, 'после /retest мини-приложение начинает заново');
// второе прохождение через API: А ниже
const full = async (id, q, opts = {}) => {
  for (let n = 1; n <= 25; n++) await api('/api/answer', id, { key: 'q' + n, value: q[n] });
  for (const n of [12, 14, 15, 16, 17, 19]) if (q[n] >= 2) await api('/api/answer', id, { key: 'f' + n, skipped: true });
  for (const [key, b] of [['s3_1', { value: 'С детства' }], ['s3_1_text', { skipped: true }], ['s3_2', { value: ['Живот'] }], ['s3_3', { skipped: true }], ['s4_1', { value: 'Нет' }], ['s4_2', { value: 'Сдавала, всё в норме' }], ['s4_3', { value: ['Ничего из этого'] }], ['s4_4', { value: ['Ничего из этого'] }]]) await api('/api/answer', id, { key, ...b });
  if (opts.skipFinish) return null;
  return api('/api/finish', id);
};
const B = { ...A }; B[1] = 0; B[6] = 1; B[2] = 3; B[7] = 3;
await clearLog();
const fr = await full(CL, B);
log = await getLog();
const rep2 = to(log, ADMIN).filter((m) => m.method === 'sendMessage').map((m) => m.body.text).join('\n');
console.log('--- ОТЧЁТ №2 (баллы) ---\n' + rep2.slice(rep2.indexOf('Баллы:'), rep2.indexOf('Пометки:')));
ok(fr.ok && rep2.includes('прохождение №2') && /А вода \/ брошенность: \d+ \(было 15, −\d+\)/.test(rep2) && rep2.includes('Скрининг:\nбез замечаний'), 'ретест: изменения к прошлому разу, скрининг без замечаний');
ok((await api('/api/answer', CL, { key: 'q1', value: 1 })).status === 409, 'после завершения ответы не принимаются');

// все уточнения пропущены
await clearLog();
await hook(msg(5005, '/start ' + (await pg.query("select token from wt_clients where name='Мария'")).rows[0].token));
const M = {}; for (let n = 1; n <= 25; n++) M[n] = 2;
const fm = await full(5005, M);
log = await getLog();
const rep3 = to(log, ADMIN).filter((m) => m.method === 'sendMessage').map((m) => m.body.text).join('\n');
ok(fm.ok && (rep3.match(/: пропустила/g) || []).length >= 8 && rep3.includes('Перед откатом: пропустила'), 'все уточнения пропущены: «пропустила», ничего не ломается');
ok((await api('/api/finish', 5005)).already === true, 'повторный finish не шлёт второй отчёт');

// незавершённое: finish вернёт первый пропущенный экран
await hook(msg(ADMIN, '/new Ольга'));
await hook(msg(6006, '/start ' + (await pg.query("select token from wt_clients where name='Ольга'")).rows[0].token));
await api('/api/answer', 6006, { key: 'q1', value: 2 });
const inc = await api('/api/finish', 6006);
ok(inc.status === 400 && inc.step === 'q2', 'незаполненное прохождение не завершается: ' + inc.step);
ok((await api('/api/answer', 6006, { key: 'q2', value: 7 })).status === 400 && (await api('/api/answer', 6006, { key: 's4_3', value: ['Ничего из этого', 'Вызываю рвоту после еды'] })).status === 400 && (await api('/api/answer', 6006, { key: 'zzz', value: 1 })).status === 400, 'неверные ответы отклоняются');

// чужой ID и команды
const before = (await pg.query('select count(*)::int n from wt_clients')).rows[0].n;
await clearLog();
for (const t of ['/new Хакер', '/list', '/result Анна', '/retest Анна']) await hook(msg(9999, t));
log = await getLog();
const other = to(log, 9999).map((m) => m.body.text);
ok((await pg.query("select count(*)::int n from wt_clients where name like '%Хакер%'")).rows[0].n === 0 && other.every((t) => t === 'Чтобы пройти опросник по весу, нажмите /start') && !log.some((l) => l.method === 'sendDocument'), 'команды администратора не работают с чужого ID');
ok((await pg.query("select count(*)::int n from wt_sessions s join wt_clients c on c.id=s.client_id where c.name='Анна'")).rows[0].n === 2, '/retest с чужого ID не создал прохождение');
// RLS включена
const rls = (await pg.query("select relname, relrowsecurity from pg_class where relname like 'wt_%' and relkind='r'")).rows;
ok(rls.length === 3 && rls.every((r) => r.relrowsecurity), 'RLS включена на трёх таблицах');

await browser.close();
server.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nВЕС: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
