// Локальный сквозной тест: поддельный Telegram (8788) + wrangler dev (8787) + статика (8000)
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 'http://127.0.0.1:8787';
const PAGES = 'http://127.0.0.1:8000';
const TOKEN = '123456:TESTTOKEN';
const ADMIN = 1001;
const SPEC = [2,5,5,2,0,0, 0,0,4,0,0,0, 0,2,0,0,0, 3,4,4,0,2,0, 5,0,2,4,5, 0,5,5,2,2, 5,4,8,3,4,1, 0,2,3,0,0, 0,0,0,0,0, 0,0,0,0,0,0];
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
function initData(userId, name = 'Тест') {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q' + Math.random(), user: JSON.stringify({ id: userId, first_name: name }) });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  p.set('hash', hmac(hmac('WebAppData', TOKEN), dcs).toString('hex'));
  return p.toString();
}
const reportKey = (id) => hmac('localreportsecret', 'report:' + id).toString('hex').slice(0, 32);

async function webhook(update, secret = 'localwebhooksecret') {
  const r = await fetch(W + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
  return r.status;
}
const msg = (from, text) => ({ message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const cb = (from, data) => ({ callback_query: { id: 'cb' + Math.random(), from: { id: from }, data, message: { message_id: 5, chat: { id: from, type: 'private' } } } });
const getLog = async () => (await fetch('http://127.0.0.1:8788/_log')).json();
const clearLog = () => fetch('http://127.0.0.1:8788/_clear');
const sentTo = (log, chat, method = 'sendMessage') => log.filter((l) => l.method === method && String(l.body.chat_id) === String(chat));

function sql(q) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'hypno-diag', '--local', '--json', '--command', q], { cwd: fileURLToPath(new URL('../worker', import.meta.url)), encoding: 'utf8' });
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[0].results || [];
}

const stub = (data, user) => `
window.Telegram = { WebApp: { initData: ${JSON.stringify(data)}, initDataUnsafe: { user: ${JSON.stringify(user)} }, themeParams: {}, ready(){}, expand(){}, onEvent(){}, offEvent(){},
  HapticFeedback: { impactOccurred(){ window.__haptic = (window.__haptic||0)+1; } },
  MainButton: { _t:'', setText(t){ this._t=t; window.__mbText=t; }, show(){}, hide(){}, enable(){}, disable(){}, showProgress(){}, hideProgress(){},
    onClick(f){ window.__mb = f; }, offClick(){} },
  close(){ window.__closed = true; }, openTelegramLink(){} } };`;

async function newPage(browser, { tgUser, kind = 'full', darkMode = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: darkMode ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  if (tgUser) {
    await page.route('**/telegram-web-app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: stub(initData(tgUser), { id: tgUser, first_name: 'Тест' }) }));
  } else {
    await page.route('**/telegram-web-app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.Telegram={WebApp:{initData:"",ready(){},expand(){}}};' }));
  }
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.goto(`${PAGES}/index.html?api=${encodeURIComponent(W)}&kind=${kind}`);
  return page;
}

