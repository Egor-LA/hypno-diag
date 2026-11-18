// Отчёт Егору и файл .md по опроснику по весу
import {
  STATEMENTS, FOLLOWUPS, LETTERS, BLOCK_NAMES, BLOCK_SHORT, ANSWER_OPTIONS, TEXTS, S3_2_OPTIONS,
} from './questions.js';
import { levelOf } from './scoring.js';
import { activeFollowups } from '../../web/weight/steps.js';

const TZ = 'Asia/Saigon';

export function fmtDateTime(ts) {
  const p = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
  return p.replace(',', '');
}

export function fileDate(ts) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts)).split('.').reverse().join('-');
}

const said = (a) => (!a || a.skipped || !String(a.text ?? '').trim() ? 'пропустила' : String(a.text).trim());
const themeLine = (l, scores) => `${l} ${BLOCK_NAMES[l]} (${scores[l]}/15, ${levelOf(scores[l])})`;

function delta(now, prev) {
  if (prev == null) return '';
  const d = now - prev;
  return ` (было ${prev}, ${d === 0 ? 'без изменений' : d > 0 ? `+${d}` : `−${Math.abs(d)}`})`;
}

function whereText(a) {
  const vals = Array.isArray(a?.value) ? a.value : [];
  return vals.map((v) => (v === 'Другое' && String(a.text ?? '').trim() ? `Другое: ${a.text.trim()}` : v)).join(', ') || 'нет ответа';
}

export function themeSummary(ev) {
  return {
    primary: ev.primary.length ? ev.primary.join(' и ') : null,
    second: ev.second,
  };
}

// Сообщение в Telegram (обычный текст, без разметки)
export function reportText({ name, number, finishedAt, ans, ev, prevScores }) {
  const L = [];
  L.push(`🧾 Опросник по весу: ${name}`);
  L.push(`${fmtDateTime(finishedAt)} · прохождение №${number}`);

  if (ev.flags.red.length) {
    L.push('', '🔴 Флаги');
    ev.flags.red.forEach((f) => L.push(f));
  }

  L.push('');
  if (ev.primary.length) L.push(`ГЛАВНАЯ ТЕМА: ${ev.primary.map((l) => themeLine(l, ev.scores)).join(' и ')}`);
  else L.push('ГЛАВНАЯ ТЕМА: не определена');
  if (ev.second) L.push(`Вторая: ${themeLine(ev.second, ev.scores)}`);

  L.push('', 'Баллы:');
  LETTERS.forEach((l) => L.push(`${l} ${BLOCK_SHORT[l]}: ${ev.scores[l]}${delta(ev.scores[l], prevScores ? prevScores[l] : null)}`));

  L.push('', 'Пометки:');
  if (ev.notes.length) ev.notes.forEach((n) => L.push(n));
  else L.push('нет');

  L.push('', 'Ответы «точно про меня»:');
  const threes = STATEMENTS.filter((s) => Number(ans[s.key]?.value) === 3);
  if (threes.length) threes.forEach((s) => L.push(`${s.n}. ${s.text}`));
  else L.push('нет');

  L.push('', 'Её словами:');
  const act = activeFollowups(ans);
  const fs = FOLLOWUPS.filter((f) => act.includes(f.n));
  if (fs.length) fs.forEach((f) => L.push(`к вопросу ${f.n} (${f.topic}): ${said(ans[f.key])}`));
  else L.push('уточнений не было');

  L.push('');
  L.push(`Начало: ${ans.s3_1?.value ?? 'нет ответа'}. За год до этого: ${said(ans.s3_1_text)}`);
  L.push(`Где копится: ${whereText(ans.s3_2)}`);
  L.push(`Перед откатом: ${said(ans.s3_3)}`);

  L.push('', 'Скрининг:');
  if (ev.flags.warn.length) ev.flags.warn.forEach((f) => L.push(f));
  else L.push('без замечаний');
  return L.join('\n');
}

// Разбить на части не длиннее лимита Telegram по границам строк
export function splitMessage(text, limit = 4000) {
  if (text.length <= limit) return [text];
  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (cur.length + line.length + 1 > limit && cur) { parts.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur) parts.push(cur);
  return parts;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();

export function safeName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|\n\r]+/g, '').replace(/\s+/g, '_') || 'client';
}

