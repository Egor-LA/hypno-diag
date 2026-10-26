// supabase/entry.js
import postgres from "npm:postgres@3.4.5";

// web/questions.js
var BLOCKS = [
  {
    id: "energy",
    title: "Энергия и активация",
    qs: [
      { label: "Трудно вставать утром", text: "Насколько трудно вам встать с кровати утром и начать день?", note: "0: легко, как раньше; 10: вставать невозможно без больших усилий" },
      { label: "Бросаю начатое", text: "Как часто вы начинаете что-то делать и бросаете на полпути из-за упадка сил?", note: "0: редко или никогда; 10: почти каждый раз" },
      { label: "Мало инициативы", text: "Насколько снизилась ваша общая инициативность, желание самому что-то предпринять, начать?", note: "0: как прежде; 10: полное отсутствие инициативы" },
      { label: "Нет сил на простое", text: "Как часто вы ощущаете, что буквально не хватает сил на элементарные действия: душ, еду, ответить на сообщение?", note: "0: такого нет; 10: постоянно" },
      { label: "Меньше физической активности", text: "Насколько вам трудно поддерживать физическую активность, которую вы раньше выполняли без усилий?", note: "0: без изменений; 10: полностью перестал(а)" },
      { label: "Апатия", text: "В какой мере вы ощущаете апатию, состояние, когда ничего не хочется и ничто не побуждает действовать?", note: "0: апатии нет; 10: апатия постоянна и тотальна" }
    ]
  },
  {
    id: "sleep",
    title: "Сон и восстановление",
    qs: [
      { label: "Трудно засыпать", text: "Насколько сложно вам засыпать в обычное время?", note: "0: засыпаю легко; 10: засыпание занимает часы или не приходит вовсе" },
      { label: "Ночные пробуждения", text: "Как часто вы просыпаетесь ночью и не можете снова уснуть?", note: "0: такого нет; 10: каждую ночь, по нескольку раз" },
      { label: "Нет ощущения отдыха", text: "Насколько вы чувствуете себя отдохнувшим(ей) после сна?", note: "0: просыпаюсь восстановленным(ой); 10: после сна ощущение такое же или хуже, чем до него" },
      { label: "Изменилась длительность сна", text: "Как изменилось время вашего сна: стало существенно больше или меньше обычного?", note: "0: без изменений; 10: радикально больше или меньше нормы" },
      { label: "Дневная сонливость", text: "Как часто вы хотите спать днём, даже если ночью спали достаточно?", note: "0: такого нет; 10: постоянная дневная сонливость" },
      { label: "Тревожные сны", text: "Насколько ваши сновидения или состояние при пробуждении тревожны, тяжелы или окрашены негативно?", note: "0: нейтральные или приятные; 10: постоянно тяжёлые, кошмарные" }
    ]
  },
  {
    id: "body",
    title: "Аппетит и физиология",
    qs: [
      { label: "Изменился аппетит", text: "Насколько изменился ваш аппетит по сравнению с обычным (в любую сторону)?", note: "0: без изменений; 10: полное отсутствие или неконтролируемое переедание" },
      { label: "Еда на автомате", text: "Как часто вы едите не потому что голодны, а автоматически, от скуки или тревоги, или наоборот забываете поесть?", note: "0: такого нет; 10: постоянно" },
      { label: "Снижено влечение", text: "Насколько снизилось ваше сексуальное желание или интерес к близости?", note: "0: без изменений; 10: полностью исчезло" },
      { label: "Давление и усталость в теле", text: "Как выражены физические симптомы: тяжесть в теле, давление в груди, ком в горле, ощущение «свинцовой» усталости?", note: "0: таких симптомов нет; 10: постоянны и сильно выражены" },
      { label: "Необъяснимые боли", text: "Как часто у вас возникают необъяснимые головные боли, боли в животе или другие физические недомогания?", note: "0: редко или никогда; 10: практически ежедневно" }
    ]
  },
  {
    id: "mood",
    title: "Эмоциональный фон",
    qs: [
      { label: "Фоновая тоска", text: "Насколько часто вы ощущаете фоновую грусть или тоску без явной причины?", note: "0: такого нет; 10: постоянный фон без перерывов" },
      { label: "Внутренняя пустота", text: "Насколько выражена у вас внутренняя пустота, ощущение, что внутри «ничего нет»?", note: "0: пустоты нет; 10: полная пустота, как будто чувства отключены" },
      { label: "Нет радости", text: "Насколько сложно вам испытать радость или удовольствие от вещей, которые раньше приносили их?", note: "0: радуюсь как прежде; 10: ничто не приносит никакого удовольствия" },
      { label: "Тревога", text: "Как часто вы ощущаете тревогу, беспокойство или внутреннее напряжение без конкретного повода?", note: "0: такого нет; 10: фоновая тревога постоянна" },
      { label: "Эмоции приглушены", text: "Насколько ваш эмоциональный фон «замороженный»: вы не плачете, не смеётесь, чувства как будто приглушены?", note: "0: эмоции живые и разнообразные; 10: полная эмоциональная заморозка" },
      { label: "Перепады настроения", text: "Как часто у вас бывают резкие перепады настроения, от относительного спокойствия к сильной подавленности?", note: "0: редко; 10: несколько раз в день" }
    ]
  },
  {
    id: "thinking",
    title: "Мышление и внимание",
    qs: [
      { label: "Трудно сосредоточиться", text: "Насколько трудно вам сосредоточиться на одной задаче, не отвлекаясь?", note: "0: концентрация как прежде; 10: не могу удержать внимание дольше нескольких минут" },
      { label: "Мысли по кругу", text: "Как часто ваши мысли возвращаются к одним и тем же темам (вине, неудачам, будущему) по кругу?", note: "0: такого нет; 10: постоянно, остановить невозможно" },
      { label: "Ухудшилась память", text: "Насколько заметно ухудшилась ваша краткосрочная память: вы забываете простые вещи, слова, договорённости?", note: "0: без изменений; 10: существенные провалы каждый день" },
      { label: "Замедленное мышление", text: "Насколько медленнее, по вашим ощущениям, работает мышление: труднее принимать решения, формулировать мысли?", note: "0: как прежде; 10: мысли еле двигаются, всё даётся с большим трудом" },
      { label: "Трудно принимать решения", text: "Как часто вам сложно принять даже простое решение: что поесть, чем заняться?", note: "0: решения даются легко; 10: любое решение вызывает ступор" }
    ]
  },
  {
    id: "social",
    title: "Общение с людьми",
    qs: [
      { label: "Меньше желания общаться", text: "Насколько снизилось ваше желание общаться с близкими людьми?", note: "0: как прежде; 10: никакого желания контактировать ни с кем" },
      { label: "Избегание контактов", text: "Как часто вы избегаете встреч, звонков или переписки, хотя раньше шли на них охотно?", note: "0: редко или никогда; 10: постоянно уклоняюсь от любых контактов" },
      { label: "Трудно в компании", text: "Насколько тяжело вам находиться в компании людей: вы чувствуете себя чужим(ой), раздражённым(ой), опустошённым(ой)?", note: "0: в компании комфортно; 10: общение физически тяжело" },
      { label: "Не слышу собеседника", text: "Как изменилось качество вашего присутствия в разговорах: вы слышите собеседника или «отсутствуете»?", note: "0: полностью присутствую; 10: трудно воспринимать слова другого человека" },
      { label: "Чувство оторванности", text: "Насколько вы чувствуете себя оторванным(ой) или невидимым(ой) в кругу людей, даже близких?", note: "0: такого нет; 10: постоянное ощущение изоляции, даже в компании" }
    ]
  },
  {
    id: "self",
    title: "Самооценка и будущее",
    qs: [
      { label: "Вина и стыд", text: "Насколько часто вы ощущаете необоснованное чувство вины или стыда за прошлые поступки?", note: "0: такого нет; 10: постоянное чувство, что я виноват(а)" },
      { label: "Беспомощность", text: "Как выражено ощущение беспомощности: что вы не способны что-то изменить, что усилия бессмысленны?", note: "0: такого нет; 10: полная убеждённость в своей беспомощности" },
      { label: "Самокритика", text: "Насколько часто вы критикуете себя за ошибки, внешность, характер, значительно сильнее, чем раньше?", note: "0: самокритика в норме; 10: постоянный жёсткий внутренний критик" },
      { label: "Нет образа будущего", text: "Насколько трудно вам представить себе хорошее будущее, что что-то хорошее может произойти?", note: "0: будущее кажется реальным и доступным; 10: будущее кажется серым или несуществующим" },
      { label: "Чувство «я хуже других»", text: "Насколько выражено ощущение, что вы «меньше» других, хуже, не заслуживаете хорошего?", note: "0: такого нет; 10: постоянная убеждённость в собственной неполноценности" },
      { label: "Мысли «лучше бы меня не было»", text: "Как часто вас посещают мысли о том, что лучше бы вас не было, что жизнь не имеет смысла?", note: "0: никогда; 10: очень часто" }
    ]
  },
  {
    id: "movement",
    title: "Тело и движение",
    qs: [
      { label: "Меньше движения", text: "Насколько вы сократили двигательную активность: прогулки, спорт, любое движение?", note: "0: без изменений; 10: практически не двигаюсь" },
      { label: "Забота о себе", text: "Как часто вы пренебрегаете уходом за собой: гигиеной, одеждой, внешним видом?", note: "0: такого нет; 10: уход за собой практически прекратился" },
      { label: "Напряжение в теле", text: "Насколько часто вы ощущаете физическое напряжение, зажатость, скованность в теле?", note: "0: тело расслаблено; 10: постоянное напряжение, невозможно расслабиться" },
      { label: "Тело как чужое", text: "Насколько изменилось ваше ощущение тела: оно «живое» или кажется тяжёлым, чужим, нечувствительным?", note: "0: тело ощущается нормально; 10: тело чужое, тяжёлое, нечувствительное" },
      { label: "Боли без причины", text: "Как часто хронические боли или мышечное напряжение усиливаются без видимой физической причины?", note: "0: такого нет; 10: постоянно усиливаются" }
    ]
  },
  {
    id: "interests",
    title: "Интересы и хобби",
    qs: [
      { label: "Угас интерес", text: "Насколько снизился ваш интерес к занятиям, которые раньше вас увлекали?", note: "0: как прежде; 10: полная потеря интереса ко всему" },
      { label: "Отказ от увлечений", text: "Как часто вы откладываете любимые занятия или вовсе от них отказываетесь?", note: "0: занимаюсь как раньше; 10: перестал(а) полностью" },
      { label: "Меньше творчества", text: "Насколько снизилась ваша творческая активность, желание что-то создавать, придумывать?", note: "0: без изменений; 10: творческий импульс исчез полностью" },
      { label: "Занятия стали механическими", text: "Любимые занятия сейчас приносят удовольствие в процессе или стали механическими, пустыми?", note: "0: приносят удовольствие как прежде; 10: всё стало бессмысленным" },
      { label: "Не знаю, чего хочу", text: "Насколько трудно вам найти занятие, которое хотелось бы делать прямо сейчас?", note: "0: легко; 10: не могу вспомнить, чего хочу" }
    ]
  },
  {
    id: "work",
    title: "Работа и дела",
    qs: [
      { label: "Откладываю дела", text: "Как часто вы откладываете рабочие задачи, которые раньше выполняли без усилий?", note: "0: как прежде; 10: почти все задачи откладываются бесконечно" },
      { label: "Упала продуктивность", text: "Насколько снизилось качество или объём вашей работы по сравнению с обычным уровнем?", note: "0: без изменений; 10: продуктивность упала кардинально" },
      { label: "Трудно начать задачу", text: "Как трудно вам начать рабочую задачу, сделать первый шаг?", note: "0: начинаю легко; 10: начало требует огромных усилий или невозможно" },
      { label: "Ошибки и рассеянность", text: "Насколько часто вы допускаете ошибки или теряете нить в работе из-за рассеянности?", note: "0: редко; 10: постоянно, это стало нормой" },
      { label: "Вина за бездействие", text: "Насколько вас угнетает разрыв между тем, что вы делаете, и тем, что, как вам кажется, должны делать?", note: "0: такого нет; 10: постоянное тяжёлое чувство вины за бездействие" },
      { label: "Мысли о работе не отпускают", text: "Как часто мысли о работе или нерешённых задачах мешают вам отдохнуть или переключиться?", note: "0: легко переключаюсь; 10: мысли о работе не отпускают никогда" }
    ]
  }
];
var CRITICAL_INDEX = 38;
var QUESTIONS = [];
BLOCKS.forEach((b, bi) => b.qs.forEach((q2, pos) => QUESTIONS.push({ idx: QUESTIONS.length, block: bi, pos, ...q2 })));
var SIZES = BLOCKS.map((b) => b.qs.length);
var BLOCK_START = SIZES.map((_, i) => SIZES.slice(0, i).reduce((a, b) => a + b, 0));
var TOTAL_QUESTIONS = QUESTIONS.length;
var EXPECTED_SIZES = [6, 6, 5, 6, 5, 5, 6, 5, 5, 6];
if (TOTAL_QUESTIONS !== 55) throw new Error(`Ожидалось 55 вопросов, найдено ${TOTAL_QUESTIONS}`);
if (SIZES.join() !== EXPECTED_SIZES.join()) throw new Error("Размеры сфер не совпадают с ожидаемыми");
if (!QUESTIONS[CRITICAL_INDEX].text.includes("лучше бы вас не было")) throw new Error("Индекс критического пункта сдвинулся");
var CONCERN_QUESTIONS = {
  concernText: "Что в вашем состоянии беспокоит вас больше всего прямо сейчас? Опишите своими словами.",
  concernScore: "Насколько сильно это беспокоит?",
  successText: "Как вы поймёте, что это ушло? Что вы будете делать или чувствовать иначе?",
  otherText: "Что ещё беспокоит, если есть?"
};

