// Подсчёт опросника по весу. Чистые функции без базы и сети.
import { STATEMENTS, LETTERS, S4_3_OPTIONS, S4_4_OPTIONS, NONE } from './questions.js';

const MAIN = ['А', 'Б', 'В', 'Г']; // Д главной темой быть не может

export function levelOf(score) {
  if (score >= 10) return 'фонит явно';
  if (score >= 6) return 'участвует';
  return 'фон';
}

// Баллы блоков (0–15) и число ответов «3» в каждом блоке
export function blockScores(ans) {
  const scores = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  const threes = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  for (const s of STATEMENTS) {
    const v = Number(ans[s.key]?.value ?? 0);
    scores[s.block] += v;
    if (v === 3) threes[s.block] += 1;
  }
  return { scores, threes };
}

// Главная и вторая тема, пометки (разделы 8.3 и 8.4 ТЗ)
export function decide(scores, threes = {}, q16 = null) {
  const max = Math.max(...MAIN.map((l) => scores[l]));
  let primary = [];
  const notes = [];

  if (max < 6) {
    notes.push('Тест тему не поймал. Идти от события: ответы 3.1 и уточнение к вопросу 16.');
  } else {
    const candidates = MAIN.filter((l) => scores[l] >= max - 2 && scores[l] >= 6);
    if (candidates.includes('А')) {
      primary = ['А'];
    } else {
      const leaders = MAIN.filter((l) => scores[l] === max);
      if (leaders.length === 1) {
        primary = leaders;
      } else {
        const best = Math.max(...leaders.map((l) => threes[l] ?? 0));
        primary = leaders.filter((l) => (threes[l] ?? 0) === best);
      }
    }
  }

  // Вторая тема: наибольший балл среди оставшихся А–Г, если он >= 6
  let second = null;
  const rest = MAIN.filter((l) => !primary.includes(l));
  if (primary.length) {
    const top = rest.filter((l) => scores[l] >= 6).sort((a, b) => scores[b] - scores[a] || (threes[b] ?? 0) - (threes[a] ?? 0) || MAIN.indexOf(a) - MAIN.indexOf(b));
    second = top[0] ?? null;
  }

  if (scores['А'] >= 8 && ['Б', 'В', 'Г', 'Д'].some((l) => scores[l] >= 8)) notes.push('Синдром: вода + ещё одна активная тема. Начинать с блока А.');
  if (q16 != null && q16 >= 2) notes.push('Есть явное событие-шок (вопрос 16).');
  if (scores['Д'] >= 6 && scores['Д'] <= 9) notes.push('Есть откаты. Собрать триггеры (вопрос 15).');
  if (scores['Д'] >= 10) notes.push('Откаты сильные. Сначала снять рельсы, иначе проработка откатится.');
  if (primary.includes('Б')) notes.push('Убрать ежедневное взвешивание и контроль в зеркале.');
  if (primary.includes('В')) notes.push('Жёсткие диеты сейчас не давать.');

  return { primary, second, notes };
}

// Флаги скрининга (раздел 8.5 ТЗ)
export function screeningFlags(ans) {
  const red = [];
  const warn = [];
  const s41 = ans.s4_1;
  if (s41?.value === 'Да') warn.push(`⚠️ Принимает препараты: ${(s41.text || '').trim()}`);
  const s42 = ans.s4_2;
  if (s42?.value === 'Не сдавала') warn.push('⚠️ Анализы не сдавала: щитовидка, сахар, инсулин');
  if (s42?.value === 'Сдавала, были отклонения') warn.push(`⚠️ Отклонения в анализах: ${s42.skipped || !(s42.text || '').trim() ? 'не уточнила' : s42.text.trim()}`);
  const s43 = Array.isArray(ans.s4_3?.value) ? ans.s4_3.value : [];
  if (s43.includes(S4_3_OPTIONS[0])) red.push('🔴 Переедания с потерей контроля');
  if (s43.includes(S4_3_OPTIONS[1]) || s43.includes(S4_3_OPTIONS[2])) red.push('🔴 Рвота / слабительные. Возможное РПП, нужен врач');
  const s44 = (Array.isArray(ans.s4_4?.value) ? ans.s4_4.value : []).filter((v) => v !== NONE && S4_4_OPTIONS.includes(v));
  if (s44.length) warn.push(`⚠️ ${s44.join(', ')}`);
  return { red, warn };
}

export function evaluate(ans) {
  const { scores, threes } = blockScores(ans);
  const d = decide(scores, threes, Number(ans.q16?.value ?? 0));
  return { scores, threes, ...d, flags: screeningFlags(ans) };
}
