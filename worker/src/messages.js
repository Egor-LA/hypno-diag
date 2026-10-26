// Тексты сообщений бота. Формулы берутся только из web/shared.js.
import {
  BLOCKS, QUESTIONS, CRITICAL_INDEX, SCHEDULES, bar, fmtNum, fmtDate, arrow, round1, clientSafetyTriggered, SAFETY_TEXT,
} from '../../web/shared.js';
import { esc } from './util.js';

const q = (s) => `«${esc(s)}»`;
const cut = (s, n = 700) => (String(s).length > n ? String(s).slice(0, n) + '...' : String(s));

export function kindTitle(d) {
  if (d.isFirst) return 'первичный';
  return d.kind === 'full' ? 'полный ретест' : 'короткий ретест';
}

// ---------- клиенту ----------

export function clientResultsText(d) {
  const L = [];
  const s = d.sub;
  if (d.kind === 'full') {
    L.push('Ваши результаты');
    if (!d.isFirst) L.push('Чем меньше число, тем легче.');
    L.push('');
    [...d.domains].sort((a, b) => b.mean - a.mean).forEach((m) => {
      const a = !d.isFirst && m.delta != null ? ' ' + arrow(m.delta) : '';
      L.push(`${bar(m.mean)} ${fmtNum(m.mean)}${a}  ${m.title}`);
    });
    if (!d.isFirst && d.concern.prev != null) {
      L.push('');
      L.push(`Главное беспокойство: было ${d.concern.prev}, сейчас ${d.concern.now}`);
    }
    if (d.isFirst) {
      L.push('');
      L.push('Обсудим это на встрече.');
    }
  } else {
    L.push('Ваши результаты');
    L.push('Чем меньше число, тем легче.');
    L.push('');
    [...d.items].sort((a, b) => b.now - a.now || a.idx - b.idx).forEach((it) => {
      const lab = QUESTIONS[it.idx].label;
      const chg = it.prev != null ? `${it.prev} → ${it.now} ${arrow(it.delta)}` : `${it.now}`;
      L.push(`${lab}: ${chg}`);
    });
    if (d.concern.prev != null) {
      L.push('');
      L.push(`Главное беспокойство: было ${d.concern.prev}, сейчас ${d.concern.now}`);
    }
  }
  if (clientSafetyTriggered(s.answers)) {
    L.push('');
    L.push(SAFETY_TEXT);
  }
  return L.join('\n');
}

// ---------- Егору ----------

function flagLine(answers) {
  const v = answers[CRITICAL_INDEX];
  if (v == null || v < 1) return null;
  return v >= 3
    ? `🟥 ПРОВЕРИТЬ: мысли «лучше бы меня не было» ${v}/10`
    : `🟨 Отмечены мысли «лучше бы меня не было» ${v}/10`;
}

function itemLine(it) {
  return `• ${esc(QUESTIONS[it.idx].label)}: ${it.prev} → ${it.now} (${arrow(it.delta)})`;
}

export function adminText(client, d, tz) {
  const s = d.sub;
  const L = [];
  const flag = flagLine(s.answers);
  if (flag) L.push(flag);
  L.push(`${esc(client.name)} · ${kindTitle(d)} · ${fmtDate(s.created_at, tz)}`);

  if (d.kind === 'full') {
    const a = d.analysis;
    let sumLine = `Сумма ${fmtNum(a.total)}/100 (${a.totalLabel})`;
    if (!d.isFirst && d.totalPrev != null) {
      sumLine = `Сумма ${fmtNum(a.total)}/100 (${a.totalLabel}). Было ${fmtNum(d.totalPrev)}, ${arrow(round1(a.total - d.totalPrev))}`;
      if (d.totalFirst != null && d.totalFirst !== d.totalPrev) sumLine += `; с начала ${arrow(round1(a.total - d.totalFirst))}`;
    }
    L.push(sumLine);
  }

  if (s.concern_text) {
    L.push(`Беспокоит больше всего (${s.concern_score}/10): ${q(cut(s.concern_text))}`);
  } else if (s.concern_score != null) {
    let t = `Главное беспокойство: ${s.concern_score}/10`;
    if (d.concern.prev != null) t += `, было ${d.concern.prev} (${arrow(s.concern_score - d.concern.prev)})`;
    if (d.concern.first != null && d.concern.first !== d.concern.prev) t += `; с начала ${arrow(s.concern_score - d.concern.first)}`;
    L.push(t);
  }
  if (s.concern_text && !d.isFirst && d.concern.prev != null) {
    L.push(`Было ${d.concern.prev}, ${arrow(s.concern_score - d.concern.prev)}${d.concern.first != null && d.concern.first !== d.concern.prev ? `; с начала ${arrow(s.concern_score - d.concern.first)}` : ''}`);
  }
  if (s.success_text) L.push(`Как поймёт, что ушло: ${q(cut(s.success_text))}`);
  if (s.other_text) L.push(`Ещё беспокоит: ${q(cut(s.other_text, 400))}`);
  if (s.week_note) L.push(`Что изменилось за неделю: ${q(cut(s.week_note))}`);

  if (d.isFirst || d.kind === 'full') {
    const a = d.analysis;
    if (d.isFirst) {
      if (a.outliers.length) {
        L.push('');
        L.push('Сильнее всего отличается от обычного себя:');
        a.outliers.slice(0, 7).forEach((o) => L.push(`• ${esc(QUESTIONS[o.idx].label)} ${o.value} (сфера ${fmtNum(o.domainMean)})`));
      }
      if (a.contradictions.length) {
        // пары с одним и тем же "низким" пунктом склеиваем в одну строку
        const groups = [];
        a.contradictions.forEach((c) => {
          let g = groups.find((x) => x.low.idx === c.low.idx);
          if (!g) { g = { block: c.block, low: c.low, highs: [] }; groups.push(g); }
          g.highs.push(c.high);
        });
        L.push('');
        L.push('Противоречия:');
        groups.slice(0, 8).forEach((g) =>
          L.push(`• ${esc(BLOCKS[g.block].title)}: ${esc(QUESTIONS[g.low.idx].label)} ${g.low.value}, но ${g.highs.map((h) => `${esc(QUESTIONS[h.idx].label)} ${h.value}`).join(' и ')}`));
        if (groups.length > 8) L.push(`и ещё ${groups.length - 8} в карте`);
      }
    }
  }

  if (!d.isFirst) {
    if (d.improvements.length) {
      L.push('');
      L.push('Лучше всего улучшилось:');
      d.improvements.forEach((it) => L.push(itemLine(it)));
    }
    if (d.worsenings.length) {
      L.push('');
      L.push('Ухудшилось:');
      d.worsenings.forEach((it) => L.push(itemLine(it)));
    }
    if (!d.improvements.length && !d.worsenings.length) {
      L.push('');
      L.push('Заметных изменений по пунктам нет.');
    }
  }
  return L.join('\n');
}

export function cardText(client, lastSub, lastFullTotal, tz) {
  const L = [`<b>${esc(client.name)}</b>`];
  L.push(`Последнее прохождение: ${lastSub ? fmtDate(lastSub.created_at, tz) : 'ещё не было'}`);
  L.push(`Ретест: ${SCHEDULES[client.schedule] || SCHEDULES.off}`);
  L.push(`Последняя сумма: ${lastFullTotal == null ? '-' : fmtNum(lastFullTotal) + '/100'}`);
  L.push(client.chat_id ? 'Telegram подключён' : 'Telegram не подключён');
  return L.join('\n');
}

export const SCHEDULE_ORDER = ['full_1w', 'full_4w', 'mix_1w', 'off'];
