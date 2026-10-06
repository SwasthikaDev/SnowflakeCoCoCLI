// Builds MuleTrace_MVP_Brief.pptx — run: node build_deck.js
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("./apply_theme.js");

const OUT = "MuleTrace_MVP_Brief.pptx";
const REPO_URL = "github.com/SwasthikaDev/SnowflakeCoCoCLI";
const LIVE_URL = process.env.LIVE_URL ?? "muletrace.pages.dev";

const THEME = {
  name: "MuleTrace",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "111827", lt1: "FFFFFF", dk2: "0E1A2B", lt2: "EEF2F6",
    accent1: "E4572E", // alert red-orange: collectors, fan-out/fan-in
    accent2: "1B998B", // teal: resolution, round-trip
    accent3: "E8A33D", // amber: structuring
    accent4: "7B61FF", // violet: layering
    accent5: "29B5E8", // snowflake ice
    accent6: "64748B", // slate: muted text
    hlink: "29B5E8", folHlink: "7B61FF",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "MuleTrace — Prototype / MVP Brief";
pres.subject = "Snowflake CoCo Hackathon 2026 – GCC Edition submission";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const S = pres.shapes;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "MT_CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.5, y: 0.3, w: 9, h: 0.26, fontSize: 11, bold: true, color: C.accent1, charSpacing: 1.5, margin: 0, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.58, w: 9, h: 0.55, fontSize: 24, bold: true, color: C.text1, margin: 0, valign: "middle", align: "left" }, text: "" } },
    { text: { text: "MuleTrace  ·  Prototype / MVP Brief  ·  Snowflake CoCo Hackathon 2026", options: { x: 0.5, y: 5.27, w: 7, h: 0.22, fontSize: 9, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.27, w: 0.5, h: 0.22, fontSize: 9, color: C.accent6, align: "right", margin: 0 },
});
pres.defineSlideMaster({
  title: "MT_DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.5, y: 0.9, w: 5.3, h: 0.3, fontSize: 11, bold: true, color: C.accent5, charSpacing: 1.5, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 1.3, w: 5.3, h: 1.0, fontSize: 48, bold: true, color: C.background1, margin: 0, valign: "middle", align: "left" }, text: "" } },
    { placeholder: { options: { name: "subtitle", type: "body", x: 0.5, y: 2.35, w: 5.3, h: 0.75, fontSize: 20, color: C.background2, margin: 0, valign: "top" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.5, y: 3.2, w: 5.0, h: 1.2, fontSize: 14, color: C.background2, margin: 0, valign: "top" }, text: "" } },
  ],
});

// ---------- helpers ----------
async function icon(Icon, hex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { color: "#" + hex, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

function content(kicker, title, section) {
  const s = pres.addSlide({ masterName: "MT_CONTENT", sectionTitle: section });
  s.addText(kicker, { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  return s;
}

function card(s, x, y, w, h, fill = C.background2, extra = {}) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill, ...(extra.transparency != null ? { transparency: extra.transparency } : {}) }, line: extra.line || { type: "none" }, objectName: extra.name });
}

function txt(s, text, o) {
  s.addText(text, { isTextBox: true, margin: 0, valign: "top", fontSize: 14, color: C.text1, ...o });
}

function node(s, cx, cy, r, fill, ring = C.background1) {
  s.addShape(S.OVAL, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: fill }, line: { color: ring, width: 1 } });
}

function arrow(s, x1, y1, x2, y2, o = {}) {
  const { color = C.accent6, width = 1.25, r1 = 0, r2 = 0, head = true, dash } = o;
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const ax = x1 + ux * r1, ay = y1 + uy * r1, bx = x2 - ux * r2, by = y2 - uy * r2;
  const line = { color, width };
  if (head) line.endArrowType = "triangle";
  if (dash) line.dashType = dash;
  s.addShape(S.LINE, {
    x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.max(Math.abs(bx - ax), 0.001), h: Math.max(Math.abs(by - ay), 0.001),
    flipH: bx < ax, flipV: by < ay, line,
  });
}

function screenshot(s, path, x, y, w, h) {
  s.addShape(S.ROUNDED_RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, rectRadius: 0.06, fill: { color: C.background1 },
    line: { color: "D5DCE5", width: 0.75 }, shadow: { type: "outer", color: "0E1A2B", opacity: 0.18, blur: 8, offset: 2, angle: 90 } });
  s.addImage({ path, x, y, w, h });
}

function numbered(s, n, x, y, col, title, desc, w) {
  s.addShape(S.OVAL, { x, y, w: 0.36, h: 0.36, fill: { color: col }, line: { type: "none" } });
  txt(s, String(n), { x, y, w: 0.36, h: 0.36, fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle" });
  txt(s, title, { x: x + 0.5, y: y - 0.02, w, h: 0.3, fontSize: 14, bold: true });
  txt(s, desc, { x: x + 0.5, y: y + 0.28, w, h: 0.6, fontSize: 12, color: C.accent6 });
}

function iconCircle(s, data, x, y, d, fill) {
  s.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" } });
  const p = d * 0.24;
  s.addImage({ data, x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
}

function pill(s, text, x, y, w, fill, color, transparency) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h: 0.28, rectRadius: 0.14, fill: { color: fill, ...(transparency != null ? { transparency } : {}) }, line: { type: "none" } });
  txt(s, text, { x, y, w, h: 0.28, fontSize: 10, bold: true, color, align: "center", valign: "middle" });
}

// hub-and-spoke motif used on the dark slides
function ringMotif(s, cx, cy, R, n, rHub, rNode) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    arrow(s, x, y, cx, cy, { color: C.accent6, width: 1, r1: rNode + 0.03, r2: rHub + 0.05 });
    node(s, x, y, rNode, C.accent3, C.text2);
  }
  node(s, cx, cy, rHub, C.accent1, C.text2);
}