// web/shared.js
var SHORT_COUNT = 10;
var EPS = 1e-9;
var SCHEDULES = {
  full_1w: "Полный раз в неделю",
  full_4w: "Полный раз в 4 недели",
  mix_1w: "Короткий раз в неделю + полный раз в 4 недели",
  off: "Выключено"
};
function round1(x) {
  return Math.round(x * 10) / 10;
}
function fmtDate(ts, tz = "Europe/Moscow") {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts));
}
function fmtDateTime(ts, tz = "Europe/Moscow") {
  const d = fmtDate(ts, tz);
  const t = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  return `${d} ${t}`;
}
function bar(v) {
  const n = Math.max(0, Math.min(10, Math.round(v)));
  return "▰".repeat(n) + "▱".repeat(10 - n);
}
function fmtNum(v) {
  return v == null ? "-" : String(round1(v)).replace(".", ",");
}
function blockOf(idx) {
  return QUESTIONS[idx].block;
}
function domainMeans(answers) {
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
function totalScore(means) {
  const raw = means.reduce((a, m) => a + (m.raw ?? 0), 0);
  return { raw, value: round1(raw) };
}
function totalLabel(total) {
  if (total < 20) return "минимальная выраженность";
  if (total < 40) return "лёгкая";
  if (total < 60) return "умеренная";
  if (total < 80) return "выраженная";
  return "тяжёлая";
}
function priorityOf(mean) {
  if (mean >= 7) return "Приоритет 1";
  if (mean >= 4) return "Приоритет 2";
  return "Ресурсная зона";
}
function outliers(answers) {
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
function entryPoints(answers) {
  const out = outliers(answers);
  const outSet = new Set(out.map((o) => o.idx));
  const rest = [];
  answers.forEach((v, idx) => {
    if (v != null && v >= 5 && !outSet.has(idx)) rest.push({ idx, value: v, block: blockOf(idx) });
  });
  rest.sort((a, b) => b.value - a.value || a.idx - b.idx);
  return { outliers: out, rest };
}
function contradictions(answers) {
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
function criticalInfo(answers) {
  const v = answers[CRITICAL_INDEX];
  if (v == null) return { value: null, level: "none" };
  return { value: v, level: v >= 3 ? "red" : v >= 1 ? "yellow" : "none" };
}
function clientSafetyTriggered(answers) {
  const v = answers[CRITICAL_INDEX];
  return v != null && v >= 7;
}
var SAFETY_TEXT = "Вы отметили, что бывают мысли, что лучше бы вас не было. Пожалуйста, напишите своему терапевту прямо сейчас, а если состояние острое, обратитесь в местную экстренную службу.";
function analyze(answers) {
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
    critical: criticalInfo(answers)
  };
}
function shortItems(firstAnswers) {
  const outSet = new Set(outliers(firstAnswers).map((o) => o.idx));
  return firstAnswers.map((v, idx) => ({ idx, v: v ?? 0, out: outSet.has(idx) ? 1 : 0 })).sort((a, b) => b.v - a.v || b.out - a.out || a.idx - b.idx).slice(0, SHORT_COUNT).map((x) => x.idx).sort((a, b) => a - b);
}
function normalizeAnswers(raw) {
  const out = new Array(TOTAL_QUESTIONS).fill(null);
  if (Array.isArray(raw)) raw.forEach((v, i) => {
    if (i < TOTAL_QUESTIONS && Number.isInteger(v)) out[i] = v;
  });
  return out;
}
var isScore = (v) => Number.isInteger(v) && v >= 0 && v <= 10;
function describe(subs, i) {
  const s = subs[i];
  const before = subs.slice(0, i);
  const fulls = subs.filter((x) => x.kind === "full");
  const firstFull = fulls[0];
  const prevFull = [...before].reverse().find((x) => x.kind === "full");
  const isFirst = i === 0;
  const items = [];
  s.answers.forEach((v, idx) => {
    if (v == null) return;
    let prev = null;
    for (let k = before.length - 1; k >= 0; k--) {
      if (before[k].answers[idx] != null) {
        prev = before[k].answers[idx];
        break;
      }
    }
    const first = firstFull && firstFull !== s ? firstFull.answers[idx] : null;
    items.push({ idx, now: v, prev, delta: prev == null ? null : v - prev, first, deltaFirst: first == null ? null : v - first });
  });
  const out = { sub: s, kind: s.kind, isFirst, items };
  if (s.kind === "full") {
    const a = analyze(s.answers);
    const pm = prevFull ? domainMeans(prevFull.answers) : null;
    const fm = firstFull && firstFull !== s ? domainMeans(firstFull.answers) : null;
    out.analysis = a;
    out.domains = a.means.map((m, k) => ({
      id: m.id,
      title: m.title,
      mean: m.mean,
      raw: m.raw,
      prev: pm ? pm[k].mean : null,
      delta: pm ? round1(m.raw - pm[k].raw) : null,
      first: fm ? fm[k].mean : null,
      deltaFirst: fm ? round1(m.raw - fm[k].raw) : null
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
    first: firstConcern && firstConcern !== s ? firstConcern.concern_score : null
  };
  const withDelta = items.filter((x) => x.delta != null && x.delta !== 0);
  out.improvements = withDelta.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta || a.idx - b.idx).slice(0, 3);
  out.worsenings = withDelta.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta || a.idx - b.idx).slice(0, 3);
  return out;
}
function arrow(delta) {
  if (delta == null) return "";
  const d = round1(delta);
  if (d === 0) return "→";
  return d < 0 ? `↓${fmtNum(Math.abs(d))}` : `↑${fmtNum(d)}`;
}
var cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
function safeFileName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|\n\r]+/g, "").replace(/\s+/g, "_") || "client";
}
function buildMarkdown(client, subsIn) {
  const tz = client.tz || "Europe/Moscow";
  const subs = [...subsIn].sort((a, b) => a.created_at - b.created_at).map((s) => ({ ...s, answers: normalizeAnswers(s.answers) }));
  const fulls = subs.filter((s) => s.kind === "full");
  const shorts = subs.filter((s) => s.kind === "short");
  const last = subs[subs.length - 1];
  const lastFull = fulls[fulls.length - 1];
  const firstFull = fulls[0];
  const L = [];
  L.push("# Инструкция для ассистента");
  L.push("Ты помогаешь гипнотерапевту разобрать результаты опросника клиента перед сессией.");
  L.push("Шкала 0-10, где 0 «как в лучший период», 10 «максимально выражено сейчас».");
  L.push("Сделай: 1) главные точки входа для проработки и почему именно они;");
  L.push("2) связи между пунктами (какой процесс может стоять за несколькими симптомами сразу);");
  L.push("3) вопросы, которые стоит задать на первой сессии, чтобы уточнить точки входа;");
  L.push("4) если есть ретесты: что сдвинулось, что нет, на что обратить внимание.");
  L.push("Отвечай по-русски, конкретно, без общих слов. Не ставь диагнозов.");
  L.push("");
  L.push("Опросник состоит из 55 пунктов в 10 сферах (числа ниже: баллы 0-10). Сфера считается по среднему своих пунктов. «Выброс» это пункт, который выше среднего своей сферы на 3 и более. «Противоречие» это два пункта одной сферы, которые расходятся на 5 и более. «Сумма» это сумма средних по 10 сферам, из 100; она нужна только терапевту и не является диагнозом.");
  L.push("");
  L.push("# Клиент");
  L.push(`- Имя: ${client.name}`);
  if (client.contact) L.push(`- Контакт: ${client.contact}`);
  L.push(`- Прохождений: ${subs.length} (полных ${fulls.length}, коротких ${shorts.length})`);
  if (subs.length) {
    L.push(`- Первое прохождение: ${fmtDate(subs[0].created_at, tz)}`);
    L.push(`- Последнее прохождение: ${fmtDate(last.created_at, tz)}`);
  }
  L.push(`- Режим ретестов: ${SCHEDULES[client.schedule] || SCHEDULES.off}`);
  L.push("");
  L.push("# Главное для клиента (дословно)");
  if (lastFull) {
    const q2 = CONCERN_QUESTIONS;
    L.push(`Из полного прохождения от ${fmtDate(lastFull.created_at, tz)}.`);
    L.push(`- Беспокоит больше всего (${lastFull.concern_score ?? "-"}/10): «${cell(lastFull.concern_text)}»`);
    L.push(`- Как поймёт, что это ушло: «${cell(lastFull.success_text)}»`);
    if (lastFull.other_text) L.push(`- Что ещё беспокоит: «${cell(lastFull.other_text)}»`);
    const series = subs.filter((s) => s.concern_score != null);
    if (series.length > 1) {
      L.push("");
      L.push("Баллы главного беспокойства по датам: " + series.map((s) => `${fmtDate(s.created_at, tz)}: ${s.concern_score}`).join("; "));
    }
    if (fulls.length > 1 && firstFull.concern_text !== lastFull.concern_text) {
      L.push(`Формулировка в первом прохождении: «${cell(firstFull.concern_text)}»`);
    }
    void q2;
  } else {
    L.push("Полных прохождений пока нет.");
  }
  L.push("");
  L.push("# Расчёты");
  if (lastFull) {
    const a = analyze(lastFull.answers);
    L.push(`По последнему полному прохождению (${fmtDate(lastFull.created_at, tz)}).`);
    L.push(`- Сумма: ${fmtNum(a.total)}/100 (${a.totalLabel})`);
    L.push("- Средние по сферам (0-10):");
    [...a.priorities].sort((x, y) => y.mean - x.mean).forEach((p) => L.push(`  - ${p.title}: ${fmtNum(p.mean)} (${p.priority})`));
    L.push("- Выбросы (сильнее всего отличается от обычного себя):");
    if (a.outliers.length) a.outliers.forEach((o) => L.push(`  - №${o.idx + 1} ${QUESTIONS[o.idx].label}: ${o.value} при среднем по сфере «${BLOCKS[o.block].title}» ${fmtNum(o.domainMean)}`));
    else L.push("  - нет");
    L.push("- Другие пункты 5 и выше:");
    if (a.entry.rest.length) a.entry.rest.forEach((r) => L.push(`  - №${r.idx + 1} ${QUESTIONS[r.idx].label}: ${r.value} (${BLOCKS[r.block].title})`));
    else L.push("  - нет");
    L.push("- Противоречия внутри сфер:");
    if (a.contradictions.length) a.contradictions.forEach((c) => L.push(`  - ${BLOCKS[c.block].title}: «${QUESTIONS[c.low.idx].label}» ${c.low.value}, но «${QUESTIONS[c.high.idx].label}» ${c.high.value}`));
    else L.push("  - нет");
    const crit = a.critical;
    const critTxt = crit.level === "red" ? "красный флаг, проверить в первую очередь" : crit.level === "yellow" ? "жёлтый флаг" : "без флага";
    L.push(`- Критический пункт (№${CRITICAL_INDEX + 1}, мысли «лучше бы меня не было»): ${crit.value ?? "-"}/10, ${critTxt}`);
    const maxCrit = Math.max(...subs.map((s) => s.answers[CRITICAL_INDEX]).filter((v) => v != null), 0);
    if (fulls.length > 1 || shorts.length) L.push(`  - максимум за всё время: ${maxCrit}/10`);
    if (fulls.length > 1) {
      L.push("- Динамика между полными прохождениями:");
      L.push("  - Сумма: " + fulls.map((s) => `${fmtDate(s.created_at, tz)}: ${fmtNum(analyze(s.answers).total)}`).join("; "));
      const d = describe(subs, subs.indexOf(lastFull));
      [...d.domains].sort((x, y) => y.mean - x.mean).forEach((m) => L.push(`  - ${m.title}: ${fmtNum(m.first)} → ${fmtNum(m.mean)} (${arrow(m.deltaFirst)} с начала, ${arrow(m.delta)} к предыдущему)`));
    }
  } else {
    L.push("Нет данных.");
  }
  L.push("");
  L.push("# Все ответы");
  if (fulls.length) {
    L.push("Баллы 0-10 по каждому полному прохождению. Пункты упорядочены по убыванию балла в последнем прохождении.");
    L.push("");
    L.push(`| № | Сфера | Вопрос | ${fulls.map((s) => fmtDate(s.created_at, tz)).join(" | ")} |`);
    L.push(`|---|---|---|${fulls.map(() => "---").join("|")}|`);
    [...QUESTIONS].sort((x, y) => (lastFull.answers[y.idx] ?? -1) - (lastFull.answers[x.idx] ?? -1) || x.idx - y.idx).forEach((q2) => {
      L.push(`| ${q2.idx + 1} | ${BLOCKS[q2.block].title} | ${cell(q2.text)} | ${fulls.map((s) => s.answers[q2.idx] ?? "-").join(" | ")} |`);
    });
  } else {
    L.push("Нет данных.");
  }
  L.push("");
  L.push("# Короткие ретесты");
  if (shorts.length) {
    const lastShort = shorts[shorts.length - 1];
    const idxs = [...new Set(shorts.flatMap((s) => s.answers.map((v, i) => v != null ? i : -1).filter((i) => i >= 0)))].sort((a, b) => (lastShort.answers[b] ?? -1) - (lastShort.answers[a] ?? -1) || a - b);
    L.push("Баллы 0-10. «Беспокойство» это оценка главного беспокойства клиента.");
    L.push("");
    L.push(`| Дата | Беспокойство | ${idxs.map((i) => `№${i + 1} ${cell(QUESTIONS[i].label)}`).join(" | ")} |`);
    L.push(`|---|---|${idxs.map(() => "---").join("|")}|`);
    shorts.forEach((s) => L.push(`| ${fmtDate(s.created_at, tz)} | ${s.concern_score ?? "-"} | ${idxs.map((i) => s.answers[i] ?? "-").join(" | ")} |`));
    const notes = shorts.filter((s) => s.week_note);
    L.push("");
    L.push("Что изменилось за неделю (слова клиента):");
    if (notes.length) notes.forEach((s) => L.push(`- ${fmtDate(s.created_at, tz)}: «${cell(s.week_note)}»`));
    else L.push("- записей нет");
  } else {
    L.push("Коротких ретестов пока не было.");
  }
  L.push("");
  const date = fmtDate((last || { created_at: Date.now() }).created_at, tz).split(".").reverse().join("-");
  return { filename: `${safeFileName(client.name)}_${date}.md`, text: L.join("\n") };
}

