// supabase/weight-entry.js
import postgres from "npm:postgres@3.4.5";

// weight/src/questions.js
var ANSWER_OPTIONS = ["Не про меня", "Иногда", "Часто", "Точно про меня"];
var BLOCK_NAMES = {
  А: "вода / брошенность",
  Б: "внешность / жир",
  В: "голод / нехватка",
  Г: "сахар (страх-отвращение, сопротивление)",
  Д: "рельсы / откаты"
};
var BLOCK_SHORT = {
  А: "вода / брошенность",
  Б: "внешность / жир",
  В: "голод / нехватка",
  Г: "сахар",
  Д: "рельсы / откаты"
};
var LETTERS = ["А", "Б", "В", "Г", "Д"];
var STATEMENTS = [
  [1, "А", "Мой вес может прыгнуть на 1–2 кг за пару дней, хотя ела как обычно."],
  [2, "Б", "Я часто думаю про себя «некрасивая», «бесформенная», «толстая»."],
  [3, "В", "Мне трудно оставить еду на тарелке или выбросить продукты."],
  [4, "Г", "Бывают внезапные приступы голода, до слабости, дрожи или раздражения."],
  [5, "Д", "Вес набирался волнами, часто после тяжёлого периода, когда «отпустило»."],
  [6, "А", "По утрам лицо отёкшее, к вечеру следы от носков, кольца тесные."],
  [7, "Б", "Мне неприятно видеть себя в зеркале или на фото."],
  [8, "В", "В детстве или в какой-то период еды или денег реально не хватало."],
  [9, "Г", "Тянет на сладкое так, что трудно остановиться."],
  [10, "Д", "Как только начинаю худеть, что-то случается, и всё возвращается."],
  [11, "А", "У меня ощущение, что опереться не на кого и всё держится на мне одной."],
  [12, "Б", "Мне говорили обидное про фигуру или внешность, и это до сих пор задевает."],
  [13, "В", "Я сидела на жёстких диетах, и вес возвращался с прибавкой."],
  [14, "Г", "В моей жизни есть человек или ситуация, от которых мне одновременно страшно и противно."],
  [15, "Д", "Есть люди, места или ситуации, после которых вес, отёки или тяга к еде резко растут."],
  [16, "А", "За последние годы был переезд, развод, потеря дома или работы, больница, и после этого как будто почва ушла из-под ног."],
  [17, "Б", "Есть часть тела, которую я особенно стыжусь."],
  [18, "В", "Если дома нет запаса еды, мне неспокойно."],
  [19, "Г", "Мне регулярно приходится делать то, против чего внутри всё встаёт."],
  [20, "Д", "Я постоянно уставшая, тянет спать, тело тяжёлое."],
  [21, "А", "Пью нормально, а в туалет хожу мало."],
  [22, "Б", "Взвешивание или неудачная примерка может испортить мне весь день."],
  [23, "В", "Меня часто грызёт страх, что денег не хватит."],
  [24, "Г", "После сладкого становится заметно спокойнее."],
  [25, "Д", "Я примерно знаю, с чего всё началось, но эта история до сих пор не закрыта."]
].map(([n, block, text]) => ({ n, key: `q${n}`, block, text }));
if (STATEMENTS.length !== 25) throw new Error("Ожидалось 25 утверждений");
var FOLLOWUPS = [
  { n: 12, key: "f12", prompt: "Кто это сказал и что именно?", topic: "обидное про фигуру" },
  { n: 14, key: "f14", prompt: "Кто это или что за ситуация?", topic: "страшно и противно" },
  { n: 15, key: "f15", prompt: "Какие это люди, места или ситуации?", topic: "триггеры веса" },
  { n: 16, key: "f16", prompt: "Что случилось и когда?", topic: "событие-шок" },
  { n: 17, key: "f17", prompt: "Какая это часть тела?", topic: "часть тела" },
  { n: 19, key: "f19", prompt: "Что именно приходится делать?", topic: "против чего всё встаёт" }
];
var S3_1_OPTIONS = ["Меньше года назад", "1–3 года назад", "3–10 лет назад", "Больше 10 лет назад", "С детства"];
var S3_2_OPTIONS = ["Равномерно, с отёками", "Живот", "Бёдра и ягодицы", "Руки, спина, грудь", "Другое"];
var S4_2_OPTIONS = ["Не сдавала", "Сдавала, всё в норме", "Сдавала, были отклонения"];
var NONE = "Ничего из этого";
var S4_3_OPTIONS = ["Ем много и не могу остановиться", "Вызываю рвоту после еды", "Принимаю слабительные или мочегонные ради веса", NONE];
var S4_4_OPTIONS = ["Беременность", "Роды в последние 12 месяцев", "Менопауза или её начало", NONE];
var TEXTS = {
  s3_1: "Когда вес начал расти или перестал уходить?",
  s3_1_text: "Что происходило в вашей жизни за год до этого?",
  s3_2: "Где в основном копится вес?",
  s3_3: "Что обычно происходит в жизни перед тем, как вес возвращается?",
  s4_1: "Принимаете ли вы постоянно какие-то препараты?",
  s4_2: "Сдавали ли вы за последний год анализы на гормоны щитовидной железы и сахар или инсулин?",
  s4_3: "Бывает ли у вас что-то из этого?",
  s4_4: "Что из этого относится к вам сейчас?"
};

