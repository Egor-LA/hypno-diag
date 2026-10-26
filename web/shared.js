// Все расчёты в одном месте. Импортируется и страницами, и Worker.
import { BLOCKS, QUESTIONS, SIZES, BLOCK_START, TOTAL_QUESTIONS, CRITICAL_INDEX, CONCERN_QUESTIONS } from './questions.js';

export { BLOCKS, QUESTIONS, SIZES, BLOCK_START, TOTAL_QUESTIONS, CRITICAL_INDEX, CONCERN_QUESTIONS };

export const SHORT_COUNT = 10;
export const EPS = 1e-9;

export const SCHEDULES = {
  full_1w: 'Полный раз в неделю',
  full_4w: 'Полный раз в 4 недели',
  mix_1w: 'Короткий раз в неделю + полный раз в 4 недели',
  off: 'Выключено',
};

export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function fmtDate(ts, tz = 'Europe/Moscow') {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
}

export function fmtDateTime(ts, tz = 'Europe/Moscow') {
  const d = fmtDate(ts, tz);
  const t = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  return `${d} ${t}`;
}

export function bar(v) {
  const n = Math.max(0, Math.min(10, Math.round(v)));
  return '▰'.repeat(n) + '▱'.repeat(10 - n);
}

export function fmtNum(v) {
  return v == null ? '-' : String(round1(v)).replace('.', ',');
}

// ---------- базовые расчёты ----------

export function blockOf(idx) {
  return QUESTIONS[idx].block;
}

// answers: массив длины 55, пропуски = null
export function domainMeans(answers) {
  return BLOCKS.map((b, bi) => {
    const vals = [];
    for (let k = 0; k < SIZES[bi]; k++) {
      const v = answers[BLOCK_START[bi] + k];
      if (v != null) vals.push(v);
    }
    const raw = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : null;
    return { id: b.id, title: b.title, raw, mean: raw == null ? null : round1(raw), count: vals.length };
  });
}

export function totalScore(means) {
  const raw = means.reduce((a, m) => a + (m.raw ?? 0), 0);
  return { raw, value: round1(raw) };
}

export function totalLabel(total) {
  if (total < 20) return 'минимальная выраженность';
  if (total < 40) return 'лёгкая';
  if (total < 60) return 'умеренная';
  if (total < 80) return 'выраженная';
  return 'тяжёлая';
}

export function priorityOf(mean) {
  if (mean >= 7) return 'Приоритет 1';
  if (mean >= 4) return 'Приоритет 2';
  return 'Ресурсная зона';
}

// Выбросы: пункт выше среднего своей сферы на 3 и более
export function outliers(answers) {
  const means = domainMeans(answers);
  const res = [];
  answers.forEach((v, idx) => {
    if (v == null) return;
    const m = means[blockOf(idx)];
    const diff = v - m.raw;
    if (diff >= 3 - EPS) res.push({ idx, value: v, block: blockOf(idx), domainMean: m.mean, diff: round1(diff) });
  });
  return res.sort((a, b) => b.value - a.value || b.diff - a.diff || a.idx - b.idx);
}

// Точки входа: выбросы отдельно и первыми, затем остальные >=5
export function entryPoints(answers) {
  const out = outliers(answers);
  const outSet = new Set(out.map((o) => o.idx));
  const rest = [];
  answers.forEach((v, idx) => {
    if (v != null && v >= 5 && !outSet.has(idx)) rest.push({ idx, value: v, block: blockOf(idx) });
  });
  rest.sort((a, b) => b.value - a.value || a.idx - b.idx);
  return { outliers: out, rest };
}

// Противоречия: два пункта одной сферы расходятся на 5 и более
export function contradictions(answers) {
  const res = [];
  BLOCKS.forEach((b, bi) => {
    for (let i = 0; i < SIZES[bi]; i++) {
      for (let j = i + 1; j < SIZES[bi]; j++) {
        const a = answers[BLOCK_START[bi] + i];
        const c = answers[BLOCK_START[bi] + j];
        if (a == null || c == null) continue;
        if (Math.abs(a - c) >= 5) {
          const lowFirst = a <= c;
          const lo = lowFirst ? BLOCK_START[bi] + i : BLOCK_START[bi] + j;
          const hi = lowFirst ? BLOCK_START[bi] + j : BLOCK_START[bi] + i;
          res.push({ block: bi, low: { idx: lo, value: answers[lo] }, high: { idx: hi, value: answers[hi] }, diff: Math.abs(a - c) });
        }
      }
    }
  });
  return res.sort((x, y) => y.high.value - x.high.value || y.diff - x.diff || x.block - y.block || x.low.idx - y.low.idx);
}