// Файл для нейросети: самодостаточный, с ключом в конце
export function reportMarkdown({ name, number, finishedAt, ans, ev, prevScores }) {
  const L = [];
  L.push(`# Опросник по весу: ${name}`);
  L.push('');
  L.push(`Прохождение №${number}, завершено ${fmtDateTime(finishedAt)} (время Asia/Saigon).`);
  L.push('');
  L.push('Это результаты опросника, который клиентка гипнотерапевта прошла перед работой с весом. 25 утверждений оцениваются по шкале 0–3: 0 «Не про меня», 1 «Иногда», 2 «Часто», 3 «Точно про меня». Утверждения разбиты на 5 блоков (тем) по 5 штук, балл блока это сумма ответов, от 0 до 15. Уровень блока: 10–15 «фонит явно», 6–9 «участвует», 0–5 «фон». Ключ блоков в конце файла. Это не диагноз, а ориентир для терапевта.');
  L.push('');

  L.push('## Итог');
  if (ev.primary.length) L.push(`- Главная тема: ${ev.primary.map((l) => themeLine(l, ev.scores)).join(' и ')}`);
  else L.push('- Главная тема: не определена');
  L.push(`- Вторая тема: ${ev.second ? themeLine(ev.second, ev.scores) : 'нет'}`);
  L.push('');
  L.push('### Баллы блоков');
  LETTERS.forEach((l) => L.push(`- ${l} ${BLOCK_NAMES[l]}: ${ev.scores[l]}/15, ${levelOf(ev.scores[l])}${delta(ev.scores[l], prevScores ? prevScores[l] : null)}`));
  if (prevScores) L.push('', '«было» это баллы предыдущего прохождения.');
  L.push('');
  L.push('### Пометки');
  if (ev.notes.length) ev.notes.forEach((n) => L.push(`- ${n}`));
  else L.push('- нет');
  L.push('');
  L.push('### Флаги');
  const allFlags = [...ev.flags.red, ...ev.flags.warn];
  if (allFlags.length) allFlags.forEach((f) => L.push(`- ${f}`));
  else L.push('- нет');
  L.push('');

  L.push('## Ответы на 25 утверждений');
  L.push('');
  L.push('| № | Блок | Утверждение | Ответ | Балл |');
  L.push('|---|---|---|---|---|');
  STATEMENTS.forEach((s) => {
    const v = ans[s.key]?.value;
    L.push(`| ${s.n} | ${s.block} | ${cell(s.text)} | ${v == null ? 'нет ответа' : ANSWER_OPTIONS[v]} | ${v ?? '-'} |`);
  });
  L.push('');

  L.push('## Уточнения её словами');
  L.push('Уточнение задаётся, только если на исходное утверждение ответ 2 или 3.');
  L.push('');
  const act = activeFollowups(ans);
  FOLLOWUPS.forEach((f) => {
    const st = STATEMENTS[f.n - 1];
    if (act.includes(f.n)) L.push(`- К утверждению ${f.n} («${st.text}»). Вопрос: «${f.prompt}» Ответ: ${said(ans[f.key])}`);
    else L.push(`- К утверждению ${f.n}: не задавалось (ответ на утверждение 0 или 1)`);
  });
  L.push('');

  L.push('## История веса');
  L.push(`- ${TEXTS.s3_1} ${ans.s3_1?.value ?? 'нет ответа'}`);
  L.push(`- ${TEXTS.s3_1_text} ${said(ans.s3_1_text)}`);
  L.push(`- ${TEXTS.s3_2} ${whereText(ans.s3_2)} (варианты: ${S3_2_OPTIONS.join(', ')})`);
  L.push(`- ${TEXTS.s3_3} ${said(ans.s3_3)}`);
  L.push('');

  L.push('## Скрининг');
  const s41 = ans.s4_1;
  L.push(`- ${TEXTS.s4_1} ${s41?.value ?? 'нет ответа'}${s41?.value === 'Да' ? `. Какие: ${String(s41.text ?? '').trim()}` : ''}`);
  const s42 = ans.s4_2;
  L.push(`- ${TEXTS.s4_2} ${s42?.value ?? 'нет ответа'}${s42?.value === 'Сдавала, были отклонения' ? `. Какие: ${said(s42)}` : ''}`);
  L.push(`- ${TEXTS.s4_3} ${(ans.s4_3?.value || []).join(', ') || 'нет ответа'}`);
  L.push(`- ${TEXTS.s4_4} ${(ans.s4_4?.value || []).join(', ') || 'нет ответа'}`);
  L.push('');

  L.push('## Ключ');
  LETTERS.forEach((l) => {
    const nums = STATEMENTS.filter((s) => s.block === l).map((s) => s.n).join(', ');
    L.push(`- Блок ${l} «${BLOCK_NAMES[l]}»: утверждения ${nums}`);
  });
  L.push('');
  L.push('Правила выбора главной темы: выбирается только из блоков А, Б, В, Г (блок Д «рельсы / откаты» главной темой быть не может). Если максимум среди А–Г меньше 6, главной темы нет. Кандидаты: блоки с баллом не ниже максимума минус 2 и не ниже 6. Если А среди кандидатов, главная тема А. Иначе берётся лидер по баллу, при равенстве тот, у кого больше ответов 3, при полном равенстве две главные темы. Вторая тема: наибольший балл среди оставшихся А–Г, если он не ниже 6.');
  L.push('');

  return { filename: `ves_${safeName(name)}_${fileDate(finishedAt)}.md`, text: L.join('\n') };
}