// weight/src/scoring.js
var MAIN = ["А", "Б", "В", "Г"];
function levelOf(score) {
  if (score >= 10) return "фонит явно";
  if (score >= 6) return "участвует";
  return "фон";
}
function blockScores(ans) {
  const scores = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  const threes = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  for (const s of STATEMENTS) {
    const v = Number(ans[s.key]?.value ?? 0);
    scores[s.block] += v;
    if (v === 3) threes[s.block] += 1;
  }
  return { scores, threes };
}
function decide(scores, threes = {}, q16 = null) {
  const max = Math.max(...MAIN.map((l) => scores[l]));
  let primary = [];
  const notes = [];
  if (max < 6) {
    notes.push("Тест тему не поймал. Идти от события: ответы 3.1 и уточнение к вопросу 16.");
  } else {
    const candidates = MAIN.filter((l) => scores[l] >= max - 2 && scores[l] >= 6);
    if (candidates.includes("А")) {
      primary = ["А"];
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
  let second = null;
  const rest = MAIN.filter((l) => !primary.includes(l));
  if (primary.length) {
    const top = rest.filter((l) => scores[l] >= 6).sort((a, b) => scores[b] - scores[a] || (threes[b] ?? 0) - (threes[a] ?? 0) || MAIN.indexOf(a) - MAIN.indexOf(b));
    second = top[0] ?? null;
  }
  if (scores["А"] >= 8 && ["Б", "В", "Г", "Д"].some((l) => scores[l] >= 8)) notes.push("Синдром: вода + ещё одна активная тема. Начинать с блока А.");
  if (q16 != null && q16 >= 2) notes.push("Есть явное событие-шок (вопрос 16).");
  if (scores["Д"] >= 6 && scores["Д"] <= 9) notes.push("Есть откаты. Собрать триггеры (вопрос 15).");
  if (scores["Д"] >= 10) notes.push("Откаты сильные. Сначала снять рельсы, иначе проработка откатится.");
  if (primary.includes("Б")) notes.push("Убрать ежедневное взвешивание и контроль в зеркале.");
  if (primary.includes("В")) notes.push("Жёсткие диеты сейчас не давать.");
  return { primary, second, notes };
}
function screeningFlags(ans) {
  const red = [];
  const warn = [];
  const s41 = ans.s4_1;
  if (s41?.value === "Да") warn.push(`⚠️ Принимает препараты: ${(s41.text || "").trim()}`);
  const s42 = ans.s4_2;
  if (s42?.value === "Не сдавала") warn.push("⚠️ Анализы не сдавала: щитовидка, сахар, инсулин");
  if (s42?.value === "Сдавала, были отклонения") warn.push(`⚠️ Отклонения в анализах: ${s42.skipped || !(s42.text || "").trim() ? "не уточнила" : s42.text.trim()}`);
  const s43 = Array.isArray(ans.s4_3?.value) ? ans.s4_3.value : [];
  if (s43.includes(S4_3_OPTIONS[0])) red.push("🔴 Переедания с потерей контроля");
  if (s43.includes(S4_3_OPTIONS[1]) || s43.includes(S4_3_OPTIONS[2])) red.push("🔴 Рвота / слабительные. Возможное РПП, нужен врач");
  const s44 = (Array.isArray(ans.s4_4?.value) ? ans.s4_4.value : []).filter((v) => v !== NONE && S4_4_OPTIONS.includes(v));
  if (s44.length) warn.push(`⚠️ ${s44.join(", ")}`);
  return { red, warn };
}
function evaluate(ans) {
  const { scores, threes } = blockScores(ans);
  const d = decide(scores, threes, Number(ans.q16?.value ?? 0));
  return { scores, threes, ...d, flags: screeningFlags(ans) };
}

// web/weight/steps.js
var FOLLOWUP_NUMS = [12, 14, 15, 16, 17, 19];
var NONE2 = "Ничего из этого";
var TEXT_KEYS = /* @__PURE__ */ new Set(["s3_1_text", "s3_3"]);
function activeFollowups(ans) {
  return FOLLOWUP_NUMS.filter((n) => Number(ans[`q${n}`]?.value) >= 2);
}
function screens(ans) {
  const list = ["start"];
  for (let n = 1; n <= 25; n++) list.push(`q${n}`);
  const f = activeFollowups(ans);
  if (f.length) list.push("intro", ...f.map((n) => `f${n}`));
  list.push("s3_1", "s3_1_text", "s3_2", "s3_3", "s4_1", "s4_2", "s4_3", "s4_4");
  return list;
}
var filled = (t) => typeof t === "string" && t.trim().length > 0;
function isAnswered(key, ans) {
  const a = ans[key];
  if (key === "start" || key === "intro") return true;
  if (!a) return false;
  if (/^q\d+$/.test(key)) return Number.isInteger(a.value) && a.value >= 0 && a.value <= 3;
  if (/^f\d+$/.test(key) || TEXT_KEYS.has(key)) return a.skipped === true || filled(a.text);
  if (key === "s3_1" || key === "s4_2") return typeof a.value === "string" && a.value.length > 0;
  if (key === "s3_2") return Array.isArray(a.value) && a.value.length > 0;
  if (key === "s4_1") return a.value === "Нет" || a.value === "Да" && filled(a.text);
  if (key === "s4_3" || key === "s4_4") return Array.isArray(a.value) && a.value.length > 0 && (!a.value.includes(NONE2) || a.value.length === 1);
  return false;
}
function firstIncomplete(ans) {
  return screens(ans).find((k) => !isAnswered(k, ans)) || null;
}

// weight/src/report.js
var TZ = "Asia/Saigon";
function fmtDateTime(ts) {
  const p = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));
  return p.replace(",", "");
}
function fileDate(ts) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts)).split(".").reverse().join("-");
}
var said = (a) => !a || a.skipped || !String(a.text ?? "").trim() ? "пропустила" : String(a.text).trim();
var themeLine = (l, scores) => `${l} ${BLOCK_NAMES[l]} (${scores[l]}/15, ${levelOf(scores[l])})`;
function delta(now, prev) {
  if (prev == null) return "";
  const d = now - prev;
  return ` (было ${prev}, ${d === 0 ? "без изменений" : d > 0 ? `+${d}` : `−${Math.abs(d)}`})`;
}
function whereText(a) {
  const vals = Array.isArray(a?.value) ? a.value : [];
  return vals.map((v) => v === "Другое" && String(a.text ?? "").trim() ? `Другое: ${a.text.trim()}` : v).join(", ") || "нет ответа";
}
function reportText({ name, number, finishedAt, ans, ev, prevScores }) {
  const L = [];
  L.push(`🧾 Опросник по весу: ${name}`);
  L.push(`${fmtDateTime(finishedAt)} · прохождение №${number}`);
  if (ev.flags.red.length) {
    L.push("", "🔴 Флаги");
    ev.flags.red.forEach((f) => L.push(f));
  }
  L.push("");
  if (ev.primary.length) L.push(`ГЛАВНАЯ ТЕМА: ${ev.primary.map((l) => themeLine(l, ev.scores)).join(" и ")}`);
  else L.push("ГЛАВНАЯ ТЕМА: не определена");
  if (ev.second) L.push(`Вторая: ${themeLine(ev.second, ev.scores)}`);
  L.push("", "Баллы:");
  LETTERS.forEach((l) => L.push(`${l} ${BLOCK_SHORT[l]}: ${ev.scores[l]}${delta(ev.scores[l], prevScores ? prevScores[l] : null)}`));
  L.push("", "Пометки:");
  if (ev.notes.length) ev.notes.forEach((n) => L.push(n));
  else L.push("нет");
  L.push("", "Ответы «точно про меня»:");
  const threes = STATEMENTS.filter((s) => Number(ans[s.key]?.value) === 3);
  if (threes.length) threes.forEach((s) => L.push(`${s.n}. ${s.text}`));
  else L.push("нет");
  L.push("", "Её словами:");
  const act = activeFollowups(ans);
  const fs = FOLLOWUPS.filter((f) => act.includes(f.n));
  if (fs.length) fs.forEach((f) => L.push(`к вопросу ${f.n} (${f.topic}): ${said(ans[f.key])}`));
  else L.push("уточнений не было");
  L.push("");
  L.push(`Начало: ${ans.s3_1?.value ?? "нет ответа"}. За год до этого: ${said(ans.s3_1_text)}`);
  L.push(`Где копится: ${whereText(ans.s3_2)}`);
  L.push(`Перед откатом: ${said(ans.s3_3)}`);
  L.push("", "Скрининг:");
  if (ev.flags.warn.length) ev.flags.warn.forEach((f) => L.push(f));
  else L.push("без замечаний");
  return L.join("\n");
}
function splitMessage(text, limit = 4e3) {
  if (text.length <= limit) return [text];
  const parts = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > limit && cur) {
      parts.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) parts.push(cur);
  return parts;
}
var cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
function safeName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|\n\r]+/g, "").replace(/\s+/g, "_") || "client";
}
function reportMarkdown({ name, number, finishedAt, ans, ev, prevScores }) {
  const L = [];
  L.push(`# Опросник по весу: ${name}`);
  L.push("");
  L.push(`Прохождение №${number}, завершено ${fmtDateTime(finishedAt)} (время Asia/Saigon).`);
  L.push("");
  L.push("Это результаты опросника, который клиентка гипнотерапевта прошла перед работой с весом. 25 утверждений оцениваются по шкале 0–3: 0 «Не про меня», 1 «Иногда», 2 «Часто», 3 «Точно про меня». Утверждения разбиты на 5 блоков (тем) по 5 штук, балл блока это сумма ответов, от 0 до 15. Уровень блока: 10–15 «фонит явно», 6–9 «участвует», 0–5 «фон». Ключ блоков в конце файла. Это не диагноз, а ориентир для терапевта.");
  L.push("");
  L.push("## Итог");
  if (ev.primary.length) L.push(`- Главная тема: ${ev.primary.map((l) => themeLine(l, ev.scores)).join(" и ")}`);
  else L.push("- Главная тема: не определена");
  L.push(`- Вторая тема: ${ev.second ? themeLine(ev.second, ev.scores) : "нет"}`);
  L.push("");
  L.push("### Баллы блоков");
  LETTERS.forEach((l) => L.push(`- ${l} ${BLOCK_NAMES[l]}: ${ev.scores[l]}/15, ${levelOf(ev.scores[l])}${delta(ev.scores[l], prevScores ? prevScores[l] : null)}`));
  if (prevScores) L.push("", "«было» это баллы предыдущего прохождения.");
  L.push("");
  L.push("### Пометки");
  if (ev.notes.length) ev.notes.forEach((n) => L.push(`- ${n}`));
  else L.push("- нет");
  L.push("");
  L.push("### Флаги");
  const allFlags = [...ev.flags.red, ...ev.flags.warn];
  if (allFlags.length) allFlags.forEach((f) => L.push(`- ${f}`));
  else L.push("- нет");
  L.push("");
  L.push("## Ответы на 25 утверждений");
  L.push("");
  L.push("| № | Блок | Утверждение | Ответ | Балл |");
  L.push("|---|---|---|---|---|");
  STATEMENTS.forEach((s) => {
    const v = ans[s.key]?.value;
    L.push(`| ${s.n} | ${s.block} | ${cell(s.text)} | ${v == null ? "нет ответа" : ANSWER_OPTIONS[v]} | ${v ?? "-"} |`);
  });
  L.push("");
  L.push("## Уточнения её словами");
  L.push("Уточнение задаётся, только если на исходное утверждение ответ 2 или 3.");
  L.push("");
  const act = activeFollowups(ans);
  FOLLOWUPS.forEach((f) => {
    const st = STATEMENTS[f.n - 1];
    if (act.includes(f.n)) L.push(`- К утверждению ${f.n} («${st.text}»). Вопрос: «${f.prompt}» Ответ: ${said(ans[f.key])}`);
    else L.push(`- К утверждению ${f.n}: не задавалось (ответ на утверждение 0 или 1)`);
  });
  L.push("");
  L.push("## История веса");
  L.push(`- ${TEXTS.s3_1} ${ans.s3_1?.value ?? "нет ответа"}`);
  L.push(`- ${TEXTS.s3_1_text} ${said(ans.s3_1_text)}`);
  L.push(`- ${TEXTS.s3_2} ${whereText(ans.s3_2)} (варианты: ${S3_2_OPTIONS.join(", ")})`);
  L.push(`- ${TEXTS.s3_3} ${said(ans.s3_3)}`);
  L.push("");
  L.push("## Скрининг");
  const s41 = ans.s4_1;
  L.push(`- ${TEXTS.s4_1} ${s41?.value ?? "нет ответа"}${s41?.value === "Да" ? `. Какие: ${String(s41.text ?? "").trim()}` : ""}`);
  const s42 = ans.s4_2;
  L.push(`- ${TEXTS.s4_2} ${s42?.value ?? "нет ответа"}${s42?.value === "Сдавала, были отклонения" ? `. Какие: ${said(s42)}` : ""}`);
  L.push(`- ${TEXTS.s4_3} ${(ans.s4_3?.value || []).join(", ") || "нет ответа"}`);
  L.push(`- ${TEXTS.s4_4} ${(ans.s4_4?.value || []).join(", ") || "нет ответа"}`);
  L.push("");
  L.push("## Ключ");
  LETTERS.forEach((l) => {
    const nums = STATEMENTS.filter((s) => s.block === l).map((s) => s.n).join(", ");
    L.push(`- Блок ${l} «${BLOCK_NAMES[l]}»: утверждения ${nums}`);
  });
  L.push("");
  L.push("Правила выбора главной темы: выбирается только из блоков А, Б, В, Г (блок Д «рельсы / откаты» главной темой быть не может). Если максимум среди А–Г меньше 6, главной темы нет. Кандидаты: блоки с баллом не ниже максимума минус 2 и не ниже 6. Если А среди кандидатов, главная тема А. Иначе берётся лидер по баллу, при равенстве тот, у кого больше ответов 3, при полном равенстве две главные темы. Вторая тема: наибольший балл среди оставшихся А–Г, если он не ниже 6.");
  L.push("");
  return { filename: `ves_${safeName(name)}_${fileDate(finishedAt)}.md`, text: L.join("\n") };
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

// weight/src/index.js
var DEFAULTS = { WT_PAGES_URL: "https://egor-la.github.io/hypno-diag/weight", WT_BOT_USERNAME: "overweight_gnm_bot" };
async function webhookSecret(env) {
  return env.WT_WEBHOOK_SECRET || hex(await hmac(env.WT_BOT_TOKEN, "wt-webhook")).slice(0, 48);
}
var NO_LINK = "Этот опросник открывается по личной ссылке. Попросите её у Егора";
async function tg(env, method, body) {
  const base = env.TG_API || "https://api.telegram.org";
  try {
    const r = await fetch(`${base}/bot${env.WT_BOT_TOKEN}/${method}`, {
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
async function sendDocument(env, chat_id, filename, text) {
  const fd = new FormData();
  fd.append("chat_id", String(chat_id));
  fd.append("document", new Blob([text], { type: "text/markdown" }), filename);
  const base = env.TG_API || "https://api.telegram.org";
  try {
    const r = await fetch(`${base}/bot${env.WT_BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.log("sendDocument failed", String(e));
    return { ok: false };
  }
}
var isAdmin = (env, id) => String(id) === String(env.ADMIN_CHAT_ID);
var pagesUrl = (env) => String(env.WT_PAGES_URL || "").replace(/\/$/, "");
var startButton = (env) => ({ inline_keyboard: [[{ text: "Пройти опросник", web_app: { url: `${pagesUrl(env)}/index.html` } }]] });
async function botUsername(env) {
  if (env.WT_BOT_USERNAME) return env.WT_BOT_USERNAME;
  const r = await tg(env, "getMe", {});
  return r.result?.username || "";
}
var personalLink = async (env, client) => `https://t.me/${await botUsername(env)}?start=${client.token}`;
var db = (env) => env.DB;
async function lastSession(env, clientId) {
  return db(env).prepare("SELECT * FROM wt_sessions WHERE client_id = ? ORDER BY number DESC LIMIT 1").bind(clientId).first();
}
async function prevFinished(env, clientId, number) {
  return db(env).prepare("SELECT * FROM wt_sessions WHERE client_id = ? AND status = 'finished' AND number < ? ORDER BY number DESC LIMIT 1").bind(clientId, number).first();
}
async function loadAnswers(env, sessionId) {
  const { results } = await db(env).prepare("SELECT question_key, value, text, skipped FROM wt_answers WHERE session_id = ?").bind(sessionId).all();
  const ans = {};
  for (const r of results) {
    let value = r.value;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
      }
    }
    ans[r.question_key] = { value, text: r.text, skipped: !!r.skipped };
  }
  return ans;
}
async function newSession(env, clientId, number) {
  const s = { id: randomId(8), client_id: clientId, number, started_at: Date.now() };
  await db(env).prepare("INSERT INTO wt_sessions (id, client_id, number, status, current_step, started_at) VALUES (?, ?, ?, 'in_progress', 'start', ?)").bind(s.id, clientId, number, s.started_at).run();
  return { ...s, status: "in_progress", current_step: "start" };
}
async function allClients(env) {
  const { results } = await db(env).prepare("SELECT * FROM wt_clients ORDER BY created_at DESC").all();
  return results;
}
async function findByName(env, name) {
  const n = name.trim().toLowerCase();
  const all = await allClients(env);
  const exact = all.filter((c) => c.name.toLowerCase() === n);
  return exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(n));
}
async function buildReport(env, client, session) {
  const ans = await loadAnswers(env, session.id);
  const ev = evaluate(ans);
  const prev = await prevFinished(env, client.id, session.number);
  let prevScores = prev?.scores ?? null;
  if (typeof prevScores === "string") prevScores = JSON.parse(prevScores);
  const data = { name: client.name, number: session.number, finishedAt: Number(session.finished_at), ans, ev, prevScores };
  return { ev, text: reportText(data), md: reportMarkdown(data) };
}
async function sendReport(env, chatId, client, session) {
  const r = await buildReport(env, client, session);
  for (const part of splitMessage(r.text)) await send(env, chatId, part);
  await sendDocument(env, chatId, r.md.filename, r.md.text);
  return r;
}
var clean = (v, max = 3e3) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
var subsetOf = (arr, opts) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => opts.includes(x)) && new Set(arr).size === arr.length;
var ALL_KEYS = /* @__PURE__ */ new Set([...STATEMENTS.map((s) => s.key), ...FOLLOWUPS.map((f) => f.key), "s3_1", "s3_1_text", "s3_2", "s3_3", "s4_1", "s4_2", "s4_3", "s4_4"]);
function normalizeAnswer(key, b) {
  const skipped = b.skipped === true;
  const text = skipped ? null : clean(b.text) || null;
  if (/^q\d+$/.test(key)) return Number.isInteger(b.value) && b.value >= 0 && b.value <= 3 ? { value: b.value, text: null, skipped: false } : null;
  if (/^f\d+$/.test(key) || key === "s3_1_text" || key === "s3_3") return skipped || text ? { value: null, text, skipped } : null;
  if (key === "s3_1") return S3_1_OPTIONS.includes(b.value) ? { value: b.value, text: null, skipped: false } : null;
  if (key === "s3_2") return subsetOf(b.value, S3_2_OPTIONS) ? { value: b.value, text: b.value.includes("Другое") ? clean(b.text) || null : null, skipped: false } : null;
  if (key === "s4_1") {
    if (b.value === "Нет") return { value: "Нет", text: null, skipped: false };
    return b.value === "Да" && clean(b.text) ? { value: "Да", text: clean(b.text), skipped: false } : null;
  }
  if (key === "s4_2") {
    if (!S4_2_OPTIONS.includes(b.value)) return null;
    const dev = b.value === "Сдавала, были отклонения";
    return { value: b.value, text: dev && !skipped ? clean(b.text) || null : null, skipped: dev && (skipped || !clean(b.text)) };
  }
  if (key === "s4_3" || key === "s4_4") {
    const opts = key === "s4_3" ? S4_3_OPTIONS : S4_4_OPTIONS;
    if (!subsetOf(b.value, opts)) return null;
    if (b.value.includes(NONE) && b.value.length > 1) return null;
    return { value: b.value, text: null, skipped: false };
  }
  return null;
}
function cors(env) {
  let origin = "*";
  try {
    if (env.WT_PAGES_URL) origin = new URL(env.WT_PAGES_URL).origin;
  } catch {
  }
  return { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
}
var json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
async function identify(env, initData) {
  const v = await verifyInitData(initData, env.WT_BOT_TOKEN);
  if (!v) return { error: "bad_signature", status: 401 };
  const client = await db(env).prepare("SELECT * FROM wt_clients WHERE tg_user_id = ?").bind(v.user.id).first();
  if (!client) return { error: "no_link", status: 403 };
  let session = await lastSession(env, client.id);
  if (!session) session = await newSession(env, client.id, 1);
  return { client, session };
}
function content() {
  return {
    statements: STATEMENTS.map((s) => ({ key: s.key, n: s.n, text: s.text })),
    options: ANSWER_OPTIONS,
    followups: Object.fromEntries(FOLLOWUPS.map((f) => [f.key, { n: f.n, prompt: f.prompt, statement: STATEMENTS[f.n - 1].text }])),
    texts: TEXTS,
    s3_1: S3_1_OPTIONS,
    s3_2: S3_2_OPTIONS,
    s4_2: S4_2_OPTIONS,
    s4_3: S4_3_OPTIONS,
    s4_4: S4_4_OPTIONS
  };
}
async function apiState(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { session } = who;
  const finished = session.status === "finished";
  return json(env, {
    ok: true,
    status: session.status,
    step: finished ? null : session.current_step || "start",
    answers: finished ? {} : await loadAnswers(env, session.id),
    content: finished ? null : content()
  });
}
async function apiAnswer(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { session } = who;
  if (session.status === "finished") return json(env, { ok: false, error: "finished" }, 409);
  const now = Date.now();
  if (body.key != null) {
    if (!ALL_KEYS.has(body.key)) return json(env, { ok: false, error: "bad_key" }, 400);
    const a = normalizeAnswer(body.key, body);
    if (!a) return json(env, { ok: false, error: "bad_value" }, 400);
    await db(env).prepare(
      `INSERT INTO wt_answers (session_id, question_key, value, text, skipped, updated_at) VALUES (?, ?, ?::jsonb, ?, ?, ?)
       ON CONFLICT (session_id, question_key) DO UPDATE SET value = excluded.value, text = excluded.text, skipped = excluded.skipped, updated_at = excluded.updated_at`
    ).bind(session.id, body.key, a.value == null ? null : JSON.stringify(a.value), a.text, a.skipped, now).run();
  }
  if (typeof body.step === "string" && body.step.length < 20) {
    await db(env).prepare("UPDATE wt_sessions SET current_step = ? WHERE id = ?").bind(body.step, session.id).run();
  }
  return json(env, { ok: true });
}
async function apiFinish(env, body) {
  const who = await identify(env, body.initData);
  if (who.error) return json(env, { ok: false, error: who.error }, who.status);
  const { client, session } = who;
  if (session.status === "finished") return json(env, { ok: true, already: true });
  const ans = await loadAnswers(env, session.id);
  const missing = firstIncomplete(ans);
  if (missing) return json(env, { ok: false, error: "incomplete", step: missing }, 400);
  const ev = evaluate(ans);
  const now = Date.now();
  const primary = ev.primary.length ? ev.primary.join(" и ") : null;
  const upd = await db(env).prepare(
    `UPDATE wt_sessions SET status = 'finished', finished_at = ?, current_step = NULL, scores = ?::jsonb, primary_theme = ?, second_theme = ?, notes = ?::jsonb, flags = ?::jsonb
     WHERE id = ? AND status = 'in_progress' RETURNING id`
  ).bind(now, JSON.stringify(ev.scores), primary, ev.second, JSON.stringify(ev.notes), JSON.stringify(ev.flags), session.id).first();
  if (!upd) return json(env, { ok: true, already: true });
  await sendReport(env, env.ADMIN_CHAT_ID, client, { ...session, status: "finished", finished_at: now });
  return json(env, { ok: true });
}
var HELP = [
  "Команды:",
  "/new Имя : создать клиентку и получить личную ссылку",
  "/list : список клиенток и статус",
  "/result Имя : последний отчёт и файл",
  "/retest Имя : открыть новое прохождение"
].join("\n");
async function pickClient(env, chatId, arg, cmd) {
  if (!arg) {
    await send(env, chatId, `Напишите имя: /${cmd} Имя`);
    return null;
  }
  const found = await findByName(env, arg);
  if (!found.length) {
    await send(env, chatId, `Клиентка «${arg}» не найдена. Список: /list`);
    return null;
  }
  if (found.length > 1) {
    await send(env, chatId, "Нашлось несколько, уточните имя:\n" + found.map((c) => c.name).join("\n"));
    return null;
  }
  return found[0];
}
async function statusLine(env, c) {
  const s = await lastSession(env, c.id);
  if (!s) return `${c.name}: не начала`;
  const num = s.number > 1 ? ` (прохождение №${s.number})` : "";
  if (s.status === "finished") return `${c.name}: прошла, ${fmtDateTime(Number(s.finished_at))}${num}`;
  const ans = await loadAnswers(env, s.id);
  if (!Object.keys(ans).length) return `${c.name}: не начала${num}${c.tg_user_id ? "" : ", ссылку ещё не открыла"}`;
  const list = screens(ans);
  const step = list.includes(s.current_step) ? s.current_step : firstIncomplete(ans) || list[list.length - 1];
  return `${c.name}: в процессе, вопрос ${list.indexOf(step)} из ${list.length - 1}${num}`;
}
async function onAdminCommand(env, chatId, cmd, arg) {
  switch (cmd) {
    case "help":
      return send(env, chatId, HELP);
    case "new": {
      const name = clean(arg, 60);
      if (!name) return send(env, chatId, "Напишите имя: /new Имя");
      const client = { id: randomId(6), name, token: randomId(12), created_at: Date.now() };
      await db(env).prepare("INSERT INTO wt_clients (id, name, token, tg_user_id, created_at) VALUES (?, ?, ?, NULL, ?)").bind(client.id, client.name, client.token, client.created_at).run();
      await newSession(env, client.id, 1);
      return send(env, chatId, `Клиентка «${name}» создана. Её личная ссылка:

${await personalLink(env, client)}`);
    }
    case "list": {
      const list = await allClients(env);
      if (!list.length) return send(env, chatId, "Клиенток пока нет. Создать: /new Имя");
      const lines = [];
      for (const c of list) lines.push(await statusLine(env, c));
      return send(env, chatId, lines.join("\n"));
    }
    case "result": {
      const c = await pickClient(env, chatId, arg, "result");
      if (!c) return true;
      const s = await db(env).prepare("SELECT * FROM wt_sessions WHERE client_id = ? AND status = 'finished' ORDER BY number DESC LIMIT 1").bind(c.id).first();
      if (!s) return send(env, chatId, `${c.name} ещё не прошла опросник.`);
      return sendReport(env, chatId, c, s);
    }
    case "retest": {
      const c = await pickClient(env, chatId, arg, "retest");
      if (!c) return true;
      const s = await lastSession(env, c.id);
      const link = await personalLink(env, c);
      if (s && s.status === "in_progress") return send(env, chatId, `У ${c.name} уже открыто прохождение №${s.number}. Ссылка:

${link}`);
      const ns = await newSession(env, c.id, (s?.number ?? 0) + 1);
      return send(env, chatId, `Открыто прохождение №${ns.number} для ${c.name}. Ссылка:

${link}`);
    }
    default:
      return null;
  }
}
async function onStart(env, msg, payload) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!payload) {
    if (isAdmin(env, userId)) return send(env, chatId, "Здравствуйте, Егор!\n\n" + HELP);
    const known = await db(env).prepare("SELECT * FROM wt_clients WHERE tg_user_id = ?").bind(userId).first();
    if (known) return send(env, chatId, "Нажмите кнопку, чтобы открыть опросник.", { reply_markup: startButton(env) });
    return send(env, chatId, NO_LINK);
  }
  const client = /^[0-9a-f]{24}$/.test(payload) ? await db(env).prepare("SELECT * FROM wt_clients WHERE token = ?").bind(payload).first() : null;
  if (!client) return send(env, chatId, NO_LINK);
  if (client.tg_user_id && String(client.tg_user_id) !== String(userId)) return send(env, chatId, NO_LINK);
  if (!client.tg_user_id) {
    const other = await db(env).prepare("SELECT id FROM wt_clients WHERE tg_user_id = ?").bind(userId).first();
    if (other) return send(env, chatId, NO_LINK);
    const upd = await db(env).prepare("UPDATE wt_clients SET tg_user_id = ? WHERE id = ? AND tg_user_id IS NULL RETURNING id").bind(userId, client.id).first();
    if (!upd) return send(env, chatId, NO_LINK);
    await send(env, env.ADMIN_CHAT_ID, `${client.name} открыла ссылку`);
  }
  return send(env, chatId, `Здравствуйте, ${client.name}! Нажмите кнопку, чтобы открыть опросник.`, { reply_markup: startButton(env) });
}
async function onMessage(env, msg) {
  if (!msg.chat || msg.chat.type !== "private" || !msg.from) return;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : null;
  const arg = m && m[2] ? m[2].trim() : "";
  if (cmd === "start") return onStart(env, msg, arg);
  if (isAdmin(env, msg.from.id)) {
    if (cmd) {
      const r = await onAdminCommand(env, chatId, cmd, arg);
      if (r !== null) return r;
    }
    return send(env, chatId, HELP);
  }
  const known = await db(env).prepare("SELECT id FROM wt_clients WHERE tg_user_id = ?").bind(msg.from.id).first();
  if (known) return send(env, chatId, "Нажмите кнопку, чтобы открыть опросник.", { reply_markup: startButton(env) });
  return send(env, chatId, NO_LINK);
}
async function handleWebhook(request, env) {
  if (!timingSafeEqual(request.headers.get("x-telegram-bot-api-secret-token"), await webhookSecret(env))) return new Response("forbidden", { status: 403 });
  let upd;
  try {
    upd = await request.json();
  } catch {
    return new Response("ok");
  }
  try {
    if (upd.message) await onMessage(env, upd.message);
  } catch (e) {
    console.log("webhook error", String(e), e?.stack);
  }
  return new Response("ok");
}
var src_default = {
  async fetch(request, rawEnv) {
    const env = { ...DEFAULTS, ...rawEnv };
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?weight(?=\/|$)/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (path === "/telegram/webhook" && request.method === "POST") return await handleWebhook(request, env);
      if (request.method === "POST" && ["/api/state", "/api/answer", "/api/finish"].includes(path)) {
        if (Number(request.headers.get("content-length") || 0) > 2e4) return json(env, { ok: false, error: "too_large" }, 413);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json(env, { ok: false, error: "bad_json" }, 400);
        if (path === "/api/state") return await apiState(env, body);
        if (path === "/api/answer") return await apiAnswer(env, body);
        return await apiFinish(env, body);
      }
      if (path === "/") return new Response("ok", { headers: cors(env) });
      return new Response("not found", { status: 404 });
    } catch (e) {
      console.log("error", String(e), e?.stack);
      return json(env, { ok: false, error: "server_error" }, 500);
    }
  }
};

// worker/src/pg.js
function makePgDb(query) {
  const toPg = (sql2) => {
    let i = 0;
    return sql2.replace(/\?/g, () => `$${++i}`);
  };
  const norm = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));
  const exec = async (sql2, params) => norm(await query(toPg(sql2), params));
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

// supabase/weight-entry.js
var sql = postgres(Deno.env.get("SUPABASE_DB_URL"), {
  max: 3,
  prepare: false,
  types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } }
});
var DB = makePgDb((q, params) => sql.unsafe(q, params));
Deno.serve((req) => src_default.fetch(req, { ...Deno.env.toObject(), DB }));