async function setAnswers(page, idxToVal) {
  await page.evaluate((m) => {
    for (const [i, v] of Object.entries(m)) {
      const el = document.getElementById('s' + i);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, idxToVal);
}

async function fillMain(page, { concern = 'Не могу расслабиться, всё время внутреннее напряжение', score = 8, success = 'Смогу спокойно спать и не прокручивать мысли', other = 'Ещё иногда болит голова', week = 'Стало чуть спокойнее' } = {}) {
  if (await page.$('#concernText')) {
    await page.fill('#concernText', concern);
    await setAnswers2(page, 'sc', score);
    await page.fill('#successText', success);
    await page.fill('#otherText', other);
  } else {
    await setAnswers2(page, 'sc', score);
    await page.fill('#weekNote', week);
  }
}
async function setAnswers2(page, id, v) {
  await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
}

async function pressSubmit(page, inTg) {
  if (inTg) await page.evaluate(() => window.__mb());
  else await page.click('#btnSubmit');
}

const browser = await chromium.launch();
await clearLog();
sql('DELETE FROM submissions; DELETE FROM reminders; DELETE FROM clients;');

// ---------- 1. /new ----------
ok(await webhook(msg(ADMIN, '/new Тест')) === 200, 'webhook принял /new');
let log = await getLog();
const newReply = sentTo(log, ADMIN).at(-1)?.body.text || '';
const invite = (newReply.match(/start=([0-9a-f]+)/) || [])[1];
ok(!!invite && newReply.includes('https://t.me/testbot?start='), '/new вернул ссылку-инвайт: ' + newReply.split('\n').find((l) => l.includes('t.me')));

// неверный секрет webhook
ok(await webhook(msg(ADMIN, '/clients'), 'wrong') === 403, 'webhook с неверным секретом отклонён (403)');

// ---------- 2. /start invite ----------
const CLIENT = 2002;
await clearLog();
await webhook(msg(CLIENT, '/start ' + invite));
log = await getLog();
const greet = sentTo(log, CLIENT).at(-1)?.body;
ok(greet?.text.includes('Здравствуйте, Тест!') && greet.reply_markup?.inline_keyboard[0][0].web_app?.url.includes('/index.html?kind=full'), 'клиент получил приветствие по имени и кнопку Mini App');
ok(sentTo(log, ADMIN).some((m) => m.body.text.includes('подключился')), 'Егор получил уведомление о подключении');
// повторное использование инвайта другим чатом
await clearLog();
await webhook(msg(4004, '/start ' + invite));
log = await getLog();
ok(sentTo(log, 4004).at(-1)?.body.text.includes('уже привязана'), 'инвайт нельзя использовать из другого чата');

// ---------- 3. Mini App: первичное прохождение ----------
await clearLog();
let page = await newPage(browser, { tgUser: CLIENT });
await page.waitForSelector('#btnStart');
ok((await page.textContent('h1')) === 'Опросник состояния', 'заголовок «Опросник состояния»');
ok((await page.textContent('.card')).includes('0 значит «этого нет, как в мой лучший период». 10 значит «выражено максимально прямо сейчас»'), 'инструкция на старте');
ok(await page.isDisabled('#btnStart'), 'без согласия начать нельзя');
await page.check('#consent');
await page.click('#btnStart');
await page.waitForSelector('.sticky');
ok((await page.textContent('#pcount')) === 'Отвечено 0 из 55', 'прогресс 0 из 55');
ok((await page.textContent('.q .val')) === '–', 'значение до касания «–»');
// неактивная отправка: скролл и подсветка первого неотвеченного
await page.evaluate(() => window.__mb());
await sleep(300);
ok(await page.evaluate(() => !!document.querySelector('.q.flash')), 'нажатие на неактивную подсвечивает первый неотвеченный');
// реальное касание ползунка клавишей
await page.focus('#s0');
await page.keyboard.press('ArrowRight');
ok((await page.textContent('.q[data-i="0"] .val')) === '1', 'после касания слайдера показано значение');
ok((await page.evaluate(() => window.__haptic || 0)) >= 1, 'HapticFeedback сработал');
// касание без сдвига (pointerup по ползунку на 0)
const box = await (await page.$('#s1')).boundingBox();
await page.touchscreen.tap(box.x + 20, box.y + box.height / 2);
await sleep(200);
const v1 = await page.textContent('.q[data-i="1"] .val');
ok(v1 !== '–', 'тап по ползунку считается ответом (значение ' + v1 + ')');
// ответы первого блока целиком -> раскрывается следующий
const map = {}; SPEC.forEach((v, i) => { map[i] = v; });
const first = {}; for (let i = 0; i < 6; i++) first[i] = SPEC[i];
await setAnswers(page, first);
await sleep(300);
ok(await page.evaluate(() => document.querySelectorAll('.blk')[1].classList.contains('open') && !document.querySelectorAll('.blk')[0].classList.contains('open')), 'после последнего вопроса блока раскрылся следующий');
// автосохранение и «Продолжить»
const savedRaw = await page.evaluate(() => Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
ok(savedRaw.length === 1 && savedRaw[0][1].includes('answers'), 'автосохранение в localStorage');
await page.reload();
await page.waitForSelector('#btnStart');
ok(await page.evaluate(() => !document.getElementById('resume').classList.contains('hidden') && document.getElementById('resume').textContent.includes('Продолжить с места, где остановились?')), 'вопрос «Продолжить с места...»');
await page.click('#btnResume');
await page.check('#consent').catch(() => {});
await page.click('#btnStart');
await page.waitForSelector('.sticky');
ok((await page.textContent('#pcount')) === 'Отвечено 6 из 55', 'после «Продолжить» ответы восстановлены (6 из 55)');
await setAnswers(page, map);
await sleep(200);
ok((await page.textContent('#pcount')) === 'Отвечено 55 из 55', 'отвечено 55 из 55');
ok(await page.evaluate(() => window.__mbText) === 'Далее', 'MainButton «Далее», пока нет «Главного»');
await fillMain(page);
ok(await page.evaluate(() => window.__mbText) === 'Отправить', 'MainButton «Отправить» при полном заполнении');
await page.screenshot({ path: '/tmp/shot_quiz_360.png' });
await pressSubmit(page, true);
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 8000 });
ok((await page.textContent('#app, #root')).includes('Спасибо, результаты пришли вам в чат.'), 'экран «Спасибо, результаты пришли вам в чат»');
ok(!(await page.textContent('#app, #root')).includes('Написать терапевту'), 'без критического ответа нет блока безопасности');
await page.waitForFunction(() => window.__closed === true, null, { timeout: 5000 });
ok(true, 'Mini App закрылся');
ok(await page.evaluate(() => Object.keys(localStorage).length === 0), 'после отправки localStorage очищен');
await page.screenshot({ path: '/tmp/shot_done.png' });
await page.context().close();

log = await getLog();
const adminMsgs = sentTo(log, ADMIN);
const am = adminMsgs.at(-1)?.body;
console.log('--- СООБЩЕНИЕ ЕГОРУ ---\n' + am?.text + '\n--------------------');
ok(am?.text.includes('Тест · первичный ·') && am.text.includes('Сумма 16,7/100 (минимальная выраженность)'), 'Егор: заголовок и сумма');
ok(am?.text.includes('🟨') && am.text.includes('1/10'), 'Егор: жёлтая плашка по критическому пункту (1)');
ok(am?.text.includes('Самокритика 8 (сфера 4,2)'), 'Егор: самокритика 8 в выбросах');
ok(am?.text.includes('Общение с людьми: Меньше желания общаться 0, но Избегание контактов 5 и Трудно в компании 5'), 'Егор: противоречие в «Общении»');
ok(am?.text.includes('«Не могу расслабиться, всё время внутреннее напряжение»'), 'Егор: беспокойство дословно');
const btns = am?.reply_markup?.inline_keyboard.flat().map((b) => b.text) || [];
ok(['Открыть карту', 'Файл для ИИ', 'Ретест', 'Полный ретест сейчас', 'Короткий ретест сейчас'].every((t) => btns.includes(t)), 'Егор: все инлайн-кнопки');
const cm = sentTo(log, CLIENT).at(-1)?.body.text || '';
console.log('--- СООБЩЕНИЕ КЛИЕНТУ ---\n' + cm + '\n------------------------');
ok(cm.startsWith('Ваши результаты') && cm.includes('Обсудим это на встрече.') && (cm.match(/▰|▱/g) || []).length === 100, 'Клиент: 10 строк по 10 делений и «Обсудим это на встрече»');
ok(!/депресс|диагноз|степень|тяжёл/i.test(cm), 'Клиент: нет запрещённых слов');

const client = sql("SELECT * FROM clients WHERE name='Тест'")[0];
console.log('tz клиента из браузера:', client.tz);
ok(client && String(client.chat_id) === String(CLIENT), 'клиент определён по initData и сохранён');

// ---------- 4. карта ----------
const rUrl = btns.length ? am.reply_markup.inline_keyboard[0][0].url : '';
ok(rUrl === `${PAGES}/report.html?id=${client.id}&k=${reportKey(client.id)}`, 'ссылка «Открыть карту» с верным ключом');
page = await newPage(browser, {});
await page.goto(rUrl + '&api=' + encodeURIComponent(W));
await page.waitForSelector('h1');
await sleep(500);
let body = await page.textContent('#app, #root');
ok(body.includes('Тест') && body.includes('Главное для клиента') && body.includes('Точки входа'), 'карта открылась с ключом');
ok(body.includes('Выброс') && body.includes('Противоречия') && body.includes('Профиль по сферам'), 'карта: выбросы, противоречия, профиль');
ok(body.includes('Мысли «лучше бы меня не было»: сейчас 1/10'), 'карта: плашка безопасности');
await page.screenshot({ path: '/tmp/shot_report_1.png', fullPage: true });
await page.goto(`${PAGES}/report.html?id=${client.id}&k=badbadbadbad&api=${encodeURIComponent(W)}`);
await page.waitForSelector('h1');
ok((await page.textContent('#app, #root')).includes('Нет доступа'), 'карта с неверным ключом: «Нет доступа»');
await page.goto(`${PAGES}/report.html?api=${encodeURIComponent(W)}`);
await sleep(300);
ok((await page.textContent('#app, #root')).includes('Нет доступа'), 'карта без параметров: «Нет доступа»');
await page.context().close();
const rawNoKey = await fetch(`${W}/api/report?id=${client.id}&k=x`);
ok(rawNoKey.status === 403, 'API report с неверным ключом: 403');

// ---------- 5. файл для ИИ ----------
await clearLog();
await webhook(cb(ADMIN, 'ai:' + client.id));
log = await getLog();
const doc = log.find((l) => l.method === 'sendDocument');
ok(doc && /^Тест_\d{4}-\d{2}-\d{2}\.md$/.test(doc.body.filename), 'файл для ИИ: имя ' + doc?.body.filename);
const mdText = doc?.body.text || '';
ok(mdText.includes('# Инструкция для ассистента') && mdText.includes('# Все ответы') && mdText.includes('# Короткие ретесты') && mdText.includes('Самокритика'), 'файл для ИИ: структура');
fs.writeFileSync('/tmp/sample.md', mdText);

// ---------- 6. режимы ретеста ----------
const DAYMS = 24 * 3600 * 1000;
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: client.tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
const modes = [['full_1w', 7, 'full'], ['full_4w', 28, 'full'], ['mix_1w', 7, 'short'], ['off', null, null]];
for (const [m, days, kind] of modes) {
  await clearLog();
  await webhook(cb(ADMIN, `sm:${client.id}:${m}`));
  const row = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
  const sched = sql(`SELECT schedule FROM clients WHERE id='${client.id}'`)[0].schedule;
  if (m === 'off') { ok(!row && sched === 'off', 'режим off: расписания нет'); continue; }
  const expectDay = ruDate(Date.now() + days * DAYMS);
  const gotDay = ruDate(row.next_at);
  const hourMsk = new Intl.DateTimeFormat('ru-RU', { timeZone: client.tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(row.next_at));
  ok(sched === m && gotDay === expectDay && hourMsk.startsWith('11') && row.next_kind === kind, `режим ${m}: следующий ${gotDay} час ${hourMsk}, тип ${row.next_kind}, sched ${sched}`);
  log = await getLog();
  const conf = sentTo(log, ADMIN).at(-1)?.body.text || '';
  ok(conf.includes('Следующий ретест: ' + gotDay + ' 11:00'), `режим ${m}: подтверждение с датой`);
}
// клавиатура режимов отмечает текущий
await clearLog();
await webhook(cb(ADMIN, `sm:${client.id}:mix_1w`));
await webhook(cb(ADMIN, `rt:${client.id}`));
log = await getLog();
const kb = sentTo(log, ADMIN).at(-1)?.body.reply_markup.inline_keyboard.flat().map((b) => b.text);
ok(kb?.length === 4 && kb[2].startsWith('✓ ') && !kb[0].startsWith('✓'), 'выбор режима: 4 кнопки, текущий отмечен ✓ ' + JSON.stringify(kb));

// ---------- 7. короткий ретест (через Mini App) ----------
const pending = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
sql(`UPDATE reminders SET attempts=1, last_sent_at=${Date.now()}, next_kind='short', cycle_pos=2 WHERE client_id='${client.id}'`);
await clearLog();
page = await newPage(browser, { tgUser: CLIENT, kind: 'short' });
await page.waitForSelector('#btnStart');
ok((await page.textContent('.card')).includes('Займёт 2-3 минуты'), 'короткий ретест: «2-3 минуты»');
ok(!(await page.$('#consent')), 'у вернувшегося клиента нет галочки согласия');
await page.evaluate(() => window.__mb());
await page.waitForSelector('.sticky');
ok((await page.textContent('#pcount')) === 'Отвечено 0 из 10', 'короткий ретест: 10 пунктов');
const shortIdx = await page.evaluate(() => [...document.querySelectorAll('.q[data-i]')].map((e) => Number(e.dataset.i)));
console.log('пункты короткого ретеста:', shortIdx.join(','));
const newVals = {}; shortIdx.forEach((i) => { newVals[i] = Math.max(0, SPEC[i] - 2); });
// один пункт ухудшим
newVals[shortIdx[0]] = Math.min(10, SPEC[shortIdx[0]] + 2);
await setAnswers(page, newVals);
body = await page.textContent('#app, #root');
ok(body.includes('«Не могу расслабиться, всё время внутреннее напряжение»'), 'короткий ретест: подставлен текст главного беспокойства');
await fillMain(page, { score: 5, week: 'Стало чуть спокойнее' });
await page.screenshot({ path: '/tmp/shot_short_360.png' });
await pressSubmit(page, true);
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 8000 });
await page.context().close();
log = await getLog();
const am2 = sentTo(log, ADMIN).at(-1)?.body.text;
const cm2 = sentTo(log, CLIENT).at(-1)?.body.text;
console.log('--- ЕГОРУ (ретест) ---\n' + am2 + '\n--- КЛИЕНТУ (ретест) ---\n' + cm2 + '\n----------------------');
ok(am2.includes('короткий ретест') && am2.includes('Главное беспокойство: 5/10, было 8') && am2.includes('Лучше всего улучшилось') && am2.includes('Ухудшилось'), 'Егор: динамика короткого ретеста');
ok(cm2.includes('Чем меньше число, тем легче.') && cm2.includes('↓') && cm2.includes('↑') && cm2.includes('Главное беспокойство: было 8, сейчас 5'), 'Клиент: стрелки и «было 8, сейчас 5»');
const after = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
ok(after.next_kind === 'full' && after.cycle_pos === 3 && after.attempts === 0, 'mix_1w: после 3-го короткого следующий ретест полный (неделя 4)');
// полный ретест в этом цикле -> снова короткий
sql(`UPDATE reminders SET attempts=1, last_sent_at=${Date.now()} WHERE client_id='${client.id}'`);
page = await newPage(browser, { tgUser: CLIENT, kind: 'full' });
await page.waitForSelector('#btnStart');
await page.evaluate(() => window.__mb());
await page.waitForSelector('.sticky');
const map2 = {}; SPEC.forEach((v, i) => { map2[i] = Math.max(0, v - (i % 3 === 0 ? 1 : 0)); });
map2[35] = 5;
await setAnswers(page, map2);
await fillMain(page, { score: 6 });
await clearLog();
await pressSubmit(page, true);
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 8000 });
await page.context().close();
log = await getLog();
const am3 = sentTo(log, ADMIN).at(-1)?.body.text;
const cm3 = sentTo(log, CLIENT).at(-1)?.body.text;
console.log('--- ЕГОРУ (полный ретест) ---\n' + am3 + '\n--- КЛИЕНТУ (полный ретест) ---\n' + cm3 + '\n----------------------');
ok(am3.includes('полный ретест') && /Сумма .*Было/.test(am3), 'Егор: динамика полного ретеста');
const after2 = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
ok(after2.next_kind === 'short' && after2.cycle_pos === 0, 'mix_1w: после полного цикл снова с коротких');