export function criticalInfo(answers) {
  const v = answers[CRITICAL_INDEX];
  if (v == null) return { value: null, level: 'none' };
  return { value: v, level: v >= 3 ? 'red' : v >= 1 ? 'yellow' : 'none' };
}

// Для клиента: порог мягкого сообщения
export function clientSafetyTriggered(answers) {
  const v = answers[CRITICAL_INDEX];
  return v != null && v >= 7;
}

export const SAFETY_TEXT =
  'Вы отметили, что бывают мысли, что лучше бы вас не было. Пожалуйста, напишите своему терапевту прямо сейчас, а если состояние острое, обратитесь в местную экстренную службу.';

export function analyze(answers) {
  const means = domainMeans(answers);
  const total = totalScore(means);
  return {
    means,
    total: total.value,
    totalRaw: total.raw,
    totalLabel: totalLabel(total.raw),
    priorities: means.map((m) => ({ id: m.id, title: m.title, mean: m.mean, priority: priorityOf(m.mean) })),
    entry: entryPoints(answers),
    outliers: outliers(answers),
    contradictions: contradictions(answers),
    critical: criticalInfo(answers),
  };
}

// 10 пунктов с самыми высокими баллами первого прохождения; при равенстве приоритет у выбросов
export function shortItems(firstAnswers) {
  const outSet = new Set(outliers(firstAnswers).map((o) => o.idx));
  return firstAnswers
    .map((v, idx) => ({ idx, v: v ?? 0, out: outSet.has(idx) ? 1 : 0 }))
    .sort((a, b) => b.v - a.v || b.out - a.out || a.idx - b.idx)
    .slice(0, SHORT_COUNT)
    .map((x) => x.idx)
    .sort((a, b) => a - b);
}

// ---------- ответы ----------

export function normalizeAnswers(raw) {
  const out = new Array(TOTAL_QUESTIONS).fill(null);
  if (Array.isArray(raw)) raw.forEach((v, i) => { if (i < TOTAL_QUESTIONS && Number.isInteger(v)) out[i] = v; });
  return out;
}

export const isScore = (v) => Number.isInteger(v) && v >= 0 && v <= 10;

// ---------- динамика ----------

// subs: по возрастанию времени. Каждый: { id, kind, answers[55], concern_text, concern_score, week_note, created_at }
export function describe(subs, i) {
  const s = subs[i];
  const before = subs.slice(0, i);
  const fulls = subs.filter((x) => x.kind === 'full');
  const firstFull = fulls[0];
  const prevFull = [...before].reverse().find((x) => x.kind === 'full');
  const isFirst = i === 0;

  const items = [];
  s.answers.forEach((v, idx) => {
    if (v == null) return;
    let prev = null;
    for (let k = before.length - 1; k >= 0; k--) {
      if (before[k].answers[idx] != null) { prev = before[k].answers[idx]; break; }
    }
    const first = firstFull && firstFull !== s ? firstFull.answers[idx] : null;
    items.push({ idx, now: v, prev, delta: prev == null ? null : v - prev, first, deltaFirst: first == null ? null : v - first });
  });

  const out = { sub: s, kind: s.kind, isFirst, items };

  if (s.kind === 'full') {
    const a = analyze(s.answers);
    const pm = prevFull ? domainMeans(prevFull.answers) : null;
    const fm = firstFull && firstFull !== s ? domainMeans(firstFull.answers) : null;
    out.analysis = a;
    out.domains = a.means.map((m, k) => ({
      id: m.id, title: m.title, mean: m.mean, raw: m.raw,
      prev: pm ? pm[k].mean : null,
      delta: pm ? round1(m.raw - pm[k].raw) : null,
      first: fm ? fm[k].mean : null,
      deltaFirst: fm ? round1(m.raw - fm[k].raw) : null,
    }));
    out.total = a.total;
    out.totalPrev = prevFull ? totalScore(domainMeans(prevFull.answers)).value : null;
    out.totalFirst = fm ? totalScore(fm).value : null;
  }

  const prevConcern = [...before].reverse().find((x) => x.concern_score != null);
  const firstConcern = subs.find((x) => x.concern_score != null);
  out.concern = {
    now: s.concern_score,
    prev: prevConcern ? prevConcern.concern_score : null,
    first: firstConcern && firstConcern !== s ? firstConcern.concern_score : null,
  };

  const withDelta = items.filter((x) => x.delta != null && x.delta !== 0);
  out.improvements = withDelta.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta || a.idx - b.idx).slice(0, 3);
  out.worsenings = withDelta.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta || a.idx - b.idx).slice(0, 3);
  return out;
}