// worker/src/util.js
var enc = new TextEncoder();
var hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
function timingSafeEqual(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  let r = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
function randomId(bytes = 6) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
async function reportKey(env, clientId) {
  return hex(await hmac(env.REPORT_SECRET, "report:" + clientId)).slice(0, 32);
}
async function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || typeof initData !== "string") return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac("WebAppData", botToken);
  const calc = hex(await hmac(secret, dcs));
  if (!timingSafeEqual(calc, hash)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1e3 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user || !user.id) return null;
    return { user, startParam: params.get("start_param") };
  } catch {
    return null;
  }
}
function validTz(tz) {
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz });
    return typeof tz === "string" && tz.length < 64;
  } catch {
    return false;
  }
}
function offsetMs(ts, tz) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric"
  }).formatToParts(new Date(ts));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ts / 1e3) * 1e3;
}
function localParts(ts, tz) {
  const d = new Date(ts + offsetMs(ts, tz));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() };
}
function zonedTime(y, m, d, h, tz) {
  const guess = Date.UTC(y, m - 1, d, h);
  let off = offsetMs(guess, tz);
  const r = guess - off;
  off = offsetMs(r, tz);
  return guess - off;
}
function snapTo11(ts, tz, now) {
  const { y, m, d } = localParts(ts, tz);
  let r = zonedTime(y, m, d, 11, tz);
  if (r <= now) r = zonedTime(y, m, d + 1, 11, tz);
  return r;
}
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// worker/src/schedule.js
var DAY = 24 * 3600 * 1e3;
var INTERVAL_DAYS = { full_1w: 7, full_4w: 28, mix_1w: 7 };
function planNext({ mode, lastTs, now, tz, pos = 0, hasFull = true }) {
  const days = INTERVAL_DAYS[mode];
  if (!days) return null;
  let cand = (lastTs ?? now) + days * DAY;
  if (cand <= now) cand = now + days * DAY;
  let kind = mode === "mix_1w" ? pos >= 3 ? "full" : "short" : "full";
  if (kind === "short" && !hasFull) kind = "full";
  return { next_at: snapTo11(cand, tz, now), next_kind: kind, cycle_pos: pos };
}
function advancePos(mode, pos, sentKind) {
  if (mode !== "mix_1w") return 0;
  return sentKind === "full" ? 0 : Math.min(pos + 1, 3);
}
function posFromSubs(subs) {
  let n = 0;
  for (let i = subs.length - 1; i >= 0 && subs[i].kind === "short"; i--) n++;
  return Math.min(n, 3);
}