// карта с динамикой
page = await newPage(browser, {});
await page.goto(rUrl + '&api=' + encodeURIComponent(W));
await page.waitForSelector('h1');
await page.waitForSelector('#ch', { timeout: 8000 }).catch(() => {});
await sleep(1200);
body = await page.textContent('#app, #root');
ok(body.includes('Динамика') && body.includes('Что изменилось за неделю') && body.includes('Стало чуть спокойнее'), 'карта: динамика и «что изменилось за неделю»');
ok(await page.evaluate(() => !!window.Chart && !!document.querySelector('#ch') && !!Chart.getChart('ch')), 'карта: график Chart.js построен');
await page.screenshot({ path: '/tmp/shot_report_2.png', fullPage: true });
await page.context().close();

// ---------- 8. напоминания ----------
sql(`UPDATE reminders SET next_at=${Date.now() - 5000}, attempts=0, last_sent_at=NULL, next_kind='short', cycle_pos=0 WHERE client_id='${client.id}'`);
await clearLog();
await webhook(msg(ADMIN, '/cron'));
log = await getLog();
let rem1 = sentTo(log, CLIENT).at(-1)?.body;
ok(rem1?.text === 'Тест, пора отметить, как вы. Займёт 2-3 минуты.' && rem1.reply_markup.inline_keyboard[0][0].web_app.url.endsWith('kind=short'), 'напоминание клиенту: текст и кнопка короткого ретеста');
await webhook(msg(ADMIN, '/cron'));
log = await getLog();
ok(sentTo(log, CLIENT).length === 1, 'повторный cron сразу не дублирует напоминание');
sql(`UPDATE reminders SET last_sent_at=${Date.now() - 24 * 3600 * 1000} WHERE client_id='${client.id}'`);
await webhook(msg(ADMIN, '/cron'));
log = await getLog();
ok(sentTo(log, CLIENT).length === 2 && sentTo(log, CLIENT).at(-1).body.text.startsWith('Напоминаю.'), 'через 24 часа одно повторное напоминание');
sql(`UPDATE reminders SET last_sent_at=${Date.now() - 24 * 3600 * 1000} WHERE client_id='${client.id}'`);
await webhook(msg(ADMIN, '/cron'));
log = await getLog();
ok(sentTo(log, ADMIN).some((m) => m.body.text === 'Тест не прошёл(ла) ретест') && sentTo(log, CLIENT).length === 2, 'ещё через 24 часа: Егору «не прошёл(ла) ретест», клиенту больше нет');
const rolled = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
ok(rolled.attempts === 0 && rolled.next_at > Date.now() + 6 * DAYMS, 'после пропуска цикл переходит на следующую неделю');
// возвращаем как было
await webhook(cb(ADMIN, `sm:${client.id}:off`));

