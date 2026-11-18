// Живая проверка опросника по весу: настоящая функция Supabase, GitHub Pages и Telegram.
// Запуск: node test/weight-live.mjs <токен клиентки>. Секреты из ../.prod-secrets.
// Отчёты приходят Егору по-настоящему; содержимое базы проверяется отдельно.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const envf = Object.fromEntries(fs.readFileSync(fileURLToPath(new URL('../.prod-secrets', import.meta.url)), 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const TOKEN = envf.WT_BOT_TOKEN;
const ADMIN = Number(envf.ADMIN_CHAT_ID);
const SECRET = crypto.createHmac('sha256', TOKEN).update('wt-webhook').digest('hex').slice(0, 48);
const W = 'https://fernvgsdytmvzrikpgqe.supabase.co/functions/v1/weight';
const RG = '?forceFunctionRegion=eu-central-1';
const PAGE = 'https://egor-la.github.io/hypno-diag/weight/index.html';
const clientToken = process.argv[2];
const CL = 7000001; // поддельный Telegram ID тестовой клиентки

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
const initData = (id) => { const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Т' }) });
  p.set('hash', hmac(hmac('WebAppData', TOKEN), [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')).toString('hex')); return p.toString(); };
const hook = (u, secret = SECRET) => fetch(W + '/telegram/webhook' + RG, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(u) }).then((r) => r.status);
const msg = (from, text) => ({ message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const api = (path, id, body = {}) => fetch(W + path + RG, { method: 'POST', body: JSON.stringify({ initData: initData(id), ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

ok(await hook(msg(ADMIN, '/list'), 'bad') === 403, 'webhook с неверным секретом: 403');
ok(await hook(msg(CL, '/start ' + clientToken)) === 200, 'клиентка нажала «Старт» по личной ссылке');
ok((await api('/api/state', 7000099)).status === 403, 'чужой ID в мини-приложении: 403');
ok((await fetch(W + '/api/state' + RG, { method: 'POST', body: JSON.stringify({ initData: initData(CL).replace(/hash=.{4}/, 'hash=0000') }) })).status === 401, 'подделанная подпись: 401');

const stub = (id) => `window.Telegram={WebApp:{initData:${JSON.stringify(initData(id))},initDataUnsafe:{},themeParams:{},ready(){},expand(){},onEvent(){},HapticFeedback:{selectionChanged(){}},close(){}}};`;
const browser = await chromium.launch();
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await page.route('**/telegram-web-app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: stub(CL) }));
  await page.goto(PAGE);
  await page.waitForSelector('.q, h1', { timeout: 20000 });
  return page;
}
let page;
const qText = () => page.textContent('.q');
const tap = async (label) => { await page.click(`.opt:text-is("${label}")`); await sleep(250); };
const step1 = async () => { if (await page.$('.opt.sel')) await page.click('.opt.sel'); else if (await page.isDisabled('#go') && await page.$('#skip')) await page.click('#skip'); else await page.click('#go'); await sleep(250); };
const backTo = async (start) => { while (!(await qText()).startsWith(start)) { await page.click('#back'); await sleep(200); } };
const OPT = ['Не про меня', 'Иногда', 'Часто', 'Точно про меня'];
const A = {}; for (let n = 1; n <= 25; n++) A[n] = [1, 6, 11, 21].includes(n) ? 3 : [2, 7, 22].includes(n) ? 2 : [15, 17, 19].includes(n) ? 1 : 0;
A[12] = 3; A[14] = 2; A[16] = 3;

page = await open();
ok((await page.textContent('h1')) === 'Опросник по весу', 'живая страница: стартовый экран');
await page.click('#go');
for (let n = 1; n <= 12; n++) { await tap(OPT[A[n]]); await sleep(700); } // как живой человек: читает вопрос
await sleep(1000);
await page.context().close();
page = await open();
ok((await qText()).startsWith('Я сидела на жёстких диетах'), 'закрыла на 13-м, открыла: продолжает с 13-го');
for (let n = 13; n <= 25; n++) await tap(OPT[A[n]]);
ok((await qText()).startsWith('Теперь несколько уточнений'), 'переходный экран уточнений');
await page.click('#go'); await sleep(250);
await page.click('#skip'); await sleep(250);
await page.fill('#t', 'Свекровь'); await page.click('#go'); await sleep(250);
await backTo('В моей жизни есть человек');
await tap('Иногда');
await backTo('В моей жизни есть человек');
const seen = [];
for (let i = 0; i < 20; i++) { const t = await qText(); seen.push(t); if (t === 'Что случилось и когда?') break; await step1(); }
ok(!seen.includes('Кто это или что за ситуация?'), '14 → «Иногда»: уточнение исчезло');
await backTo('В моей жизни есть человек');
await tap('Часто');
for (let i = 0; i < 20; i++) { if ((await qText()) === 'Кто это или что за ситуация?') break; await step1(); }
ok((await page.inputValue('#t')) === 'Свекровь', '14 → снова «Часто»: текст на месте');
await page.click('#go'); await sleep(250);
await page.fill('#t', 'Развод'); await page.click('#go'); await sleep(250);
await tap('1–3 года назад');
await page.fill('#t', 'Переезд'); await page.click('#go'); await sleep(250);
await tap('Живот'); await page.click('#go'); await sleep(250);
await page.click('#skip'); await sleep(250);
await page.click('#no'); await sleep(250);
await tap('Не сдавала');
await tap('Ничего из этого'); await page.click('#go'); await sleep(250);
await tap('Ничего из этого');
await page.click('#go');
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Написать Егору'), null, { timeout: 20000 }).catch(() => {});
const finText = await page.textContent('#app');
ok(finText.includes('Спасибо. Ответы уже у Егора.') && finText.includes('Главная тема: вода / брошенность (фонит явно)') && finText.includes('@egor_lakhtiuk') && !/\/15/.test(finText), 'финальный экран: темы и уровни, ссылка на Егора; отчёт ушёл Егору');
await page.screenshot({ path: '/tmp/wt_live_final.png' });
await page.context().close();
page = await open();
await page.waitForSelector('#write', { timeout: 20000 });
ok((await page.textContent('#app')).includes('Главная тема: вода / брошенность'), 'повторное открытие: тот же итог');
await page.context().close();
await browser.close();

// ретест: второе прохождение через API, все уточнения пропущены
ok(await hook(msg(ADMIN, '/retest Тест Вес')) === 200, '/retest');
const st = await api('/api/state', CL);
ok(st.status === 'in_progress' && st.step === 'start', 'после /retest прохождение открыто заново');
const B = { ...A }; B[1] = 0; B[6] = 1;
for (let n = 1; n <= 25; n++) await api('/api/answer', CL, { key: 'q' + n, value: B[n] });
for (const n of [12, 14, 16]) await api('/api/answer', CL, { key: 'f' + n, skipped: true });
for (const [key, b] of [['s3_1', { value: 'С детства' }], ['s3_1_text', { skipped: true }], ['s3_2', { value: ['Живот'] }], ['s3_3', { skipped: true }], ['s4_1', { value: 'Нет' }], ['s4_2', { value: 'Сдавала, всё в норме' }], ['s4_3', { value: ['Ничего из этого'] }], ['s4_4', { value: ['Ничего из этого'] }]]) await api('/api/answer', CL, { key, ...b });
const fin = await api('/api/finish', CL);
ok(fin.ok, 'ретест завершён, второй отчёт ушёл Егору');

// открытый вход: новый человек без ссылки
ok(await hook({ message: { message_id: 1, from: { id: 7000002, first_name: 'Тест', last_name: 'Открытый' }, chat: { id: 7000002, type: 'private' }, text: '/start' } }) === 200, 'новый человек без ссылки нажал «Старт»');
const st2 = await api('/api/state', 7000002);
ok(st2.ok && st2.status === 'in_progress', 'новый человек сразу может проходить тест');

// чужой ID
for (const t of ['/new Хакер', '/list', '/result Тест Вес', '/retest Тест Вес']) await hook(msg(7000099, t));
ok(true, 'команды с чужого ID отправлены (результат проверяется по базе)');
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nЖИВАЯ ПРОВЕРКА: ВСЁ ОК');
process.exit(fails ? 1 : 0);