export function arrow(delta) {
  if (delta == null) return '';
  const d = round1(delta);
  if (d === 0) return '→';
  return d < 0 ? `↓${fmtNum(Math.abs(d))}` : `↑${fmtNum(d)}`;
}

// ---------- файл для ИИ ----------

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();

export function safeFileName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|\n\r]+/g, '').replace(/\s+/g, '_') || 'client';
}

export function buildMarkdown(client, subsIn) {
  const tz = client.tz || 'Europe/Moscow';
  const subs = [...subsIn].sort((a, b) => a.created_at - b.created_at).map((s) => ({ ...s, answers: normalizeAnswers(s.answers) }));
  const fulls = subs.filter((s) => s.kind === 'full');
  const shorts = subs.filter((s) => s.kind === 'short');
  const last = subs[subs.length - 1];
  const lastFull = fulls[fulls.length - 1];
  const firstFull = fulls[0];
  const L = [];

  L.push('# Инструкция для ассистента');
  L.push('Ты помогаешь гипнотерапевту разобрать результаты опросника клиента перед сессией.');
  L.push('Шкала 0-10, где 0 «как в лучший период», 10 «максимально выражено сейчас».');
  L.push('Сделай: 1) главные точки входа для проработки и почему именно они;');
  L.push('2) связи между пунктами (какой процесс может стоять за несколькими симптомами сразу);');
  L.push('3) вопросы, которые стоит задать на первой сессии, чтобы уточнить точки входа;');
  L.push('4) если есть ретесты: что сдвинулось, что нет, на что обратить внимание.');
  L.push('Отвечай по-русски, конкретно, без общих слов. Не ставь диагнозов.');
  L.push('');
  L.push('Опросник состоит из 55 пунктов в 10 сферах (числа ниже: баллы 0-10). Сфера считается по среднему своих пунктов. «Выброс» это пункт, который выше среднего своей сферы на 3 и более. «Противоречие» это два пункта одной сферы, которые расходятся на 5 и более. «Сумма» это сумма средних по 10 сферам, из 100; она нужна только терапевту и не является диагнозом.');
  L.push('');

  L.push('# Клиент');
  L.push(`- Имя: ${client.name}`);
  if (client.contact) L.push(`- Контакт: ${client.contact}`);
  L.push(`- Прохождений: ${subs.length} (полных ${fulls.length}, коротких ${shorts.length})`);
  if (subs.length) {
    L.push(`- Первое прохождение: ${fmtDate(subs[0].created_at, tz)}`);
    L.push(`- Последнее прохождение: ${fmtDate(last.created_at, tz)}`);
  }
  L.push(`- Режим ретестов: ${SCHEDULES[client.schedule] || SCHEDULES.off}`);
  L.push('');

  L.push('# Главное для клиента (дословно)');
  if (lastFull) {
    const q = CONCERN_QUESTIONS;
    L.push(`Из полного прохождения от ${fmtDate(lastFull.created_at, tz)}.`);
    L.push(`- Беспокоит больше всего (${lastFull.concern_score ?? '-'}/10): «${cell(lastFull.concern_text)}»`);
    L.push(`- Как поймёт, что это ушло: «${cell(lastFull.success_text)}»`);
    if (lastFull.other_text) L.push(`- Что ещё беспокоит: «${cell(lastFull.other_text)}»`);
    const series = subs.filter((s) => s.concern_score != null);
    if (series.length > 1) {
      L.push('');
      L.push('Баллы главного беспокойства по датам: ' + series.map((s) => `${fmtDate(s.created_at, tz)}: ${s.concern_score}`).join('; '));
    }
    if (fulls.length > 1 && firstFull.concern_text !== lastFull.concern_text) {
      L.push(`Формулировка в первом прохождении: «${cell(firstFull.concern_text)}»`);
    }
    void q;
  } else {
    L.push('Полных прохождений пока нет.');
  }
  L.push('');

  L.push('# Расчёты');
  if (lastFull) {
    const a = analyze(lastFull.answers);
    L.push(`По последнему полному прохождению (${fmtDate(lastFull.created_at, tz)}).`);
    L.push(`- Сумма: ${fmtNum(a.total)}/100 (${a.totalLabel})`);
    L.push('- Средние по сферам (0-10):');
    [...a.priorities].sort((x, y) => y.mean - x.mean).forEach((p) => L.push(`  - ${p.title}: ${fmtNum(p.mean)} (${p.priority})`));
    L.push('- Выбросы (сильнее всего отличается от обычного себя):');
    if (a.outliers.length) a.outliers.forEach((o) => L.push(`  - №${o.idx + 1} ${QUESTIONS[o.idx].label}: ${o.value} при среднем по сфере «${BLOCKS[o.block].title}» ${fmtNum(o.domainMean)}`));
    else L.push('  - нет');
    L.push('- Другие пункты 5 и выше:');
    if (a.entry.rest.length) a.entry.rest.forEach((r) => L.push(`  - №${r.idx + 1} ${QUESTIONS[r.idx].label}: ${r.value} (${BLOCKS[r.block].title})`));
    else L.push('  - нет');
    L.push('- Противоречия внутри сфер:');
    if (a.contradictions.length) a.contradictions.forEach((c) => L.push(`  - ${BLOCKS[c.block].title}: «${QUESTIONS[c.low.idx].label}» ${c.low.value}, но «${QUESTIONS[c.high.idx].label}» ${c.high.value}`));
    else L.push('  - нет');
    const crit = a.critical;
    const critTxt = crit.level === 'red' ? 'красный флаг, проверить в первую очередь' : crit.level === 'yellow' ? 'жёлтый флаг' : 'без флага';
    L.push(`- Критический пункт (№${CRITICAL_INDEX + 1}, мысли «лучше бы меня не было»): ${crit.value ?? '-'}/10, ${critTxt}`);
    const maxCrit = Math.max(...subs.map((s) => s.answers[CRITICAL_INDEX]).filter((v) => v != null), 0);
    if (fulls.length > 1 || shorts.length) L.push(`  - максимум за всё время: ${maxCrit}/10`);

    if (fulls.length > 1) {
      L.push('- Динамика между полными прохождениями:');
      L.push('  - Сумма: ' + fulls.map((s) => `${fmtDate(s.created_at, tz)}: ${fmtNum(analyze(s.answers).total)}`).join('; '));
      const d = describe(subs, subs.indexOf(lastFull));
      [...d.domains].sort((x, y) => y.mean - x.mean).forEach((m) => L.push(`  - ${m.title}: ${fmtNum(m.first)} → ${fmtNum(m.mean)} (${arrow(m.deltaFirst)} с начала, ${arrow(m.delta)} к предыдущему)`));
    }
  } else {
    L.push('Нет данных.');
  }
  L.push('');

  L.push('# Все ответы');
  if (fulls.length) {
    L.push('Баллы 0-10 по каждому полному прохождению. Пункты упорядочены по убыванию балла в последнем прохождении.');
    L.push('');
    L.push(`| № | Сфера | Вопрос | ${fulls.map((s) => fmtDate(s.created_at, tz)).join(' | ')} |`);
    L.push(`|---|---|---|${fulls.map(() => '---').join('|')}|`);
    [...QUESTIONS].sort((x, y) => (lastFull.answers[y.idx] ?? -1) - (lastFull.answers[x.idx] ?? -1) || x.idx - y.idx).forEach((q) => {
      L.push(`| ${q.idx + 1} | ${BLOCKS[q.block].title} | ${cell(q.text)} | ${fulls.map((s) => s.answers[q.idx] ?? '-').join(' | ')} |`);
    });
  } else {
    L.push('Нет данных.');
  }
  L.push('');

  L.push('# Короткие ретесты');
  if (shorts.length) {
    const lastShort = shorts[shorts.length - 1];
    const idxs = [...new Set(shorts.flatMap((s) => s.answers.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0)))]
      .sort((a, b) => (lastShort.answers[b] ?? -1) - (lastShort.answers[a] ?? -1) || a - b);
    L.push('Баллы 0-10. «Беспокойство» это оценка главного беспокойства клиента.');
    L.push('');
    L.push(`| Дата | Беспокойство | ${idxs.map((i) => `№${i + 1} ${cell(QUESTIONS[i].label)}`).join(' | ')} |`);
    L.push(`|---|---|${idxs.map(() => '---').join('|')}|`);
    shorts.forEach((s) => L.push(`| ${fmtDate(s.created_at, tz)} | ${s.concern_score ?? '-'} | ${idxs.map((i) => s.answers[i] ?? '-').join(' | ')} |`));
    const notes = shorts.filter((s) => s.week_note);
    L.push('');
    L.push('Что изменилось за неделю (слова клиента):');
    if (notes.length) notes.forEach((s) => L.push(`- ${fmtDate(s.created_at, tz)}: «${cell(s.week_note)}»`));
    else L.push('- записей нет');
  } else {
    L.push('Коротких ретестов пока не было.');
  }
  L.push('');

  const date = fmtDate((last || { created_at: Date.now() }).created_at, tz).split('.').reverse().join('-');
  return { filename: `${safeFileName(client.name)}_${date}.md`, text: L.join('\n') };
}