// ---------- 9. безопасность доступа ----------
await clearLog();
await webhook(msg(9999, '/clients'));
await webhook(msg(9999, '/export Тест'));
await webhook(msg(9999, '/delete Тест'));
await webhook(msg(9999, '/new Хакер'));
await webhook(cb(9999, 'ai:' + client.id));
await webhook(cb(9999, 'del:' + client.id));
log = await getLog();
const leak = log.filter((l) => String(l.body.chat_id) === '9999').map((l) => l.body.text).join(' | ');
ok(!leak.includes('Тест') && !log.some((l) => l.method === 'sendDocument') && sql("SELECT * FROM clients WHERE name='Хакер'").length === 0 && sql(`SELECT * FROM clients WHERE id='${client.id}'`).length === 1, 'чужой chat_id не может /clients, /export, /delete, /new; данные на месте. Ответ: ' + leak.slice(0, 80));
// Mini App: подделанная подпись и чужой пользователь
const bad = await fetch(W + '/api/submit', { method: 'POST', body: JSON.stringify({ initData: initData(CLIENT).replace(/hash=.{4}/, 'hash=0000'), kind: 'full', answers: SPEC, concernText: 'a', concernScore: 1, successText: 'b' }) });
ok(bad.status === 401, 'initData с неверной подписью отклонён (401)');
const unk = await fetch(W + '/api/init', { method: 'POST', body: JSON.stringify({ initData: initData(7777), kind: 'full' }) });
ok(unk.status === 404, 'подписанный initData незнакомого пользователя: 404');