(async () => {
  const I = {};
  const spec = {
    rupee: [fa.FaRupeeSign, HEX.lt1], users: [fa.FaUsers, HEX.lt1], net: [fa.FaProjectDiagram, HEX.lt1],
    gavel: [fa.FaGavel, HEX.lt1], spy: [fa.FaUserSecret, HEX.lt1], shield: [fa.FaUserShield, HEX.lt1],
    chart: [fa.FaChartLine, HEX.lt1], arrowR: [fa.FaArrowRight, HEX.accent6], db: [fa.FaDatabase, HEX.lt1],
    robot: [fa.FaRobot, HEX.lt1], lock: [fa.FaShieldAlt, HEX.lt1], plug: [fa.FaPuzzlePiece, HEX.lt1],
    check: [fa.FaCheckCircle, HEX.accent2], bolt: [fa.FaBolt, HEX.lt1], layers: [fa.FaLayerGroup, HEX.lt1],
    expand: [fa.FaExpandArrowsAlt, HEX.lt1], handshake: [fa.FaHandshake, HEX.lt1], brain: [fa.FaBrain, HEX.lt1],
    search: [fa.FaSearch, HEX.lt1], user: [fa.FaUserTie, HEX.accent6],
  };
  for (const [k, [Ic, col]] of Object.entries(spec)) I[k] = await icon(Ic, col);

  // ===== 1. Title =====
  pres.addSection({ title: "Introduction" });
  {
    const s = pres.addSlide({ masterName: "MT_DARK", sectionTitle: "Introduction" });
    s.addText("SNOWFLAKE COCO HACKATHON 2026  ·  GCC EDITION", { placeholder: "kicker" });
    s.addText("MuleTrace", { placeholder: "title" });
    s.addText("Risk, Fraud & Regulatory Intelligence Copilot", { placeholder: "subtitle" });
    s.addText("Finds mule-account networks in bank transactions, explains them with policy evidence, and drafts an audit-ready STR from a plain-English question.", { placeholder: "body" });
    txt(s, "Prototype / MVP Brief", { x: 0.5, y: 4.75, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.accent5 });
    txt(s, LIVE_URL ? `Live demo: ${LIVE_URL}  ·  ${REPO_URL}` : REPO_URL, { x: 0.5, y: 5.05, w: 5.5, h: 0.25, fontSize: 10, color: C.background2 });
    ringMotif(s, 7.85, 2.85, 1.45, 12, 0.32, 0.12);
    txt(s, "100 mules → 1 collector", { x: 6.85, y: 4.55, w: 2, h: 0.3, fontSize: 10, color: C.background2, align: "center" });
    s.addNotes("MuleTrace is a copilot for bank and NBFC fraud, AML and compliance teams. It turns raw transactions into mule-network findings, explains each one with evidence and policy clauses, and drafts the Suspicious Transaction Report. Everything runs on Snowflake and is built with CoCo CLI skills.");
  }

  // ===== 2. Problem =====
  pres.addSection({ title: "Problem Brief" });
  {
    const s = content("1 · PROBLEM BRIEF", "₹10 lakh, moved as 2,000 harmless ₹500 transfers", "Problem Brief");
    const rows = [
      [I.rupee, C.accent3, "Below every threshold", "Each ₹500 UPI transfer passes rule-based checks on its own."],
      [I.users, C.accent1, "Spread across 100 accounts", "Rented or hijacked mule accounts each look ordinary in isolation."],
      [I.net, C.accent2, "Visible only as a network", "The scheme appears only when you connect who paid whom, when and how much."],
    ];
    rows.forEach(([ic, col, h, d], i) => {
      const y = 1.45 + i * 1.22;
      iconCircle(s, ic, 0.5, y, 0.5, col);
      txt(s, h, { x: 1.2, y: y - 0.02, w: 3.6, h: 0.32, fontSize: 16, bold: true });
      txt(s, d, { x: 1.2, y: y + 0.32, w: 3.6, h: 0.7, fontSize: 14, color: C.accent6 });
    });
    // diagram
    card(s, 5.15, 1.35, 4.35, 3.75);
    txt(s, "100 mule accounts", { x: 5.35, y: 1.48, w: 1.8, h: 0.25, fontSize: 11, bold: true, color: C.accent6 });
    const hub = [8.55, 2.95];
    for (let i = 0; i < 7; i++) {
      const y = 1.95 + i * 0.33;
      arrow(s, 5.75, y, hub[0], hub[1], { color: C.accent6, width: 1, r1: 0.13, r2: 0.36 });
      node(s, 5.75, y, 0.11, C.accent3);
    }
    node(s, hub[0], hub[1], 0.32, C.accent1);
    txt(s, "1 collector", { x: 7.95, y: 3.33, w: 1.2, h: 0.25, fontSize: 11, bold: true, color: C.accent6, align: "center" });
    pill(s, "₹500 × 20 each", 7.9, 3.68, 1.3, C.background1, C.text1);
    txt(s, "100 × 20 × ₹500 = ₹10,00,000", { x: 5.35, y: 4.45, w: 3.95, h: 0.4, fontSize: 16, bold: true, align: "center" });
    s.addNotes("This is the case we started from. A fraudster moves ten lakh rupees as two thousand ₹500 transfers through a hundred mule accounts. No single transaction trips a rule. The pattern only shows up when you look at the network of accounts, which is what MuleTrace does.");
  }

  // ===== 3. Industry context =====
  {
    const s = content("1 · INDUSTRY CONTEXT", "Mule accounts are a national-scale banking risk", "Problem Brief");
    const stats = [
      ["19 lakh+", "mule accounts flagged across India", "MHA, February 2025", C.accent1],
      ["228 bn", "UPI transactions in 2025: the volume that monitoring has to cover", "NPCI data, 2025", C.accent5],
      ["7 days", "to file an STR with FIU-IND once suspicion is established", "PML Rules (working days)", C.accent2],
    ];
    stats.forEach(([n, l, src, col], i) => {
      const x = 0.5 + i * 3.075;
      card(s, x, 1.4, 2.85, 2.4);
      txt(s, n, { x: x + 0.25, y: 1.6, w: 2.4, h: 0.7, fontSize: 40, bold: true, color: col, fontFace: THEME.headFontFace });
      txt(s, l, { x: x + 0.25, y: 2.35, w: 2.4, h: 0.95, fontSize: 14 });
      txt(s, src, { x: x + 0.25, y: 3.38, w: 2.4, h: 0.25, fontSize: 10, color: C.accent6 });
    });
    iconCircle(s, I.gavel, 0.5, 4.12, 0.5, C.text2);
    txt(s, [
      { text: "Regulatory frame: ", options: { bold: true } },
      { text: "PMLA 2002, RBI KYC Master Direction and FIU-IND reporting. RBI's innovation hub has launched MuleHunter.AI, so the regulator already treats mule detection as a priority." },
    ], { x: 1.2, y: 4.05, w: 8.3, h: 0.75, fontSize: 14, valign: "middle" });
    s.addNotes("Banking and NBFC domain, India. Mule accounts are now tracked at national level, UPI volume makes manual review impossible, and PML Rules give a compliance officer seven working days to file an STR once suspicion is established. Sources: MHA statement Feb 2025; NPCI 2025 data; PML (Maintenance of Records) Rules.");
  }

  // ===== 4. Target users =====
  {
    const s = content("1 · TARGET USERS", "Built for the teams who investigate, decide and file", "Problem Brief");
    const ps = [
      [I.spy, C.accent1, "Fraud / AML investigator", "Triages alerts and traces money trails", "“Where did the money from this account go in the last 48 hours?”"],
      [I.shield, C.accent2, "Compliance officer", "Principal Officer who decides on and files STRs", "“Does this breach our structuring policy? Draft the STR.”"],
      [I.chart, C.accent4, "Risk & business heads", "Own fraud exposure and controls", "“How much money moved through mule-like accounts this month?”"],
    ];
    ps.forEach(([ic, col, name, role, q], i) => {
      const x = 0.5 + i * 3.1;
      card(s, x, 1.4, 2.8, 3.65);
      iconCircle(s, ic, x + 0.25, 1.62, 0.6, col);
      txt(s, name, { x: x + 0.25, y: 2.38, w: 2.35, h: 0.32, fontSize: 16, bold: true });
      txt(s, role, { x: x + 0.25, y: 2.72, w: 2.35, h: 0.55, fontSize: 13, color: C.accent6 });
      txt(s, "THEY ASK", { x: x + 0.25, y: 3.4, w: 2.35, h: 0.22, fontSize: 10, bold: true, color: col, charSpacing: 1 });
      txt(s, q, { x: x + 0.25, y: 3.65, w: 2.35, h: 1.2, fontSize: 14, italic: true });
    });
    s.addNotes("Three personas. Investigators need the money trail fast. Compliance officers need evidence and a defensible STR. Risk heads need aggregate exposure. All three ask questions in plain English instead of waiting on SQL.");
  }

  // ===== 5. Pain → improvement =====
  {
    const s = content("1 · PAIN POINT → IMPROVEMENT", "Today the pattern is found by hand, if at all", "Problem Brief");
    txt(s, "TODAY", { x: 0.5, y: 1.3, w: 4.15, h: 0.26, fontSize: 11, bold: true, color: C.accent6, charSpacing: 1 });
    txt(s, "WITH MULETRACE", { x: 5.25, y: 1.3, w: 4.25, h: 0.26, fontSize: 11, bold: true, color: C.accent2, charSpacing: 1 });
    const rows = [
      ["Rules score each transaction alone, so ₹500 transfers pass", "Graph analysis scores the whole account network"],
      ["Analysts trace hops across screens and spreadsheets for days", "Money trail drawn automatically as an interactive network"],
      ["Policies and circulars searched by hand in PDFs", "Every answer cites the policy clause and the source rows"],
      ["Every new question needs SQL from a data team", "Ask in plain English; answers respect role permissions"],
      ["STR narratives written from scratch", "STR draft pre-filled with evidence, ready for review"],
    ];
    rows.forEach(([a, b], i) => {
      const y = 1.66 + i * 0.7;
      card(s, 0.5, y, 4.15, 0.6);
      txt(s, a, { x: 0.68, y, w: 3.85, h: 0.6, fontSize: 14, color: C.accent6, valign: "middle" });
      s.addImage({ data: I.arrowR, x: 4.83, y: y + 0.18, w: 0.24, h: 0.24 });
      card(s, 5.25, y, 4.25, 0.6, C.accent2, { transparency: 86 });
      txt(s, b, { x: 5.43, y, w: 3.95, h: 0.6, fontSize: 14, valign: "middle" });
    });
    s.addNotes("Current pain versus improvement, row by row. The key shift is from transaction-level rules to network-level analysis, with evidence and the report produced in the same flow.");
  }

  // ===== 6. Solution: patterns =====
  pres.addSection({ title: "Solution & Architecture" });
  {
    const s = content("SOLUTION · THE PRODUCT", "One workspace, from alert to a filed STR", "Solution & Architecture");
    screenshot(s, "shots/crop_hero.png", 0.5, 1.38, 6.3, 3.54);
    numbered(s, 1, 7.1, 1.45, C.accent1, "Alert queue", "Every laundering network found, ranked by risk.", 1.9);
    numbered(s, 2, 7.1, 2.45, C.accent3, "Money trail", "Each network drawn automatically as a graph.", 1.9);
    numbered(s, 3, 7.1, 3.45, C.accent2, "Evidence → STR", "Explain, ask, decide and file from one panel.", 1.9);
    txt(s, LIVE_URL ? `Working app on synthetic data · ${LIVE_URL}` : "Working app on synthetic data", { x: 0.5, y: 4.98, w: 6.3, h: 0.22, fontSize: 10, italic: true, color: C.accent6 });
    s.addNotes("This is the working product, not a mock-up. The alert queue on the left lists every network the detector found, ranked by risk. The centre draws each network: here all six at once. The right panel holds the evidence, the copilot, the STR draft and the audit log.");
  }

  {
    const s = content("SOLUTION", "Four laundering typologies, detected as graph patterns", "Solution & Architecture");
    const cards = [
      ["Structuring", C.accent3, "Smurfing: many accounts send repeated small amounts to one collector.", "≥10 senders · ≥5 same-amount transfers each"],
      ["Fan-out → fan-in", C.accent1, "Funds split across mules just under limits, then regrouped within hours.", "≥8 mules forward ≥70% within 72 h"],
      ["Layering chain", C.accent4, "A large sum hops through 4+ accounts fast, keeping most of its value.", "Each hop ≤24 h later, keeps ≥85%"],
      ["Round-trip cycle", C.accent2, "Money returns to where it started, faking turnover or hiding its origin.", "Loop closes within 7 days, ≥80% kept"],
    ];
    cards.forEach(([t, col, d, rule], i) => {
      const x = 0.5 + i * 2.32, w = 2.05, cx = x + w / 2;
      card(s, x, 1.4, w, 3.65);
      const a = { color: C.accent6, width: 1 };
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const y = 1.68 + k * 0.29; arrow(s, x + 0.42, y, x + 1.5, 2.26, { ...a, r1: 0.1, r2: 0.2 }); node(s, x + 0.42, y, 0.08, col); }
        node(s, x + 1.5, 2.26, 0.17, col);
      } else if (i === 1) {
        const src = [x + 0.32, 2.26], dst = [x + 1.73, 2.26];
        for (let k = 0; k < 4; k++) { const y = 1.74 + k * 0.35; arrow(s, src[0], src[1], cx, y, { ...a, r1: 0.16, r2: 0.1 }); arrow(s, cx, y, dst[0], dst[1], { ...a, r1: 0.1, r2: 0.16 }); node(s, cx, y, 0.08, col); }
        node(s, src[0], src[1], 0.14, col); node(s, dst[0], dst[1], 0.14, col);
      } else if (i === 2) {
        const pts = [0, 1, 2, 3, 4].map(k => [x + 0.26 + k * 0.38, k % 2 ? 2.5 : 2.02]);
        pts.slice(1).forEach((p, k) => arrow(s, pts[k][0], pts[k][1], p[0], p[1], { ...a, r1: 0.12, r2: 0.12 }));
        pts.forEach(p => node(s, p[0], p[1], 0.1, col));
      } else {
        const R = 0.48, pts = [0, 1, 2, 3].map(k => { const ang = -Math.PI / 2 + k * Math.PI / 2; return [cx + R * Math.cos(ang), 2.26 + R * Math.sin(ang)]; });
        pts.forEach((p, k) => { const q = pts[(k + 1) % 4]; arrow(s, p[0], p[1], q[0], q[1], { ...a, r1: 0.13, r2: 0.13 }); });
        pts.forEach(p => node(s, p[0], p[1], 0.1, col));
      }
      txt(s, t, { x: x + 0.18, y: 3.0, w: w - 0.36, h: 0.32, fontSize: 14, bold: true });
      txt(s, d, { x: x + 0.18, y: 3.35, w: w - 0.36, h: 0.95, fontSize: 12, color: C.accent6 });
      s.addShape(S.ROUNDED_RECTANGLE, { x: x + 0.14, y: 4.38, w: w - 0.28, h: 0.52, rectRadius: 0.06, fill: { color: col, transparency: 82 }, line: { type: "none" } });
      txt(s, rule, { x: x + 0.22, y: 4.38, w: w - 0.44, h: 0.52, fontSize: 10, bold: true, valign: "middle" });
    });
    s.addNotes("The detector looks for four typologies as time-ordered graph patterns, not single-transaction rules. The thresholds on each card are the defaults and can be configured per bank policy. Every alert keeps the exact transactions that triggered it.");
  }

  // ===== Product: evidence =====
  {
    const s = content("SOLUTION · SIGNAL → EVIDENCE", "Every alert comes with evidence and a policy clause", "Solution & Architecture");
    screenshot(s, "shots/crop_evidence.png", 0.5, 1.38, 5.54, 3.6);
    numbered(s, 1, 6.35, 1.42, C.accent3, "Explainable score", "Four visible parts add up to 98/100. No black box.", 2.65);
    numbered(s, 2, 6.35, 2.32, C.accent1, "KYC red flags", "New account, minimum KYC, inflow 63× declared income.", 2.65);
    numbered(s, 3, 6.35, 3.22, C.accent4, "Policy attached", "AML-04 §3.2 quoted beside the alert, with its source document.", 2.65);
    numbered(s, 4, 6.35, 4.12, C.accent2, "Decision logged", "Escalate, request info or close; every action is audited.", 2.65);
    s.addNotes("Finding F001: one hundred accounts sent two thousand ₹500 transfers to one collector. The score breaks down into four parts anyone can check. Every account shows its KYC red flags, and the exact policy clause it breaches is attached. The investigator's decision goes into the audit log.");
  }

  // ===== Product: copilot =====
  {
    const s = content("SOLUTION · COPILOT", "Ask in plain English, get an answer you can defend", "Solution & Architecture");
    txt(s, "Questions run against the transaction graph and the policy text. Every answer cites its findings, accounts and clauses.", { x: 0.5, y: 1.35, w: 5.4, h: 0.55, fontSize: 14 });
    const qa = [
      ["\u201CWhich accounts received over ₹5 lakh in sub-₹1,000 transfers?\u201D", "Finds AC79448796 and quotes AML-04 §3.2"],
      ["\u201CWhere did the money from AC11913291 go within 48 hours?\u201D", "Traces ₹2.93 L through 30 mules to one collector"],
      ["\u201CWhat is our STR filing deadline?\u201D", "Quotes REG-IN §2: 7 working days"],
      ["\u201CWho are the 10 riskiest accounts?\u201D", "Ranked list with roles and red flags"],
    ];
    qa.forEach(([q, a], i) => {
      const y = 2.02 + i * 0.7;
      card(s, 0.5, y, 5.4, 0.6);
      txt(s, q, { x: 0.65, y: y + 0.05, w: 5.15, h: 0.27, fontSize: 12, italic: true, bold: true });
      txt(s, "→ " + a, { x: 0.65, y: y + 0.31, w: 5.15, h: 0.25, fontSize: 11, color: C.accent6 });
    });
    txt(s, "Connected: Snowflake Cortex Agent (Cortex Analyst + Cortex Search). Offline: an in-browser evidence engine keeps the demo working.", { x: 0.5, y: 4.85, w: 5.4, h: 0.4, fontSize: 10, italic: true, color: C.accent6 });
    screenshot(s, "shots/crop_copilot.png", 6.25, 1.38, 3.22, 3.7);
    s.addNotes("The copilot answers business questions in plain English. Numbers come from the transaction graph, rules come from the policy text, and every answer lists its sources. In Snowflake it runs as a Cortex Agent over a semantic view and a Cortex Search service.");
  }

  // ===== Product: STR =====
  {
    const s = content("SOLUTION · FINDING → REPORT", "One click from finding to a filing-ready STR", "Solution & Architecture");
    const items = [
      "Subjects, roles, KYC data and red flags pre-filled",
      "Grounds of suspicion written from the evidence",
      "Policy and regulatory basis cited",
      "FIU-IND deadline computed: 7 working days",
      "Names masked unless you are the Principal Officer",
      "Only the Principal Officer can mark it filed",
      "Export as Markdown, CSV annex or PDF",
    ];
    items.forEach((t, i) => {
      const y = 1.45 + i * 0.5;
      s.addImage({ data: I.check, x: 0.5, y: y + 0.03, w: 0.28, h: 0.28 });
      txt(s, t, { x: 0.95, y, w: 5.0, h: 0.34, fontSize: 14, valign: "middle" });
    });
    screenshot(s, "shots/crop_str.png", 6.45, 1.38, 3.05, 3.7);
    s.addNotes("Drafting the Suspicious Transaction Report is usually hours of manual work. MuleTrace pre-fills it from the evidence, cites the policy basis and computes the filing deadline. Governance is built in: names are masked for investigators, and only the Principal Officer can file.");
  }

  // ===== 7. Architecture =====
  {
    const s = content("2 · ARCHITECTURE", "Everything runs inside Snowflake's governed boundary", "Solution & Architecture");
    const X = [0.5, 2.32, 4.14, 5.96, 7.78], W = 1.55;
    ["1  Sources", "2  Ingest", "3  Prepare & detect", "4  Reason", "5  Act"].forEach((h, i) =>
      txt(s, h, { x: X[i], y: 1.27, w: W, h: 0.26, fontSize: 11, bold: true, color: C.accent6 }));
    s.addShape(S.ROUNDED_RECTANGLE, { x: 2.2, y: 1.6, w: 7.3, h: 3.07, rectRadius: 0.06, fill: { type: "none" }, line: { color: C.accent5, width: 1.25, dashType: "dash" } });
    const L1 = 1.72, L2 = 2.9, LH = 1.05;
    const box = (x, y, h, head, body, fill, tr, headColor = C.text1, bodyColor = C.text1) => {
      card(s, x, y, W, h, fill, { transparency: tr });
      txt(s, [
        { text: head, options: { bold: true, fontSize: 10, color: headColor, breakLine: true } },
        { text: body, options: { fontSize: 10, color: bodyColor } },
      ], { x: x + 0.08, y: y + 0.06, w: W - 0.16, h: h - 0.12 });
    };
    box(X[0], L1, LH, "STRUCTURED", "Core banking & UPI transactions; accounts & KYC", C.accent5, 82);
    box(X[0], L2, LH, "UNSTRUCTURED", "AML policy, RBI circulars, FIU-IND STR formats, case notes (PDF)", C.accent4, 84);
    box(X[1], L1, LH, "Openflow", "Connectors land RAW.TRANSACTIONS and RAW.ACCOUNTS", C.accent5, 82);
    box(X[1], L2, LH, "Stage + AI_PARSE_DOCUMENT", "PDFs parsed into POLICY_CHUNKS", C.accent4, 84);
    box(X[2], L1, LH, "Dynamic Tables + Snowpark", "Flow features, then graph detector writes ALERTS + risk scores", C.accent5, 82);
    box(X[2], L2, LH, "Cortex Search", "Search service over POLICY_CHUNKS", C.accent4, 84);
    box(X[3], L1, L2 + LH - L1, "Cortex Agent", "• Cortex Analyst on a semantic view (SQL over txns & alerts)\n• Cortex Search for policy evidence\n• AI_COMPLETE to explain and draft STRs", C.text2, 0, C.accent5, C.background1);
    box(X[4], L1, L2 + LH - L1, "MuleTrace app", "Svelte + FastAPI on SPCS\n• Alert queue\n• Network graph\n• Chat copilot\n• STR draft export", C.accent2, 84);
    const ac = { color: C.accent6, width: 1.25 };
    [L1 + LH / 2, L2 + LH / 2].forEach(y => { for (let i = 0; i < 3; i++) arrow(s, X[i] + W + 0.02, y, X[i + 1] - 0.02, y, ac); });
    arrow(s, X[3] + W + 0.02, (L1 + L2 + LH) / 2, X[4] - 0.02, (L1 + L2 + LH) / 2, ac);
    card(s, 2.32, 4.1, 7.01, 0.45, C.background2);
    txt(s, [
      { text: "Governance on every layer: ", options: { bold: true } },
      { text: "masking & row-access policies on PII · lineage · ACCESS_HISTORY audit trail" },
    ], { x: 2.45, y: 4.1, w: 6.8, h: 0.45, fontSize: 11, valign: "middle" });
    txt(s, "Dashed line = Snowflake account boundary. Blue = structured data path, violet = unstructured.", { x: 0.5, y: 4.78, w: 9, h: 0.25, fontSize: 10, color: C.accent6 });
    s.addNotes("Data flow, left to right. Structured transactions and accounts land through Openflow; unstructured policy and filing PDFs are parsed with AI_PARSE_DOCUMENT and indexed in Cortex Search. Dynamic Tables keep flow features fresh; a Snowpark graph detector writes alerts. A Cortex Agent combines Cortex Analyst over a semantic view with Cortex Search, so answers carry both numbers and policy citations. The investigator app runs on Snowpark Container Services, so data never leaves Snowflake.");
  }

  // ===== 8. CoCo skills =====
  {
    const s = content("2 · COCO CLI SKILLS", "12 CoCo CLI skills, each building one module", "Solution & Architecture");
    const groups = [
      [I.db, C.accent5, "Ingest & model", [["openflow", "Core-banking feeds into RAW tables"], ["dynamic-tables", "Incremental flow features"], ["snowflake-tasks", "Scheduled detection runs"]]],
      [I.net, C.accent1, "Detect & explain", [["snowpark-python", "Graph detector as a stored procedure"], ["ai-functions-pipeline-builder", "AI_COMPLETE alert explanations"], ["document-intelligence", "Parse policy & circular PDFs"]]],
      [I.robot, C.accent4, "Ask & answer", [["search-optimization", "Cortex Search over policy text"], ["agent-studio", "Cortex Agent + semantic view"], ["skill-development", "Custom /investigate skill for analysts"]]],
      [I.lock, C.accent2, "Govern & deliver", [["data-governance", "Mask PII, row-level access"], ["lineage", "Evidence trail for auditors"], ["deploy-to-spcs", "Ship the Svelte investigator app"]]],
    ];
    groups.forEach(([ic, col, h, items], i) => {
      const x = 0.5 + i * 2.32, w = 2.05;
      card(s, x, 1.4, w, 3.65);
      iconCircle(s, ic, x + 0.18, 1.57, 0.46, col);
      txt(s, h, { x: x + 0.74, y: 1.57, w: w - 0.85, h: 0.46, fontSize: 14, bold: true, valign: "middle" });
      items.forEach(([name, role], k) => {
        const y = 2.25 + k * 0.92;
        txt(s, name, { x: x + 0.18, y: y - 0.12, w: w - 0.3, h: 0.4, fontSize: 11, bold: true, fontFace: "Courier New", color: C.text1, valign: "bottom" });
        txt(s, role, { x: x + 0.18, y: y + 0.3, w: w - 0.3, h: 0.5, fontSize: 12, color: C.accent6 });
      });
    });
    s.addNotes("Each CoCo CLI bundled skill builds one module. They connect through Snowflake tables: Openflow and dynamic tables feed the detector; document-intelligence and search-optimization feed the agent; agent-studio wires both into one Cortex Agent; governance, lineage and SPCS deployment wrap the whole system. We also package the analyst workflow as a custom skill so it is reusable.");
  }

  // ===== 9. Modular flow =====
  {
    const s = content("2 · HOW MODULES PLUG TOGETHER", "Signal → evidence → finding → report", "Solution & Architecture");
    const steps = [
      ["Signal", "Graph detector", "ALERTS", "Pattern, accounts, amount (₹), risk score"],
      ["Evidence", "Evidence builder", "EVIDENCE_PACKS", "Subgraph, source transactions, matching policy clauses"],
      ["Finding", "Analyst + agent", "CASES", "Decision, rationale, reviewer, timestamp"],
      ["Report", "STR drafter", "STR_DRAFTS", "FIU-IND fields pre-filled, narrative, attachments"],
    ];
    const cols = [C.accent3, C.accent4, C.accent1, C.accent2];
    steps.forEach(([name, mod, table, desc], i) => {
      const x = 0.5 + i * 2.32, w = 2.05;
      card(s, x, 1.4, w, 2.75);
      s.addShape(S.OVAL, { x: x + 0.18, y: 1.58, w: 0.5, h: 0.5, fill: { color: cols[i] }, line: { type: "none" } });
      txt(s, String(i + 1), { x: x + 0.18, y: 1.58, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
      txt(s, name, { x: x + 0.8, y: 1.58, w: w - 0.9, h: 0.5, fontSize: 18, bold: true, valign: "middle" });
      txt(s, mod, { x: x + 0.18, y: 2.25, w: w - 0.3, h: 0.28, fontSize: 12, color: C.accent6 });
      txt(s, table, { x: x + 0.18, y: 2.55, w: w - 0.3, h: 0.28, fontSize: 12, bold: true, fontFace: "Courier New" });
      txt(s, desc, { x: x + 0.18, y: 2.95, w: w - 0.3, h: 1.1, fontSize: 13 });
      if (i < 3) arrow(s, x + w + 0.03, 2.77, x + 2.32 - 0.03, 2.77, { color: C.accent6, width: 1.5 });
    });
    iconCircle(s, I.plug, 0.5, 4.42, 0.5, C.text2);
    txt(s, "Modules talk only through governed tables. A new typology, another UI or a different detector plugs in without touching the rest, and every step is in Snowflake lineage.", { x: 1.2, y: 4.35, w: 8.3, h: 0.65, fontSize: 14, valign: "middle" });
    s.addNotes("This is the end-to-end flow the problem statement asks for: signal to evidence to a documented finding or report. Each step is a separate module whose output is a table, which makes the system modular and auditable.");
  }

  // ===== 11. Impact: outcomes =====
  pres.addSection({ title: "Impact" });
  {
    const s = content("3 · RESULTS ON THE DEMO DATA", "Every planted scheme caught, no false alarms", "Impact");
    const stats = [
      ["4 / 4", "schemes caught", "structuring, fan-out → fan-in, layering, round-trip", C.accent1],
      ["100%", "precision", "2,092 of 2,092 flagged transactions were fraud", C.accent2],
      ["99.95%", "recall", "2,092 of 2,093 planted fraud transactions found", C.accent5],
      ["0", "look-alikes flagged", "society dues, subscriptions and family transfers left alone", C.accent4],
      ["₹30.07 L", "laundered value surfaced", "6 networks, 154 accounts", C.accent3],
      ["0.1 s", "detection time", "10,259 transactions on a laptop", C.text2],
    ];
    stats.forEach(([n, l, d, col], i) => {
      const x = 0.5 + (i % 3) * 3.075, y = 1.38 + Math.floor(i / 3) * 1.78;
      card(s, x, y, 2.85, 1.62);
      txt(s, n, { x: x + 0.22, y: y + 0.14, w: 2.45, h: 0.6, fontSize: 32, bold: true, color: col, fontFace: THEME.headFontFace, valign: "middle" });
      txt(s, l, { x: x + 0.22, y: y + 0.78, w: 2.45, h: 0.28, fontSize: 14, bold: true });
      txt(s, d, { x: x + 0.22, y: y + 1.06, w: 2.45, h: 0.48, fontSize: 11, color: C.accent6 });
    });
    txt(s, "A synthetic month of banking data with hidden ground-truth labels the detector never sees. Reproduce with: python backend/pipeline.py", { x: 0.5, y: 4.98, w: 9, h: 0.22, fontSize: 10, italic: true, color: C.accent6 });
    s.addNotes("These are measured, not projected. The synthetic data hides four laundering schemes among ten thousand normal transactions, plus legitimate look-alikes designed to trigger naive rules. The detector caught every scheme and flagged nothing legitimate. Anyone can reproduce this with one command.");
  }

  {
    const s = content("3 · IMPACT STATEMENT", "From days of manual tracing to minutes", "Impact");
    const st = [
      ["Days → < 5 min", "From alert to a full evidence pack for a ring of 100 accounts", "TARGET", C.accent1],
      ["< 1 min", "To a first STR draft, so analysts review instead of write", "TARGET", C.accent4],
      ["100%", "Of answers cite source transactions and a policy clause", "DESIGN GOAL", C.accent2],
      ["100% / 99.95%", "Precision / recall against ground-truth labels planted in the synthetic data", "MEASURED IN DEMO", C.accent5],
    ];
    st.forEach(([n, l, tag, col], i) => {
      const x = i % 2 ? 5.1 : 0.5, y = i < 2 ? 1.38 : 3.18;
      card(s, x, y, 4.4, 1.62);
      pill(s, tag, x + 0.25, y + 0.17, 1.6, col, C.text1, 80);
      txt(s, n, { x: x + 0.25, y: y + 0.5, w: 3.9, h: 0.5, fontSize: 28, bold: true, color: col, fontFace: THEME.headFontFace, valign: "middle" });
      txt(s, l, { x: x + 0.25, y: y + 1.04, w: 3.9, h: 0.5, fontSize: 14 });
    });
    txt(s, "Targets are goals for the prototype, to be validated against a bank's own baselines in a pilot.", { x: 0.5, y: 4.9, w: 9, h: 0.25, fontSize: 10, italic: true, color: C.accent6 });
    s.addNotes("Measurable outcomes. Time from alert to evidence and time to an STR draft are the two biggest manual costs today. Explainability is a design rule: no answer without a citation. Accuracy is measured in the demo because the synthetic data carries ground-truth labels. Targets are goals, not claims, until validated in a pilot.");
  }

  // ===== 12. Scalability & beyond =====
  {
    const s = content("3 · SCALABILITY & BEYOND THE DEMO", "Built for UPI-scale volume, and for more than fraud", "Impact");
    const cols = [
      ["Scales with Snowflake", [
        [I.bolt, C.accent5, "Elastic compute", "Warehouses scale up for month-end scans and down when idle."],
        [I.layers, C.accent5, "Incremental by design", "Dynamic Tables process only new transactions."],
        [I.expand, C.accent5, "Bounded graph search", "Time-windowed and partitioned by bank, branch or day."],
      ]],
      ["Extends beyond the demo", [
        [I.search, C.accent4, "More typologies", "Dormant-account revival, rapid KYC changes, cash-in to UPI-out."],
        [I.handshake, C.accent4, "Cross-bank intelligence", "Share mule signals via Data Clean Rooms without sharing PII."],
        [I.brain, C.accent4, "Wider risk copilot", "Same agent for credit, liquidity and Basel reporting questions."],
      ]],
    ];
    cols.forEach(([h, rows], c) => {
      const x = c ? 5.1 : 0.5;
      card(s, x, 1.38, 4.4, 3.7);
      txt(s, h, { x: x + 0.25, y: 1.52, w: 3.9, h: 0.35, fontSize: 16, bold: true });
      rows.forEach(([ic, col, t, d], k) => {
        const y = 2.02 + k * 1.0;
        iconCircle(s, ic, x + 0.25, y, 0.44, col);
        txt(s, t, { x: x + 0.85, y: y - 0.04, w: 3.35, h: 0.3, fontSize: 14, bold: true });
        txt(s, d, { x: x + 0.85, y: y + 0.27, w: 3.35, h: 0.6, fontSize: 13, color: C.accent6 });
      });
    });
    s.addNotes("Scalability comes from Snowflake: elastic warehouses, incremental dynamic tables, and graph search bounded by time window and partition. Beyond the demo, the same pipeline takes new typologies as plug-in rules, shares mule signals across banks through clean rooms, and the agent can answer credit, liquidity and Basel questions because it is a general risk copilot over governed data.");
  }

  // ===== Judging focus =====
  {
    const s = content("WHY MULETRACE", "How MuleTrace meets the judging focus", "Impact");
    const cols = [
      [I.gavel, C.accent1, "Real-world relevance", [
        "Built for Indian banking reality: UPI-scale mule networks, PMLA, FIU-IND STRs",
        "Follows how AML teams actually work: alert, evidence, decision, report",
        "Respects PII masking, tipping-off and record-keeping rules",
      ]],
      [I.bolt, C.accent5, "Technical execution", [
        "Time-ordered graph detection: 100% precision, 99.95% recall",
        "The same detector runs locally and as a Snowpark procedure",
        "Cortex Agent, Cortex Search, semantic view, Dynamic Tables, AI_COMPLETE",
      ]],
      [I.layers, C.accent2, "Solution completeness", [
        "Covers the full flow: signal, evidence, documented finding, report",
        "Joins transactions and KYC data with policy and filing text",
        "Working app, open code, reproducible data and audit trail",
      ]],
    ];
    cols.forEach(([ic, col, h, pts], i) => {
      const x = 0.5 + i * 3.075;
      card(s, x, 1.38, 2.85, 3.7);
      iconCircle(s, ic, x + 0.22, 1.55, 0.5, col);
      txt(s, h, { x: x + 0.85, y: 1.55, w: 1.9, h: 0.5, fontSize: 15, bold: true, valign: "middle" });
      pts.forEach((t, k) => {
        const y = 2.25 + k * 0.92;
        s.addShape(S.OVAL, { x: x + 0.24, y: y + 0.08, w: 0.1, h: 0.1, fill: { color: col }, line: { type: "none" } });
        txt(s, t, { x: x + 0.45, y, w: 2.25, h: 0.85, fontSize: 12 });
      });
    });
    s.addNotes("Mapped to the judging focus. Relevance: a real Indian banking problem with real regulatory constraints. Execution: measured accuracy and genuine Snowflake Cortex usage. Completeness: every step from signal to filed report, working end to end.");
  }

  // ===== 13. Closing =====
  pres.addSection({ title: "Close" });
  {
    const s = pres.addSlide({ masterName: "MT_DARK", sectionTitle: "Close" });
    s.addText("MVP DEMO SCOPE", { placeholder: "kicker" });
    s.addText("In the demo", { placeholder: "title" });
    const items = [
      "A month of synthetic banking data with 4 hidden schemes",
      "Graph detection and a risk score for every account",
      "Interactive network diagram for every case",
      "Plain-English Q&A with cited policy clauses",
      "One-click STR draft with evidence attached",
    ];
    items.forEach((t, i) => {
      const y = 2.45 + i * 0.42;
      s.addImage({ data: I.check, x: 0.5, y: y + 0.04, w: 0.26, h: 0.26 });
      txt(s, t, { x: 0.92, y, w: 4.9, h: 0.34, fontSize: 15, color: C.background1, valign: "middle" });
    });
    txt(s, [
      ...(LIVE_URL ? [{ text: "Live demo  ", options: { bold: true, color: C.accent5 } }, { text: LIVE_URL, options: { breakLine: true } }] : []),
      { text: "Code  ", options: { bold: true, color: C.accent5 } }, { text: REPO_URL },
    ], { x: 0.5, y: 4.62, w: 5.4, h: 0.55, fontSize: 12, color: C.background1 });
    ringMotif(s, 7.85, 2.85, 1.45, 12, 0.32, 0.12);
    txt(s, "MuleTrace: follow the money, file with confidence.", { x: 6.2, y: 4.55, w: 3.3, h: 0.5, fontSize: 12, italic: true, color: C.accent5, align: "center" });
    s.addNotes("Close on what judges will see in the demo: synthetic data with ground truth, detection, the network diagram, the copilot answering with citations, and the STR draft.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
})();