// worker/src/messages.js
var q = (s) => `«${esc(s)}»`;
var cut = (s, n = 700) => String(s).length > n ? String(s).slice(0, n) + "..." : String(s);
function kindTitle(d) {
  if (d.isFirst) return "первичный";
  return d.kind === "full" ? "полный ретест" : "короткий ретест";
}
function clientResultsText(d) {
  const L = [];
  const s = d.sub;
  if (d.kind === "full") {
    L.push("Ваши результаты");
    if (!d.isFirst) L.push("Чем меньше число, тем легче.");
    L.push("");
    [...d.domains].sort((a, b) => b.mean - a.mean).forEach((m) => {
      const a = !d.isFirst && m.delta != null ? " " + arrow(m.delta) : "";
      L.push(`${bar(m.mean)} ${fmtNum(m.mean)}${a}  ${m.title}`);
    });
    if (!d.isFirst && d.concern.prev != null) {
      L.push("");
      L.push(`Главное беспокойство: было ${d.concern.prev}, сейчас ${d.concern.now}`);
    }
    if (d.isFirst) {
      L.push("");
      L.push("Обсудим это на встрече.");
    }
  } else {
    L.push("Ваши результаты");
    L.push("Чем меньше число, тем легче.");
    L.push("");
    [...d.items].sort((a, b) => b.now - a.now || a.idx - b.idx).forEach((it) => {
      const lab = QUESTIONS[it.idx].label;
      const chg = it.prev != null ? `${it.prev} → ${it.now} ${arrow(it.delta)}` : `${it.now}`;
      L.push(`${lab}: ${chg}`);
    });
    if (d.concern.prev != null) {
      L.push("");
      L.push(`Главное беспокойство: было ${d.concern.prev}, сейчас ${d.concern.now}`);
    }
  }
  if (clientSafetyTriggered(s.answers)) {
    L.push("");
    L.push(SAFETY_TEXT);
  }
  return L.join("\n");
}
function flagLine(answers) {
  const v = answers[CRITICAL_INDEX];
  if (v == null || v < 1) return null;
  return v >= 3 ? `🟥 ПРОВЕРИТЬ: мысли «лучше бы меня не было» ${v}/10` : `🟨 Отмечены мысли «лучше бы меня не было» ${v}/10`;
}
function itemLine(it) {
  return `• ${esc(QUESTIONS[it.idx].label)}: ${it.prev} → ${it.now} (${arrow(it.delta)})`;
}
function adminText(client, d, tz) {
  const s = d.sub;
  const L = [];
  const flag = flagLine(s.answers);
  if (flag) L.push(flag);
  L.push(`${esc(client.name)} · ${kindTitle(d)} · ${fmtDate(s.created_at, tz)}`);
  if (d.kind === "full") {
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
    L.push(`Было ${d.concern.prev}, ${arrow(s.concern_score - d.concern.prev)}${d.concern.first != null && d.concern.first !== d.concern.prev ? `; с начала ${arrow(s.concern_score - d.concern.first)}` : ""}`);
  }
  if (s.success_text) L.push(`Как поймёт, что ушло: ${q(cut(s.success_text))}`);
  if (s.other_text) L.push(`Ещё беспокоит: ${q(cut(s.other_text, 400))}`);
  if (s.week_note) L.push(`Что изменилось за неделю: ${q(cut(s.week_note))}`);
  if (d.isFirst || d.kind === "full") {
    const a = d.analysis;
    if (d.isFirst) {
      if (a.outliers.length) {
        L.push("");
        L.push("Сильнее всего отличается от обычного себя:");
        a.outliers.slice(0, 7).forEach((o) => L.push(`• ${esc(QUESTIONS[o.idx].label)} ${o.value} (сфера ${fmtNum(o.domainMean)})`));
      }
      if (a.contradictions.length) {
        const groups = [];
        a.contradictions.forEach((c) => {
          let g = groups.find((x) => x.low.idx === c.low.idx);
          if (!g) {
            g = { block: c.block, low: c.low, highs: [] };
            groups.push(g);
          }
          g.highs.push(c.high);
        });
        L.push("");
        L.push("Противоречия:");
        groups.slice(0, 8).forEach((g) => L.push(`• ${esc(BLOCKS[g.block].title)}: ${esc(QUESTIONS[g.low.idx].label)} ${g.low.value}, но ${g.highs.map((h) => `${esc(QUESTIONS[h.idx].label)} ${h.value}`).join(" и ")}`));
        if (groups.length > 8) L.push(`и ещё ${groups.length - 8} в карте`);
      }
    }
  }
  if (!d.isFirst) {
    if (d.improvements.length) {
      L.push("");
      L.push("Лучше всего улучшилось:");
      d.improvements.forEach((it) => L.push(itemLine(it)));
    }
    if (d.worsenings.length) {
      L.push("");
      L.push("Ухудшилось:");
      d.worsenings.forEach((it) => L.push(itemLine(it)));
    }
    if (!d.improvements.length && !d.worsenings.length) {
      L.push("");
      L.push("Заметных изменений по пунктам нет.");
    }
  }
  return L.join("\n");
}
function cardText(client, lastSub, lastFullTotal, tz) {
  const L = [`<b>${esc(client.name)}</b>`];
  L.push(`Последнее прохождение: ${lastSub ? fmtDate(lastSub.created_at, tz) : "ещё не было"}`);
  L.push(`Ретест: ${SCHEDULES[client.schedule] || SCHEDULES.off}`);
  L.push(`Последняя сумма: ${lastFullTotal == null ? "-" : fmtNum(lastFullTotal) + "/100"}`);
  L.push(client.chat_id ? "Telegram подключён" : "Telegram не подключён");
  return L.join("\n");
}
var SCHEDULE_ORDER = ["full_1w", "full_4w", "mix_1w", "off"];

