// Поддельный Telegram Bot API для локальных тестов: записывает все вызовы.
import http from 'node:http';
const log = [];
let mid = 100;
http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    if (req.url === '/_log') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(log)); }
    if (req.url === '/_clear') { log.length = 0; return res.end('ok'); }
    const method = req.url.split('/').pop();
    let body = {};
    const ct = req.headers['content-type'] || '';
    if (ct.includes('json')) { try { body = JSON.parse(raw.toString()); } catch { /* */ } }
    else { const t = raw.toString('utf8'); body = { multipart: true, filename: (t.match(/filename="([^"]+)"/) || [])[1], text: t, chat_id: (t.match(/name="chat_id"\r\n\r\n(\d+)/) || [])[1] }; }
    log.push({ method, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: method === 'getMe' ? { username: 'testbot' } : { message_id: ++mid } }));
  });
}).listen(8788, () => console.log('mock tg on 8788'));
