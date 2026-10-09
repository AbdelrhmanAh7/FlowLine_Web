// Flowline story film: storyboard in docs/video/storyboard.md. Edit the copy here; timings are in seconds.
// Footage = the real-UI walkthrough recorded by the landing demo pipeline (#99) on sample data
// (copied into public/footage/ by `node fetch-footage.mjs`). Honesty: sample data only, no AI/integration/pricing claims.
import type { Card, Locale, Scene, Story } from "./types.ts";

type Copy = {
  leads: Card[];
  queue: Card[];
  sorted: Card[];
  groups: [string, string];
  hook: { eyebrow: string; line: string };
  persona: { initial: string; name: string; role: string; place: string; facts: string[] };
  pain: { eyebrow: string; lines: string[] };
  turn: string[];
  ch: { chapter: string; caption: string }[];
  monday: { eyebrow: string; line: string };
  outcome: { title: string; points: string[] };
  cta: { tagline: string; badge: string; action: string; note: string };
  handoff: { eyebrow: string; lines: string[]; won: Card; next: Card; badge: string; caption: string };
  short: { hook: string; turn: string; run: string; inspect: string };
};

const en: Copy = {
  leads: [
    { title: "Ada Lovelace", sub: "analytical.io · 120 employees", tag: "New", tone: "accent" },
    { title: "Omar Hassan", sub: "Delta Clinics · 8 employees", tag: "New", tone: "accent" },
    { title: "Salma Adel", sub: "NileTech · 65 employees", tag: "New", tone: "accent" },
    { title: "Karim Fouad", sub: "Corner Café · 3 employees", tag: "New", tone: "accent" },
    { title: "Youssef Ali", sub: "Giza Logistics · 210 employees", tag: "New", tone: "accent" },
  ],
  queue: [
    { title: "Karim Fouad", sub: "Corner Café · 3 employees", tag: "Read", tone: "neutral" },
    { title: "Omar Hassan", sub: "Delta Clinics · 8 employees", tag: "Read", tone: "neutral" },
    { title: "Ada Lovelace", sub: "analytical.io · 120 employees", tag: "In queue", tone: "neutral", later: { tag: "Waiting 2 days", tone: "warn" } },
    { title: "Salma Adel", sub: "NileTech · 65 employees", tag: "In queue", tone: "neutral", later: { tag: "Waiting 3 days", tone: "warn" } },
    { title: "Youssef Ali", sub: "Giza Logistics · 210 employees", tag: "In queue", tone: "neutral", later: { tag: "Went cold", tone: "bad", faded: true } },
  ],
  sorted: [
    { title: "Ada Lovelace", sub: "analytical.io · 120 employees", tag: "Hot", tone: "good" },
    { title: "Omar Hassan", sub: "Delta Clinics · 8 employees", tag: "Nurture", tone: "neutral" },
    { title: "Youssef Ali", sub: "Giza Logistics · 210 employees", tag: "Hot", tone: "good" },
    { title: "Karim Fouad", sub: "Corner Café · 3 employees", tag: "Nurture", tone: "neutral" },
    { title: "Salma Adel", sub: "NileTech · 65 employees", tag: "Hot", tone: "good" },
  ],
  groups: ["Hot lead · call today", "Nurture · follow up later"],
  hook: { eyebrow: "Cairo · 9:04 AM", line: "The inbox is full before the coffee is." },
  persona: {
    initial: "N",
    name: "Nour",
    role: "Head of sales at an office-supplies company",
    place: "Nasr City, Cairo",
    facts: ["A team of 9", "Leads from the website form, all day"],
  },
  pain: {
    eyebrow: "The problem",
    lines: ["Every lead is read and sorted by hand.", "Big accounts wait in the same queue.", "Some go cold before anyone calls."],
  },
  turn: ["So Nour writes her rule once.", "Flowline runs it for every lead."],
  ch: [
    { chapter: "1 · Start from a template", caption: "She starts from the Lead Qualifier template. It runs on sample data, so nothing real is touched." },
    { chapter: "2 · Add her rule", caption: "She adds a step, connects it and sets its condition: her own rule, written once." },
    { chapter: "3 · Run it", caption: "Press Run: the lead goes through each step. Ada's company of 120 lands in Hot lead." },
    { chapter: "4 · See why", caption: "Open any step to see what went in and what came out. Every run stays in the history." },
    { chapter: "5 · Share with the team", caption: "She shares a copy with the ops workspace. Connections are cleared; credentials never travel." },
  ],
  monday: { eyebrow: "Next Monday · 9:04 AM", line: "Hot leads first." },
  outcome: {
    title: "What changed for Nour",
    points: ["Every lead is checked the same way", "Big accounts reach the top of the list", "Every decision has a record she can open"],
  },
  cta: {
    tagline: "Connect simple steps. See what happened at each one.",
    badge: "✦ Preview · free during the beta",
    action: "Start building — free",
    note: "Arabic first · English too",
  },
  handoff: {
    eyebrow: "Next: Flowline × Mizano",
    lines: ["Ada's company says yes.", "The deal moves on to the books."],
    won: { title: "Ada Lovelace", sub: "analytical.io · deal won", tag: "Won", tone: "good" },
    next: { title: "analytical.io", sub: "New customer · quote to prepare", tag: "Draft", tone: "accent" },
    badge: "Vision · the Flowline × Mizano link is not built yet",
    caption: "The quote, the invoice and the VAT are Mizano's job. Same company, next chapter.",
  },
  short: {
    hook: "Still sorting every lead by hand?",
    turn: "Write the rule once.",
    run: "Press Run: every lead goes through the same steps.",
    inspect: "Open any step to see why it went where it did.",
  },
};