// worker/src/index.js
var H = 3600 * 1e3;
async function tg(env, method, body) {
  const base = env.TG_API || "https://api.telegram.org";
  try {
    const r = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log("tg error", method, JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) {
    console.log("tg fetch failed", method, String(e));
    return { ok: false };
  }
}
var send = (env, chat_id, text, extra = {}) => tg(env, "sendMessage", { chat_id, text, link_preview_options: { is_disabled: true }, ...extra });
var sendHtml = (env, chat_id, text, markup) => send(env, chat_id, text, { parse_mode: "HTML", ...markup ? { reply_markup: markup } : {} });
async function sendDocument(env, chat_id, filename, text, caption) {
  const fd = new FormData();
  fd.append("chat_id", String(chat_id));
  if (caption) fd.append("caption", caption);
  fd.append("document", new Blob([text], { type: "text/markdown" }), filename);
  const base = env.TG_API || "https://api.telegram.org";
  try {
    const r = await fetch(`${base}/bot${env.BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log("sendDocument error", JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) {
    console.log("sendDocument failed", String(e));
    return { ok: false };
  }
}
var isAdminId = (env, id) => String(id) === String(env.ADMIN_CHAT_ID);
var sees = (env) => String(env.CLIENT_SEES_RESULTS ?? "true") !== "false";
var pagesUrl = (env) => String(env.PAGES_URL || "").replace(/\/$/, "");
var appUrl = (env, kind) => `${pagesUrl(env)}/index.html?kind=${kind}`;
var webAppButton = (env, kind, text = "Пройти опросник") => ({ inline_keyboard: [[{ text, web_app: { url: appUrl(env, kind) } }]] });
async function botUsername(env) {
  if (env.BOT_USERNAME) return env.BOT_USERNAME;
  const r = await tg(env, "getMe", {});
  return r.result?.username || "";
}
var rowToSub = (r) => ({ ...r, answers: normalizeAnswers(JSON.parse(r.answers)) });
async function getClient(env, id) {
  return env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
}
async function getSubs(env, clientId) {
  const { results } = await env.DB.prepare("SELECT * FROM submissions WHERE client_id = ? ORDER BY created_at ASC").bind(clientId).all();
  return results.map(rowToSub);
}
async function allClients(env) {
  const { results } = await env.DB.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
  return results;
}
async function findByName(env, name) {
  const n = name.trim().toLowerCase();
  const all = await allClients(env);
  const exact = all.filter((c) => c.name.toLowerCase() === n);
  return exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(n));
}
async function applySchedule(env, client, mode, now = Date.now()) {
  await env.DB.prepare("UPDATE clients SET schedule = ? WHERE id = ?").bind(mode, client.id).run();
  if (mode === "off") {
    await env.DB.prepare("DELETE FROM reminders WHERE client_id = ?").bind(client.id).run();
    return null;
  }
  const subs = await getSubs(env, client.id);
  const last = subs[subs.length - 1];
  const plan = planNext({
    mode,
    lastTs: last ? last.created_at : null,
    now,
    tz: client.tz,
    pos: posFromSubs(subs),
    hasFull: subs.some((s) => s.kind === "full")
  });
  await env.DB.prepare(
    `INSERT INTO reminders (client_id, next_at, attempts, next_kind, cycle_pos, last_sent_at) VALUES (?, ?, 0, ?, ?, NULL)
     ON CONFLICT(client_id) DO UPDATE SET next_at = excluded.next_at, attempts = 0, next_kind = excluded.next_kind, cycle_pos = excluded.cycle_pos, last_sent_at = NULL`
  ).bind(client.id, plan.next_at, plan.next_kind, plan.cycle_pos).run();
  return plan;
}
var kindWord = (k) => k === "full" ? "полный" : "короткий";
async function runReminders(env, now = Date.now()) {
  const { results } = await env.DB.prepare(
    `SELECT r.client_id, r.next_at, r.attempts, r.next_kind, r.cycle_pos, r.last_sent_at, c.name, c.chat_id, c.tz, c.schedule
     FROM reminders r JOIN clients c ON c.id = r.client_id WHERE r.next_at <= ?`
  ).bind(now).all();
  const log = [];
  for (const r of results) {
    if (r.schedule === "off") {
      await env.DB.prepare("DELETE FROM reminders WHERE client_id = ?").bind(r.client_id).run();
      continue;
    }
    if (!r.chat_id) continue;
    const waited = r.last_sent_at ? now - r.last_sent_at : Infinity;
    if (r.attempts === 0 || r.attempts === 1 && waited >= 23.5 * H) {
      let kind = r.next_kind;
      if (kind === "short") {
        const fulls = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE client_id = ? AND kind = 'full'").bind(r.client_id).first();
        if (!fulls.n) kind = "full";
      }
      const lead = r.attempts === 0 ? "" : "Напоминаю. ";
      const dur = kind === "full" ? "10-15 минут" : "2-3 минуты";
      await send(env, r.chat_id, `${lead}${r.name}, пора отметить, как вы. Займёт ${dur}.`, { reply_markup: webAppButton(env, kind, "Отметить состояние") });
      await env.DB.prepare("UPDATE reminders SET attempts = attempts + 1, last_sent_at = ?, next_kind = ? WHERE client_id = ?").bind(now, kind, r.client_id).run();
      log.push(`sent ${r.name} ${kind} attempt ${r.attempts + 1}`);
    } else if (r.attempts >= 2 && waited >= 23.5 * H) {
      await send(env, env.ADMIN_CHAT_ID, `${r.name} не прошёл(ла) ретест`);
      const pos = advancePos(r.schedule, r.cycle_pos, r.next_kind);
      const subs = await getSubs(env, r.client_id);
      const plan = planNext({ mode: r.schedule, lastTs: now, now, tz: r.tz, pos, hasFull: subs.some((s) => s.kind === "full") });
      await env.DB.prepare("UPDATE reminders SET next_at = ?, attempts = 0, next_kind = ?, cycle_pos = ?, last_sent_at = NULL WHERE client_id = ?").bind(plan.next_at, plan.next_kind, plan.cycle_pos, r.client_id).run();
      log.push(`missed ${r.name}`);
    }
  }
  return log;
}
async function clientButtons(env, client) {
  const key = await reportKey(env, client.id);
  return {
    inline_keyboard: [
      [{ text: "Открыть карту", url: `${pagesUrl(env)}/report.html?id=${client.id}&k=${key}` }],
      [{ text: "Файл для ИИ", callback_data: `ai:${client.id}` }],
      [{ text: "Ретест", callback_data: `rt:${client.id}` }],
      [{ text: "Полный ретест сейчас", callback_data: `now:${client.id}:full` }, { text: "Короткий ретест сейчас", callback_data: `now:${client.id}:short` }]
    ]
  };
}
function scheduleKeyboard(client) {
  return {
    inline_keyboard: SCHEDULE_ORDER.map((m) => [{
      text: (client.schedule === m ? "✓ " : "") + (m === "off" ? "Выключить" : SCHEDULES[m]),
      callback_data: `sm:${client.id}:${m}`
    }])
  };
}
async function sendResultsToClient(env, client, chatId, d) {
  const extra = {};
  if (clientSafetyTriggered(d.sub.answers) && env.THERAPIST_TG) {
    extra.reply_markup = { inline_keyboard: [[{ text: "Написать терапевту", url: `https://t.me/${String(env.THERAPIST_TG).replace(/^@/, "")}` }]] };
  }
  await send(env, chatId, clientResultsText(d), extra);
}
async function notifyAfterSubmit(env, client, subs, idx) {
  const d = describe(subs, idx);
  const markup = await clientButtons(env, client);
  await sendHtml(env, env.ADMIN_CHAT_ID, adminText(client, d, client.tz), markup);
  if (sees(env) && client.chat_id) await sendResultsToClient(env, client, client.chat_id, d);
}
function cors(env) {
  let origin = "*";
  try {
    if (env.PAGES_URL) origin = new URL(env.PAGES_URL).origin;
  } catch {
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
var json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
var clean = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
async function identify(env, initData) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v) return { error: "bad_signature" };
  const client = await env.DB.prepare("SELECT * FROM clients WHERE chat_id = ?").bind(v.user.id).first();
  if (!client) return { error: "unknown_client" };
  return { client };
}
async function apiInit(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.error === "bad_signature" ? 401 : 404);
  const subs = await getSubs(env, who.client.id);
  const fulls = subs.filter((s) => s.kind === "full");
  const kind = body.kind === "short" && fulls.length ? "short" : "full";
  const res = {
    ok: true,
    name: who.client.name,
    kind,
    firstTime: subs.length === 0,
    therapist: env.THERAPIST_TG || ""
  };
  if (kind === "short") {
    res.items = shortItems(fulls[0].answers);
    res.concernText = fulls[0].concern_text || "";
  }
  return json(env, res);
}
async function apiSubmit(env, body) {
  const now = Date.now();
  let client;
  let viaTelegram = false;
  if (body.initData) {
    const who = await identify(env, body.initData);
    if (who.error) return json(env, { ok: false, error: who.error }, who.error === "bad_signature" ? 401 : 404);
    client = who.client;
    viaTelegram = true;
  } else {
    const name = clean(body.name, 100);
    if (!name) return json(env, { ok: false, error: "name_required" }, 400);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM clients WHERE chat_id IS NULL AND invite IS NULL AND created_at > ?").bind(now - H).first();
    if (recent.n >= 60) return json(env, { ok: false, error: "too_many" }, 429);
  }
  const tz = validTz(body.tz) ? body.tz : null;
  const subs = client ? await getSubs(env, client.id) : [];
  const fulls = subs.filter((s) => s.kind === "full");
  const kind = viaTelegram && body.kind === "short" && fulls.length ? "short" : "full";
  if (!Array.isArray(body.answers) || body.answers.length !== TOTAL_QUESTIONS) return json(env, { ok: false, error: "bad_answers" }, 400);
  const answers = body.answers.map((v) => v === null ? null : v);
  if (kind === "full") {
    if (!answers.every(isScore)) return json(env, { ok: false, error: "bad_answers" }, 400);
  } else {
    const want = shortItems(fulls[0].answers);
    const got = answers.map((v, i) => v == null ? -1 : i).filter((i) => i >= 0);
    if (got.join() !== want.join() || !got.every((i) => isScore(answers[i]))) return json(env, { ok: false, error: "bad_answers" }, 400);
  }
  const concernScore = body.concernScore;
  if (!isScore(concernScore)) return json(env, { ok: false, error: "bad_concern" }, 400);
  const concernText = clean(body.concernText, 3e3);
  const successText = clean(body.successText, 3e3);
  if (kind === "full" && (!concernText || !successText)) return json(env, { ok: false, error: "bad_concern" }, 400);
  if (!client) {
    client = {
      id: randomId(6),
      name: clean(body.name, 100),
      contact: clean(body.contact, 200) || null,
      chat_id: null,
      tz: tz || "Europe/Moscow",
      invite: null,
      schedule: "off",
      created_at: now
    };
    await env.DB.prepare("INSERT INTO clients (id, name, contact, chat_id, tz, invite, schedule, created_at) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)").bind(client.id, client.name, client.contact, client.tz, client.schedule, now).run();
  } else if (tz && tz !== client.tz) {
    await env.DB.prepare("UPDATE clients SET tz = ? WHERE id = ?").bind(tz, client.id).run();
    client.tz = tz;
  }
  const sub = {
    id: randomId(8),
    client_id: client.id,
    kind,
    answers,
    concern_text: kind === "full" ? concernText : null,
    concern_score: concernScore,
    success_text: kind === "full" ? successText : null,
    other_text: kind === "full" ? clean(body.otherText, 3e3) || null : null,
    week_note: kind === "short" ? clean(body.weekNote, 3e3) || null : null,
    created_at: now
  };
  await env.DB.prepare(
    "INSERT INTO submissions (id, client_id, kind, answers, concern_text, concern_score, success_text, other_text, week_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(sub.id, sub.client_id, sub.kind, JSON.stringify(answers), sub.concern_text, sub.concern_score, sub.success_text, sub.other_text, sub.week_note, sub.created_at).run();
  const rem = await env.DB.prepare("SELECT * FROM reminders WHERE client_id = ?").bind(client.id).first();
  if (rem && rem.attempts > 0) {
    const pos = advancePos(client.schedule, rem.cycle_pos, rem.next_kind);
    const plan = planNext({ mode: client.schedule, lastTs: now, now, tz: client.tz, pos, hasFull: true });
    if (plan) {
      await env.DB.prepare("UPDATE reminders SET next_at = ?, attempts = 0, next_kind = ?, cycle_pos = ?, last_sent_at = NULL WHERE client_id = ?").bind(plan.next_at, plan.next_kind, plan.cycle_pos, client.id).run();
    }
  }
  const all = [...subs, { ...sub }];
  await notifyAfterSubmit(env, client, all, all.length - 1);
  return json(env, {
    ok: true,
    id: sub.id,
    sees: sees(env),
    critical: answers[38],
    safety: clientSafetyTriggered(answers),
    therapist: env.THERAPIST_TG || "",
    bot: await botUsername(env),
    viaTelegram
  });
}
async function apiReport(env, url) {
  const id = url.searchParams.get("id") || "";
  const k = url.searchParams.get("k") || "";
  const client = id ? await getClient(env, id) : null;
  const expect = client ? await reportKey(env, id) : "";
  if (!client || !timingSafeEqual(k, expect)) return json(env, { ok: false, error: "no_access" }, 403);
  const subs = await getSubs(env, id);
  const rem = await env.DB.prepare("SELECT next_at, next_kind FROM reminders WHERE client_id = ?").bind(id).first();
  return json(env, {
    ok: true,
    client: { id: client.id, name: client.name, contact: client.contact, tz: client.tz, schedule: client.schedule, created_at: client.created_at, next_at: rem?.next_at ?? null, next_kind: rem?.next_kind ?? null },
    submissions: subs
  });
}
var HELP = [
  "Команды:",
  "/new Имя : создать клиента и получить ссылку-приглашение",
  "/clients : список клиентов и их карточки",
  "/export Имя : файл со всей историей клиента",
  "/delete Имя : удалить все данные клиента"
].join("\n");
async function greetClient(env, client, chatId) {
  await send(
    env,
    chatId,
    `Здравствуйте, ${client.name}! Это опросник состояния. Он помогает вам и вашему терапевту увидеть, как вы себя чувствуете. Займёт 10-15 минут. Нажмите кнопку, когда вам будет удобно.`,
    { reply_markup: webAppButton(env, "full") }
  );
}
async function bindClient(env, client, chatId) {
  if (client.chat_id && String(client.chat_id) !== String(chatId)) return false;
  if (!client.chat_id) {
    await env.DB.prepare("UPDATE clients SET chat_id = ? WHERE id = ?").bind(chatId, client.id).run();
    client.chat_id = chatId;
    await send(env, env.ADMIN_CHAT_ID, `${client.name} подключился(ась) к боту`);
  }
  return true;
}
async function onStart(env, msg, payload) {
  const chatId = msg.chat.id;
  if (payload) {
    let client = null;
    let subId = null;
    if (/^s_[0-9a-f]+$/.test(payload)) {
      subId = payload.slice(2);
      const row = await env.DB.prepare("SELECT client_id FROM submissions WHERE id = ?").bind(subId).first();
      if (row) client = await getClient(env, row.client_id);
    } else {
      client = await env.DB.prepare("SELECT * FROM clients WHERE invite = ?").bind(payload).first();
    }
    if (!client) return send(env, chatId, "Эта ссылка не работает. Попросите терапевта прислать новую.");
    if (!await bindClient(env, client, chatId)) return send(env, chatId, "Эта ссылка уже привязана к другому чату. Попросите терапевта прислать новую.");
    if (subId) {
      await send(env, chatId, `Готово, ${client.name}. Теперь результаты и напоминания будут приходить сюда.`);
      if (sees(env)) {
        const subs = await getSubs(env, client.id);
        const i = subs.findIndex((s) => s.id === subId);
        if (i >= 0) await sendResultsToClient(env, client, chatId, describe(subs, i));
      }
      return;
    }
    return greetClient(env, client, chatId);
  }
  if (isAdminId(env, msg.from.id)) return send(env, chatId, "Здравствуйте, Егор!\n\n" + HELP);
  const known = await env.DB.prepare("SELECT * FROM clients WHERE chat_id = ?").bind(chatId).first();
  if (known) return greetClient(env, known, chatId);
  return send(env, chatId, "Чтобы начать, откройте ссылку, которую прислал вам терапевт.");
}
async function pickClient(env, chatId, name, cmd) {
  if (!name) {
    await send(env, chatId, `Напишите имя: /${cmd} Имя`);
    return null;
  }
  const found = await findByName(env, name);
  if (!found.length) {
    await send(env, chatId, `Клиент «${name}» не найден. Список: /clients`);
    return null;
  }
  if (found.length > 1) {
    await send(env, chatId, "Нашлось несколько, уточните имя:\n" + found.map((c) => `${c.name} (${fmtDate(c.created_at)})`).join("\n"));
    return null;
  }
  return found[0];
}
async function sendExport(env, chatId, client) {
  const subs = await getSubs(env, client.id);
  if (!subs.length) return send(env, chatId, `У клиента ${client.name} ещё нет прохождений.`);
  const { filename, text } = buildMarkdown(client, subs);
  return sendDocument(env, chatId, filename, text, `${client.name}: файл для ИИ`);
}
async function sendCard(env, chatId, client) {
  const subs = await getSubs(env, client.id);
  const last = subs[subs.length - 1];
  const lastFull = [...subs].reverse().find((s) => s.kind === "full");
  const total = lastFull ? analyze(lastFull.answers).total : null;
  return sendHtml(env, chatId, cardText(client, last, total, client.tz), await clientButtons(env, client));
}
async function onAdminCommand(env, chatId, cmd, arg) {
  switch (cmd) {
    case "help":
      return send(env, chatId, HELP);
    case "new": {
      const name = clean(arg, 60);
      if (!name) return send(env, chatId, "Напишите имя: /new Имя");
      const id = randomId(6);
      const invite = randomId(8);
      await env.DB.prepare("INSERT INTO clients (id, name, contact, chat_id, tz, invite, schedule, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)").bind(id, name, "Europe/Moscow", invite, "off", Date.now()).run();
      const bot = await botUsername(env);
      return send(env, chatId, `Клиент «${name}» создан. Отправьте ему эту ссылку:

https://t.me/${bot}?start=${invite}

Когда клиент пройдёт опросник, включите ретесты в карточке: /clients`);
    }
    case "clients": {
      const list = await allClients(env);
      if (!list.length) return send(env, chatId, "Клиентов пока нет. Создать: /new Имя");
      const lines = [];
      const buttons = [];
      for (const c of list) {
        const subs = await getSubs(env, c.id);
        const last = subs[subs.length - 1];
        const lastFull = [...subs].reverse().find((s) => s.kind === "full");
        const total = lastFull ? `${analyze(lastFull.answers).total}`.replace(".", ",") + "/100" : "-";
        lines.push(`${c.name}: ${last ? fmtDate(last.created_at, c.tz) : "не проходил(а)"}, ${SCHEDULES[c.schedule]}, сумма ${total}`);
        buttons.push([{ text: c.name, callback_data: `cl:${c.id}` }]);
      }
      return send(env, chatId, lines.join("\n"), { reply_markup: { inline_keyboard: buttons } });
    }
    case "export": {
      const c = await pickClient(env, chatId, arg, "export");
      return c ? sendExport(env, chatId, c) : null;
    }
    case "delete": {
      const c = await pickClient(env, chatId, arg, "delete");
      if (!c) return null;
      return send(env, chatId, `Удалить клиента «${c.name}» и все его данные? Это нельзя отменить.`, {
        reply_markup: { inline_keyboard: [[{ text: "Да, удалить", callback_data: `del:${c.id}` }, { text: "Отмена", callback_data: "dn" }]] }
      });
    }
    case "cron": {
      const log = await runReminders(env);
      return send(env, chatId, log.length ? log.join("\n") : "Сейчас напоминать некому");
    }
    default:
      return null;
  }
}
async function onMessage(env, msg) {
  if (!msg.chat || msg.chat.type !== "private" || !msg.from) return;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : null;
  const arg = m && m[2] ? m[2].trim() : "";
  if (cmd === "start") return onStart(env, msg, arg);
  if (isAdminId(env, msg.from.id) && cmd) {
    const r = await onAdminCommand(env, chatId, cmd, arg);
    if (r !== null) return r;
  }
  if (isAdminId(env, msg.from.id)) return send(env, chatId, HELP);
  const known = await env.DB.prepare("SELECT * FROM clients WHERE chat_id = ?").bind(chatId).first();
  if (known) return send(env, chatId, `${known.name}, я бот для опросника и отвечать на сообщения не умею. Чтобы пройти опросник, нажмите кнопку.`, { reply_markup: webAppButton(env, "full") });
  return send(env, chatId, "Чтобы начать, откройте ссылку, которую прислал вам терапевт.");
}
async function onCallback(env, cq) {
  const answer = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, ...text ? { text } : {} });
  if (!isAdminId(env, cq.from.id) || !cq.message) return answer();
  const chatId = cq.message.chat.id;
  const [act, id, extra] = String(cq.data || "").split(":");
  await answer();
  if (act === "dn") return send(env, chatId, "Отменено.");
  const client = id ? await getClient(env, id) : null;
  if (!client) return send(env, chatId, "Клиент не найден (возможно, уже удалён).");
  switch (act) {
    case "cl":
      return sendCard(env, chatId, client);
    case "ai":
      return sendExport(env, chatId, client);
    case "rt":
      return sendHtml(env, chatId, `Ретест для <b>${esc(client.name)}</b>. Выберите режим:`, scheduleKeyboard(client));
    case "sm": {
      if (!SCHEDULES[extra]) return null;
      const plan = await applySchedule(env, client, extra);
      client.schedule = extra;
      await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: scheduleKeyboard(client) });
      if (!plan) return send(env, chatId, `Ретесты для ${client.name} выключены.`);
      return send(env, chatId, `Режим для ${client.name}: ${SCHEDULES[extra]}.
Следующий ретест: ${fmtDateTime(plan.next_at, client.tz)} (${kindWord(plan.next_kind)}).`);
    }
    case "now": {
      if (!client.chat_id) return send(env, chatId, `${client.name} ещё не подключился(ась) к боту. Отправьте клиенту ссылку-приглашение.`);
      let kind = extra === "short" ? "short" : "full";
      if (kind === "short") {
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE client_id = ? AND kind = 'full'").bind(id).first();
        if (!n.n) return send(env, chatId, "Короткий ретест возможен только после первого полного прохождения.");
      }
      const dur = kind === "full" ? "10-15 минут" : "2-3 минуты";
      await send(env, client.chat_id, `${client.name}, пора отметить, как вы. Займёт ${dur}.`, { reply_markup: webAppButton(env, kind, "Отметить состояние") });
      return send(env, chatId, `Отправлено: ${client.name}, ${kindWord(kind)} ретест. Расписание не изменилось.`);
    }
    case "del": {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM submissions WHERE client_id = ?").bind(id),
        env.DB.prepare("DELETE FROM reminders WHERE client_id = ?").bind(id),
        env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(id)
      ]);
      return send(env, chatId, `Клиент «${client.name}» и все его данные удалены.`);
    }
    default:
      return null;
  }
}
async function handleWebhook(request, env) {
  if (!timingSafeEqual(request.headers.get("x-telegram-bot-api-secret-token"), env.WEBHOOK_SECRET)) return new Response("forbidden", { status: 403 });
  let upd;
  try {
    upd = await request.json();
  } catch {
    return new Response("ok");
  }
  try {
    if (upd.message) await onMessage(env, upd.message);
    else if (upd.callback_query) await onCallback(env, upd.callback_query);
  } catch (e) {
    console.log("webhook error", String(e), e?.stack);
  }
  return new Response("ok");
}
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?diag(?=\/|$)/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (path === "/telegram/webhook" && request.method === "POST") return await handleWebhook(request, env);
      if (path === "/api/report" && request.method === "GET") return await apiReport(env, url);
      if (request.method === "POST" && (path === "/api/init" || path === "/api/submit")) {
        const len = Number(request.headers.get("content-length") || 0);
        if (len > 6e4) return json(env, { ok: false, error: "too_large" }, 413);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json(env, { ok: false, error: "bad_json" }, 400);
        return path === "/api/init" ? await apiInit(env, body) : await apiSubmit(env, body);
      }
      if (path === "/cron" && request.method === "POST") {
        if (!env.CRON_SECRET || !timingSafeEqual(request.headers.get("x-cron-secret"), env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
        return json(env, { ok: true, log: await runReminders(env) });
      }
      if (path === "/") return new Response("ok", { headers: cors(env) });
      return new Response("not found", { status: 404 });
    } catch (e) {
      console.log("error", String(e), e?.stack);
      return json(env, { ok: false, error: "server_error" }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  }
};

// worker/src/pg.js
function makePgDb(query2) {
  const toPg = (sql2) => {
    let i = 0;
    return sql2.replace(/\?/g, () => `$${++i}`);
  };
  const norm = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));
  const exec = async (sql2, params) => norm(await query2(toPg(sql2), params));
  const stmt = (sql2, params = []) => ({
    sql: sql2,
    params,
    bind: (...p) => stmt(sql2, p),
    first: async () => (await exec(sql2, params))[0] ?? null,
    all: async () => ({ results: await exec(sql2, params) }),
    run: async () => {
      await exec(sql2, params);
      return { success: true };
    }
  });
  return {
    prepare: (sql2) => stmt(sql2),
    batch: async (stmts) => {
      for (const s of stmts) await exec(s.sql, s.params);
      return [];
    }
  };
}
async function applySchema(query2, schemaSql) {
  for (const part of schemaSql.split(";")) {
    if (part.trim()) await query2(part, []);
  }
}

