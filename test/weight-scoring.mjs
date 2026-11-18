// Обязательные случаи подсчёта из раздела 11 ТЗ
import { decide, levelOf, blockScores, screeningFlags } from '../weight/src/scoring.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const S = (А, Б, В, Г, Д) => ({ А, Б, В, Г, Д });
const has = (notes, s) => notes.some((n) => n.startsWith(s));
const SYN = 'Синдром';

let r = decide(S(12, 5, 4, 3, 7));
ok(r.primary.join() === 'А' && r.second === null && has(r.notes, 'Есть откаты') && !has(r.notes, SYN), '1: главная А, второй нет, «Есть откаты», без синдрома');
r = decide(S(8, 10, 2, 2, 3));
ok(r.primary.join() === 'А' && r.second === 'Б' && has(r.notes, SYN), '2: главная А (в пределах 2 от лидера), вторая Б, синдром');
r = decide(S(7, 10, 3, 3, 2));
ok(r.primary.join() === 'Б' && r.second === 'А' && has(r.notes, 'Убрать ежедневное взвешивание'), '3: главная Б, вторая А, пометка про взвешивание');
r = decide(S(4, 11, 11, 5, 2), { Б: 3, В: 1 });
ok(r.primary.join() === 'Б', '4a: Б и В равны, у Б больше «3»: главная Б');
r = decide(S(4, 11, 11, 5, 2), { Б: 1, В: 2 });
ok(r.primary.join() === 'В' && has(r.notes, 'Жёсткие диеты'), '4b: у В больше «3»: главная В');
r = decide(S(4, 11, 11, 5, 2), { Б: 2, В: 2 });
ok(r.primary.join() === 'Б,В' && r.second === null, '4c: «3» поровну: две главные темы Б и В');
r = decide(S(5, 5, 4, 3, 12));
ok(r.primary.length === 0 && has(r.notes, 'Тест тему не поймал') && has(r.notes, 'Откаты сильные'), '5: темы нет, «Тест тему не поймал», «Откаты сильные»');
r = decide(S(9, 3, 2, 2, 9));
ok(r.primary.join() === 'А' && has(r.notes, SYN) && has(r.notes, 'Есть откаты'), '6: главная А, синдром (А и Д >= 8), «Есть откаты»');
r = decide(S(5, 6, 4, 8, 0));
ok(r.primary.join() === 'Г' && r.second === 'Б', '7: главная Г, вторая Б');

// уровни и счёт из ответов
ok(levelOf(15) === 'фонит явно' && levelOf(10) === 'фонит явно' && levelOf(9) === 'участвует' && levelOf(6) === 'участвует' && levelOf(5) === 'фон', 'уровни 10/6');
const ans = {}; for (let n = 1; n <= 25; n++) ans['q' + n] = { value: n % 4 };
const bs = blockScores(ans);
ok(bs.scores['А'] === (1 + 2 + 3 + 0 + 1) && bs.threes['А'] === 1, 'баллы блока А считаются по вопросам 1, 6, 11, 16, 21');
ok(decide(S(10, 2, 2, 2, 2), {}, 2).notes.some((n) => n.startsWith('Есть явное событие-шок')), 'в16 >= 2: событие-шок');
const f = screeningFlags({ s4_1: { value: 'Да', text: 'Эутирокс' }, s4_2: { value: 'Сдавала, были отклонения', skipped: true }, s4_3: { value: ['Вызываю рвоту после еды', 'Ем много и не могу остановиться'] }, s4_4: { value: ['Беременность'] } });
ok(f.red.length === 2 && f.warn.includes('⚠️ Принимает препараты: Эутирокс') && f.warn.includes('⚠️ Отклонения в анализах: не уточнила') && f.warn.includes('⚠️ Беременность'), 'флаги скрининга');
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'ПОДСЧЁТ: ВСЁ ОК');
process.exit(fails ? 1 : 0);