const ar: Copy = {
  leads: [
    { title: "Ada Lovelace", sub: "analytical.io · ١٢٠ موظفًا", tag: "جديد", tone: "accent" },
    { title: "عمر حسن", sub: "عيادات الدلتا · ٨ موظفين", tag: "جديد", tone: "accent" },
    { title: "سلمى عادل", sub: "نايل تك · ٦٥ موظفًا", tag: "جديد", tone: "accent" },
    { title: "كريم فؤاد", sub: "كافيه الناصية · ٣ موظفين", tag: "جديد", tone: "accent" },
    { title: "يوسف علي", sub: "الجيزة للخدمات اللوجستية · ٢١٠ موظفين", tag: "جديد", tone: "accent" },
  ],
  queue: [
    { title: "كريم فؤاد", sub: "كافيه الناصية · ٣ موظفين", tag: "قُرئ", tone: "neutral" },
    { title: "عمر حسن", sub: "عيادات الدلتا · ٨ موظفين", tag: "قُرئ", tone: "neutral" },
    { title: "Ada Lovelace", sub: "analytical.io · ١٢٠ موظفًا", tag: "في الطابور", tone: "neutral", later: { tag: "ينتظر منذ يومين", tone: "warn" } },
    { title: "سلمى عادل", sub: "نايل تك · ٦٥ موظفًا", tag: "في الطابور", tone: "neutral", later: { tag: "ينتظر منذ ٣ أيام", tone: "warn" } },
    { title: "يوسف علي", sub: "الجيزة للخدمات اللوجستية · ٢١٠ موظفين", tag: "في الطابور", tone: "neutral", later: { tag: "فقدنا اهتمامه", tone: "bad", faded: true } },
  ],
  sorted: [
    { title: "Ada Lovelace", sub: "analytical.io · ١٢٠ موظفًا", tag: "ساخن", tone: "good" },
    { title: "عمر حسن", sub: "عيادات الدلتا · ٨ موظفين", tag: "للمتابعة", tone: "neutral" },
    { title: "يوسف علي", sub: "الجيزة للخدمات اللوجستية · ٢١٠ موظفين", tag: "ساخن", tone: "good" },
    { title: "كريم فؤاد", sub: "كافيه الناصية · ٣ موظفين", tag: "للمتابعة", tone: "neutral" },
    { title: "سلمى عادل", sub: "نايل تك · ٦٥ موظفًا", tag: "ساخن", tone: "good" },
  ],
  groups: ["عميل ساخن · اتصل اليوم", "للمتابعة · لاحقًا"],
  hook: { eyebrow: "القاهرة · ٩:٠٤ صباحًا", line: "صندوق الوارد ممتلئ قبل أن تصل القهوة." },
  persona: {
    initial: "ن",
    name: "نور",
    role: "مديرة المبيعات في شركة أدوات مكتبية",
    place: "مدينة نصر، القاهرة",
    facts: ["فريق من ٩ أشخاص", "عملاء محتملون من نموذج الموقع طوال اليوم"],
  },
  pain: {
    eyebrow: "المشكلة",
    lines: ["كل عميل محتمل يُقرأ ويُفرز يدويًا.", "والحسابات الكبيرة تنتظر في الطابور نفسه.", "وبعضها يفقد اهتمامه قبل أن يتصل به أحد."],
  },
  turn: ["لذلك تكتب نور قاعدتها مرة واحدة.", "وFlowline ينفّذها مع كل عميل."],
  ch: [
    { chapter: "١ · ابدأ من قالب", caption: "تبدأ من قالب «تأهيل العملاء المحتملين». يعمل على بيانات تجريبية، فلا يُمَسّ شيء حقيقي." },
    { chapter: "٢ · أضف قاعدتها", caption: "تضيف خطوة وتربطها وتضبط شرطها: قاعدتها هي، مكتوبة مرة واحدة." },
    { chapter: "٣ · شغّل", caption: "تضغط «تشغيل» فيمر العميل بكل خطوة، وتصل شركة Ada ذات الـ١٢٠ موظفًا إلى «عميل ساخن»." },
    { chapter: "٤ · اعرف السبب", caption: "افتح أي خطوة لترى ما دخلها وما خرج منها. وكل تشغيل محفوظ في «السجل»." },
    { chapter: "٥ · شارك الفريق", caption: "تشارك نسخة مع مساحة عمل فريق العمليات. تُزال الاتصالات، ولا تنتقل بيانات الاعتماد أبدًا." },
  ],
  monday: { eyebrow: "الاثنين التالي · ٩:٠٤ صباحًا", line: "العملاء الساخنون أولًا." },
  outcome: {
    title: "ما الذي تغيّر عند نور",
    points: ["كل عميل يُفحص بالطريقة نفسها", "الحسابات الكبيرة تصل إلى أعلى القائمة", "لكل قرار سجل تستطيع فتحه"],
  },
  cta: {
    tagline: "وصّل خطوات بسيطة، وتابع ما حدث في كل خطوة.",
    badge: "✦ نسخة تجريبية · مجانية خلال الفترة التجريبية",
    action: "ابدأ البناء مجانًا",
    note: "بالعربية أولًا · والإنجليزية أيضًا",
  },
  handoff: {
    eyebrow: "التالي: Flowline × ميزانو",
    lines: ["شركة Ada توافق على العرض.", "والصفقة تنتقل إلى الحسابات."],
    won: { title: "Ada Lovelace", sub: "analytical.io · صفقة مكتملة", tag: "تمت", tone: "good" },
    next: { title: "analytical.io", sub: "عميل جديد · عرض سعر للتجهيز", tag: "مسودة", tone: "accent" },
    badge: "رؤية · الربط بين Flowline وميزانو لم يُبنَ بعد",
    caption: "عرض السعر والفاتورة وضريبة القيمة المضافة مهمة ميزانو. الشركة نفسها، والفصل التالي.",
  },
  short: {
    hook: "ما زلت تفرز كل عميل يدويًا؟",
    turn: "اكتب القاعدة مرة واحدة.",
    run: "اضغط «تشغيل»: كل عميل يمر بالخطوات نفسها.",
    inspect: "افتح أي خطوة لترى لماذا ذهب حيث ذهب.",
  },
};