// ---------- 10. веб-вход + deep link + критический пункт >= 7 ----------
await clearLog();
page = await newPage(browser, {});
await page.waitForSelector('#btnStart');
ok(await page.isDisabled('#btnStart'), 'веб: без имени и согласия начать нельзя');
await page.fill('#name', 'Веб Клиент');
await page.check('#consent');
await page.click('#btnStart');
await page.waitForSelector('.sticky');
const mapW = {}; SPEC.forEach((v, i) => { mapW[i] = v; });
mapW[38] = 8;
await setAnswers(page, mapW);
await fillMain(page);
await pressSubmit(page, false);
await page.waitForFunction(() => document.getElementById('app').textContent.includes('Спасибо'), null, { timeout: 8000 });
body = await page.textContent('#app, #root');
ok(body.includes('Вы отметили, что бывают мысли, что лучше бы вас не было') && body.includes('Написать терапевту') && !body.includes('—'), 'веб: мягкий текст безопасности и кнопка «Написать терапевту»');
const href = await page.getAttribute('a.primary[href*="start=s_"]', 'href');
ok(/^https:\/\/t\.me\/testbot\?start=s_[0-9a-f]+$/.test(href), 'веб: deep link ' + href);
ok((await page.textContent('a.primary[href*="start=s_"]')).includes('Получать результаты и напоминания в Telegram'), 'веб: кнопка «Получать результаты и напоминания в Telegram»');
await page.screenshot({ path: '/tmp/shot_web_done.png' });
await page.context().close();
log = await getLog();
ok(sentTo(log, ADMIN).at(-1).body.text.startsWith('🟥 ПРОВЕРИТЬ: мысли «лучше бы меня не было» 8/10'), 'Егор: красная плашка при 8/10');
await clearLog();
const payloadId = href.split('start=')[1];
await webhook(msg(5005, '/start ' + payloadId));
log = await getLog();
const toWeb = sentTo(log, 5005).map((m) => m.body);
ok(toWeb.length === 2 && toWeb[1].text.startsWith('Ваши результаты') && toWeb[1].text.includes('Вы отметили, что бывают мысли') && toWeb[1].reply_markup?.inline_keyboard[0][0].url === 'https://t.me/egor_test', 'deep link s_<id> привязал чат и прислал результаты с кнопкой «Написать терапевту»');
const webClient = sql("SELECT * FROM clients WHERE name='Веб Клиент'")[0];
ok(String(webClient.chat_id) === '5005', 'веб-клиент привязан к chat_id');