// worker/schema.sql
var schema_default = "CREATE TABLE IF NOT EXISTS clients (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  contact TEXT,\n  chat_id BIGINT,\n  tz TEXT NOT NULL DEFAULT 'Europe/Moscow',\n  invite TEXT UNIQUE,\n  schedule TEXT NOT NULL DEFAULT 'off',\n  created_at BIGINT NOT NULL\n);\nCREATE INDEX IF NOT EXISTS idx_clients_chat ON clients(chat_id);\n\nCREATE TABLE IF NOT EXISTS submissions (\n  id TEXT PRIMARY KEY,\n  client_id TEXT NOT NULL,\n  kind TEXT NOT NULL,\n  answers TEXT NOT NULL,\n  concern_text TEXT,\n  concern_score BIGINT,\n  success_text TEXT,\n  other_text TEXT,\n  week_note TEXT,\n  created_at BIGINT NOT NULL\n);\nCREATE INDEX IF NOT EXISTS idx_sub_client ON submissions(client_id, created_at);\n\nCREATE TABLE IF NOT EXISTS reminders (\n  client_id TEXT PRIMARY KEY,\n  next_at BIGINT NOT NULL,\n  attempts BIGINT NOT NULL DEFAULT 0,\n  next_kind TEXT NOT NULL DEFAULT 'full',\n  cycle_pos BIGINT NOT NULL DEFAULT 0,\n  last_sent_at BIGINT\n);\nCREATE INDEX IF NOT EXISTS idx_rem_next ON reminders(next_at);\n";

// supabase/entry.js
var sql = postgres(Deno.env.get("SUPABASE_DB_URL"), {
  max: 3,
  prepare: false,
  types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } }
});
var query = (q2, params) => sql.unsafe(q2, params);
var DB = makePgDb(query);
var ready = null;
Deno.serve(async (req) => {
  ready ??= applySchema(query, schema_default).catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  const env = { ...Deno.env.toObject(), DB };
  return src_default.fetch(req, env);
});