const COPY: Record<Locale, Copy> = { en, ar };

function full(locale: Locale): Scene[] {
  const c = COPY[locale];
  const wt = `walkthrough.${locale}.mp4`;
  return [
    { kind: "kinetic", id: "hook", durationS: 4.5, eyebrow: c.hook.eyebrow, lines: [c.hook.line], cards: c.leads, cardMode: "pile" },
    { kind: "persona", id: "persona", durationS: 5.5, ...c.persona },
    { kind: "kinetic", id: "pain", durationS: 9, eyebrow: c.pain.eyebrow, lines: c.pain.lines, accentLine: 2, cards: c.queue, cardMode: "queue" },
    { kind: "kinetic", id: "turn", durationS: 4, lines: c.turn, accentLine: 1 },
    { kind: "footage", id: "template", durationS: 9, src: wt, media: "video", fromS: 2.4, toS: 11.4, ...c.ch[0]!, to: { x: 0.5, y: 0.45, zoom: 1.05 } },
    { kind: "footage", id: "rule", durationS: 11.4, src: wt, media: "video", fromS: 13.6, toS: 25.0, ...c.ch[1]!, to: { x: 0.5, y: 0.5, zoom: 1.04 } },
    { kind: "footage", id: "run", durationS: 11.3, src: wt, media: "video", fromS: 26.7, toS: 38.0, ...c.ch[2]!, to: { x: 0.5, y: 0.6, zoom: 1.06 } },
    { kind: "footage", id: "inspect", durationS: 8, src: wt, media: "video", fromS: 39.6, toS: 47.6, ...c.ch[3]!, to: { x: 0.5, y: 0.5, zoom: 1.04 } },
    { kind: "footage", id: "share", durationS: 3.6, src: wt, media: "video", fromS: 47.5, toS: 50.4, ...c.ch[4]!, to: { x: 0.3, y: 0.5, zoom: 1.08 } },
    { kind: "kinetic", id: "monday", durationS: 6, eyebrow: c.monday.eyebrow, lines: [c.monday.line], accentLine: 0, cards: c.sorted, cardMode: "sorted", groups: c.groups },
    { kind: "outcome", id: "outcome", durationS: 6, ...c.outcome },
    { kind: "cta", id: "cta", durationS: 5, wordmark: "Flowline", ...c.cta },
    {
      kind: "handoff",
      id: "handoff",
      durationS: 5.5,
      eyebrow: c.handoff.eyebrow,
      lines: c.handoff.lines,
      from: { product: "Flowline", color: "#7c6cff", card: c.handoff.won },
      to: { product: locale === "ar" ? "ميزانو" : "Mizano", color: "#0D9488", card: c.handoff.next },
      badge: c.handoff.badge,
      caption: c.handoff.caption,
    },
  ];
}