// ---------- 11. /clients и /export ----------
await clearLog();
await webhook(msg(ADMIN, '/clients'));
log = await getLog();
const cl = sentTo(log, ADMIN).at(-1)?.body;
ok(cl.text.includes('Тест:') && cl.text.includes('Веб Клиент:') && cl.reply_markup.inline_keyboard.length === 2, '/clients: список и кнопки по именам');
await webhook(cb(ADMIN, 'cl:' + client.id));
await webhook(msg(ADMIN, '/export Тест'));
log = await getLog();
ok(sentTo(log, ADMIN).some((m) => m.body.text?.includes('Последняя сумма')) && log.some((l) => l.method === 'sendDocument' && l.body.filename.startsWith('Тест_')), 'карточка клиента и /export');
// ручной ретест не сбивает расписание
await webhook(cb(ADMIN, `sm:${client.id}:full_1w`));
const before = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
await clearLog();
await webhook(cb(ADMIN, `now:${client.id}:short`));
await webhook(cb(ADMIN, `now:${client.id}:full`));
log = await getLog();
const afterNow = sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`)[0];
ok(sentTo(log, CLIENT).length === 2 && afterNow.next_at === before.next_at, 'ручные ретесты отправлены, расписание не изменилось');

// ---------- 12. /delete ----------
await clearLog();
await webhook(msg(ADMIN, '/delete Тест'));
log = await getLog();
const conf = sentTo(log, ADMIN).at(-1)?.body;
ok(conf.text.includes('Удалить клиента «Тест»') && conf.reply_markup.inline_keyboard[0][0].text === 'Да, удалить', '/delete просит подтверждение');
ok(sql(`SELECT * FROM clients WHERE id='${client.id}'`).length === 1, 'до подтверждения данные на месте');
await webhook(cb(ADMIN, conf.reply_markup.inline_keyboard[0][0].callback_data));
ok(sql(`SELECT * FROM clients WHERE id='${client.id}'`).length === 0 && sql(`SELECT * FROM submissions WHERE client_id='${client.id}'`).length === 0 && sql(`SELECT * FROM reminders WHERE client_id='${client.id}'`).length === 0, '/delete удалил клиента, прохождения и расписание');
await webhook(msg(ADMIN, '/delete Веб Клиент'));
log = await getLog();
const c2 = sentTo(log, ADMIN).at(-1)?.body;
await webhook(cb(ADMIN, c2.reply_markup.inline_keyboard[0][0].callback_data));
ok(sql('SELECT * FROM clients').length === 0, 'тестовые клиенты удалены');

await browser.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