function short(locale: Locale): Scene[] {
  const c = COPY[locale];
  const wt = `walkthrough.${locale}.mp4`;
  return [
    { kind: "kinetic", id: "hook", durationS: 3.2, lines: [c.short.hook], cards: c.queue, cardMode: "queue" },
    { kind: "kinetic", id: "turn", durationS: 2, lines: [c.short.turn], accentLine: 0 },
    { kind: "footage", id: "run", durationS: 6.5, src: wt, media: "video", fromS: 26.9, toS: 33.4, chapter: c.ch[2]!.chapter, caption: c.short.run, to: { x: 0.5, y: 0.6, zoom: 1.06 } },
    { kind: "footage", id: "inspect", durationS: 3.5, src: wt, media: "video", fromS: 40.4, toS: 43.9, chapter: c.ch[3]!.chapter, caption: c.short.inspect, to: { x: 0.6, y: 0.5, zoom: 1.06 } },
    { kind: "cta", id: "cta", durationS: 3.5, wordmark: "Flowline", ...c.cta, note: undefined },
  ];
}

const base = { fps: 30, width: 1920, height: 1080 } as const;

export const stories: Story[] = (["en", "ar"] as const).flatMap((locale) => [
  { id: "story", locale, ...base, scenes: full(locale) },
  { id: "short", locale, ...base, scenes: short(locale) },
]);
