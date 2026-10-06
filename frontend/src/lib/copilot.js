/**
 * MuleTrace copilot.
 *
 * answerLocal() is a deterministic, evidence-first engine: it parses the question, runs the
 * matching query over the transaction graph and findings, and returns an answer with citations
 * (findings, accounts, policy clauses). It always works, offline included.
 *
 * askCortex() sends the question plus that grounded evidence to /api/ask, a Cloudflare Pages
 * Function that calls Snowflake Cortex (Agent or AI_COMPLETE). If Snowflake isn't configured the
 * UI simply shows the local answer.
 */
import { PATTERN, ROLE_LABEL, inr, num, when } from "./format.js";

const KEY_CLAUSE = { structuring: "§3.2", fan_out_fan_in: "§4.1", layering: "§5.2", round_trip: "§6.2" };

export const SUGGESTIONS = [
  "What looks suspicious this month?",
  "Which accounts received over ₹5 lakh in sub-₹1,000 transfers?",
  "Explain F001 and the policy it breaches",
  "Where did the money from the fan-out source go within 48 hours?",
  "What is our STR filing deadline?",
  "Who are the 10 riskiest accounts?",
];

// ------------------------------------------------------------------ parsing helpers

const UNIT = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

function parseAmounts(q) {
  const re = /(₹|rs\.?\s?|inr\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|l|crores?|cr)?\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(q))) {
    const before = q.slice(Math.max(0, m.index - 2), m.index);
    if (/(AC|F)$/i.test(before)) continue; // account / finding ids
    const after = q.slice(re.lastIndex, re.lastIndex + 8).toLowerCase();
    if (/^\s*(h|hr|hour|day|d\b|hop|acc|min|week|top|risk)/.test(after)) continue;
    const hasCurrency = !!m[1], unit = m[3]?.toLowerCase();
    const raw = parseFloat(m[2].replace(/,/g, ""));
    if (!hasCurrency && !unit && raw < 1000) continue;
    const ctx = q.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    out.push({ value: raw * (unit ? UNIT[unit] : 1), ctx });
  }
  return out;
}

function parseHours(q) {
  const m = q.match(/(\d+)\s*(hours?|hrs?|h\b|days?)/i);
  if (!m) return null;
  return /day/i.test(m[2]) ? +m[1] * 24 : +m[1];
}

const STOP = new Set("the a an of to in on for and or is are was were be by with what which who how does do our we us it this that from as at any all can should when".split(" "));
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9§ ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

const SYNONYMS = {
  deadline: ["within", "working", "days"], due: ["within", "days"], when: ["within", "days"], file: ["filed", "furnished", "filing"],
  keep: ["retain", "retention", "retained", "years"], long: ["years", "retention"], store: ["retain", "retention"],
  records: ["record", "retention"], freeze: ["freezing", "freeze"], confidential: ["tipping", "disclose"], tell: ["tipping", "disclose"],
  customer: ["tipping", "customer"], cash: ["ctr", "cash"], kyc: ["kyc", "minimum"], mule: ["mule", "mules"], who: ["principal", "officer"],
};

export function searchPolicies(D, q, k = 2) {
  const qt = tokens(q).flatMap((w) => [w, ...(SYNONYMS[w] || [])]);
  const docs = D.policies.map((p) => ({ p, toks: tokens(`${p.heading} ${p.heading} ${p.heading} ${p.text}`) }));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.toks)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  return docs
    .map(({ p, toks }) => {
      let s = 0;
      for (const w of qt) {
        const tf = toks.filter((t) => t === w || (w.length > 4 && t.startsWith(w.slice(0, 5)))).length;
        if (tf) s += (tf / (tf + 1.2)) * Math.log(1 + N / (df.get(w) || 1));
      }
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.p);
}

function clause(D, f) {
  const p = D.policyById.get(f.policy_ref);
  if (!p) return null;
  const line = p.text.split("\n").find((l) => l.startsWith(KEY_CLAUSE[f.type])) || p.text.split("\n")[0];
  return { id: `${f.policy_ref.split(" ")[0]} ${KEY_CLAUSE[f.type]}`, chunk: p.id, text: line.replace(/^§[\d.]+\s*/, "") };
}

const acctLink = (D, id) => {
  const n = D.nodeById.get(id);
  return n?.risk ? `**${id}** (risk ${n.risk})` : `**${id}**`;
};

// ------------------------------------------------------------------ intents

function explainFinding(D, f) {
  const c = clause(D, f);
  const flagged = Object.keys(f.account_flags || {}).length;
  const b = f.risk_breakdown;
  const lines = [
    `**${f.id} · ${PATTERN[f.type].name}** — ${f.severity.toUpperCase()}, risk **${f.risk_score}/100**`,
    "",
    f.summary,
    "",
    `- **Period:** ${when(f.first_seen)} → ${when(f.last_seen)}`,
    `- **Evidence:** ${num(f.txn_count)} transactions, ${Object.keys(f.accounts).length} accounts, ${inr(f.total_amount)}`,
    `- **Account red flags:** ${flagged} of ${Object.keys(f.accounts).length} accounts (new account, minimum KYC, or inflow far above declared income)`,
    `- **Risk score:** pattern ${b.pattern_detected} + amount ${b.amount} + red flags ${b.account_red_flags} + strength ${b.pattern_strength}`,
  ];
  if (c) lines.push("", `**Policy breached — ${c.id}:** “${c.text}”`);
  lines.push("", `Under REG-IN §2, once the Principal Officer concludes this is suspicious, an STR is due to FIU-IND within 7 working days.`);
  return {
    text: lines.join("\n"),
    citations: [{ kind: "finding", id: f.id }, ...(c ? [{ kind: "policy", id: c.chunk }] : []), { kind: "policy", id: "REG-IN §2" }],
    actions: [{ kind: "finding", id: f.id, label: "Show network" }, { kind: "str", id: f.id, label: "Draft STR" }],
  };
}

function overview(D) {
  const s = D.summary;
  const lines = [
    `I found **${s.findings} suspicious networks** across ${num(s.transactions)} transactions, involving **${s.flagged_accounts} accounts** and **${inr(s.amount_at_risk)}**:`,
    "",
    ...D.findings.map((f) => `- **${f.id}** · ${PATTERN[f.type].name} · ${f.severity} · risk ${f.risk_score} — ${f.title}`),
    "",
    "Ask me to explain any of them, trace money from an account, or draft the STR.",
  ];
  return {
    text: lines.join("\n"),
    citations: D.findings.map((f) => ({ kind: "finding", id: f.id })),
    actions: D.findings.slice(0, 3).map((f) => ({ kind: "finding", id: f.id, label: `Open ${f.id}` })),
  };
}

function smallTransferReceivers(D, q, amounts) {
  let small = amounts.find((a) => /(sub|below|under|less than|<|small|upto|up to)\s*-?\s*$/.test(a.ctx))?.value;
  let total = amounts.find((a) => /(over|more than|above|>|at least|exceed\w*)\s*$/.test(a.ctx))?.value;
  const vals = amounts.map((a) => a.value).sort((a, b) => a - b);
  small ??= vals[0];
  total ??= vals[vals.length - 1];
  if (small === total) total = 1e5;
  const per = new Map();
  for (const t of D.txns) {
    if (t.amount >= small) continue;
    const r = per.get(t.dst) ?? per.set(t.dst, { sum: 0, n: 0, senders: new Set() }).get(t.dst);
    r.sum += t.amount; r.n++; r.senders.add(t.src);
  }
  const hits = [...per.entries()].filter(([, r]) => r.sum > total).sort((a, b) => b[1].sum - a[1].sum);
  if (!hits.length) {
    return { text: `No account received more than ${inr(total)} in transfers below ${inr(small, false)} in this data.`, citations: [], actions: [] };
  }
  const lines = [`**${hits.length} account${hits.length > 1 ? "s" : ""}** received more than ${inr(total)} in transfers below ${inr(small, false)}:`, ""];
  const cites = [], actions = [];
  for (const [id, r] of hits.slice(0, 8)) {
    const n = D.nodeById.get(id);
    const role = n?.roles?.[0];
    lines.push(`- ${acctLink(D, id)} — ${inr(r.sum)} from **${num(r.n)}** transfers by **${r.senders.size}** senders` +
      (role ? ` · ${ROLE_LABEL[role.role]} in **${role.finding}** (${PATTERN[role.type].name})` : n?.segment ? ` · ${n.segment.toLowerCase()} account, not flagged` : ""));
    cites.push({ kind: "account", id });
    if (role) actions.push({ kind: "finding", id: role.finding, label: `Open ${role.finding}` });
  }
  const flagged = hits.filter(([id]) => D.nodeById.get(id)?.roles?.length);
  const s32 = D.policyById.get("AML-04 §3");
  if (flagged.length) {
    lines.push("", `**Policy:** this matches AML-04 §3.2 — “ten or more unrelated accounts each sending five or more transfers of ₹2,000 or less to the same account, where most transfers share an identical amount and the combined value exceeds ₹1 lakh.”`);
    if (s32) cites.push({ kind: "policy", id: s32.id });
  }
  const unflagged = hits.length - flagged.length;
  if (unflagged) lines.push("", `${unflagged} other account${unflagged > 1 ? "s were" : " was"} not flagged: each payer paid only a few times (e.g. society dues, subscriptions), which AML-04 §3.4 treats as a legitimate exception.`);
  return { text: lines.join("\n"), citations: cites, actions: [...new Map(actions.map((a) => [a.id, a])).values()] };
}

function trace(D, acct, hours = 72) {
  const outs = D.outBy.get(acct) || [];
  const n = D.nodeById.get(acct);
  if (!outs.length) {
    const inflow = (D.inBy.get(acct) || []).reduce((s, t) => s + t.amount, 0);
    return {
      text: `${acctLink(D, acct)} has **no outgoing transfers** in the data; it received ${inr(inflow)} that is still in the account.` +
        (n?.roles?.length ? `\n\nAs a ${ROLE_LABEL[n.roles[0].role].toLowerCase()} in **${n.roles[0].finding}**, it should be considered for a debit freeze (AML-04 §8.6).` : ""),
      citations: [{ kind: "account", id: acct }, ...(n?.roles?.length ? [{ kind: "policy", id: "AML-04 §8" }] : [])],
      actions: n?.roles?.length ? [{ kind: "finding", id: n.roles[0].finding, label: `Open ${n.roles[0].finding}` }] : [],
    };
  }
  const win = hours * 3600e3;
  const level1 = new Map();
  for (const t of outs) {
    const r = level1.get(t.dst) ?? level1.set(t.dst, { sum: 0, first: t.ts }).get(t.dst);
    r.sum += t.amount; if (t.ts < r.first) r.first = t.ts;
  }
  const onward = new Map();
  let passed = 0;
  for (const [mid, r] of level1) {
    const start = new Date(r.first).getTime();
    for (const t of D.outBy.get(mid) || []) {
      const ts = new Date(t.ts).getTime();
      if (ts >= start && ts <= start + win && t.dst !== acct) {
        const o = onward.get(t.dst) ?? onward.set(t.dst, { sum: 0, via: new Set() }).get(t.dst);
        o.sum += t.amount; o.via.add(mid); passed += t.amount;
      }
    }
  }
  const sent = outs.reduce((s, t) => s + t.amount, 0);
  const top1 = [...level1.entries()].sort((a, b) => b[1].sum - a[1].sum);
  const top2 = [...onward.entries()].sort((a, b) => b[1].sum - a[1].sum);
  const lines = [
    `${acctLink(D, acct)} sent **${inr(sent)}** to **${level1.size}** account${level1.size > 1 ? "s" : ""}` +
      (top1.length > 3 ? `, largest: ${top1.slice(0, 3).map(([id, r]) => `${id} (${inr(r.sum)})`).join(", ")}.` : `: ${top1.map(([id, r]) => `${id} (${inr(r.sum)})`).join(", ")}.`),
  ];
  if (top2.length) {
    lines.push("", `Within **${hours} h** of receiving it, those accounts moved **${inr(passed)}** onward. Biggest destinations:`, "");
    for (const [id, o] of top2.slice(0, 5)) lines.push(`- ${acctLink(D, id)} — ${inr(o.sum)} via ${o.via.size} account${o.via.size > 1 ? "s" : ""}`);
  } else {
    lines.push("", `None of the recipients moved the money on within ${hours} h.`);
  }
  const roles = new Set([acct, ...level1.keys(), ...onward.keys()].flatMap((id) => (D.nodeById.get(id)?.roles || []).map((r) => r.finding)));
  if (roles.size) lines.push("", `This trail overlaps finding${roles.size > 1 ? "s" : ""} ${[...roles].map((r) => `**${r}**`).join(", ")}.`);
  for (const id of roles) {
    const f = D.findingById.get(id);
    if (f.type === "layering") lines.push("", `**Full chain (${id}):** ${f.metrics.chain.join(" → ")} — ${(f.metrics.value_kept * 100).toFixed(1)}% of the value reached the exit account in ${f.metrics.hours} h.`);
  }
  return {
    text: lines.join("\n"),
    citations: [{ kind: "account", id: acct }, ...[...roles].map((id) => ({ kind: "finding", id }))],
    actions: [...roles].map((id) => ({ kind: "finding", id, label: `Open ${id}` })),
  };
}

function accountProfile(D, acct, pii) {
  const n = D.nodeById.get(acct);
  if (!n) return { text: `I can't find account **${acct}** in this dataset.`, citations: [], actions: [] };
  const partners = new Map();
  for (const t of D.inBy.get(acct) || []) partners.set(t.src, (partners.get(t.src) || 0) + t.amount);
  for (const t of D.outBy.get(acct) || []) partners.set(t.dst, (partners.get(t.dst) || 0) + t.amount);
  const lines = [
    `**${acct}**${pii && n.name ? ` · ${n.name}` : ""} · ${n.segment?.toLowerCase() || "unknown"} · ${n.branch || ""}`,
    "",
    `- **Opened:** ${n.opened_on || "—"} · **KYC:** ${n.kyc || "—"} · **Declared income:** ${n.income ? inr(+n.income) + "/month" : "—"}`,
    `- **Inflow:** ${inr(n.in_amount)} (${num(n.in_count)} txns) · **Outflow:** ${inr(n.out_amount)} (${num(n.out_count)} txns) · **Counterparties:** ${partners.size}`,
    `- **Risk score:** ${n.risk}/100`,
  ];
  if (n.roles.length) {
    lines.push(`- **Roles:** ${n.roles.map((r) => `${ROLE_LABEL[r.role]} in **${r.finding}** (${PATTERN[r.type].name})`).join("; ")}`);
  }
  if (n.flags.length) lines.push("", `**Red flags (AML-04 §7):** ${n.flags.join("; ")}.`);
  if (!n.roles.length) lines.push("", "This account is not part of any detected network.");
  return {
    text: lines.join("\n"),
    citations: [{ kind: "account", id: acct }, ...n.roles.map((r) => ({ kind: "finding", id: r.finding })), ...(n.flags.length ? [{ kind: "policy", id: "AML-04 §7" }] : [])],
    actions: n.roles.map((r) => ({ kind: "finding", id: r.finding, label: `Open ${r.finding}` })),
  };
}

function riskiest(D, k = 10) {
  const top = [...D.nodes].filter((n) => n.risk).sort((a, b) => b.risk - a.risk || b.in_amount - a.in_amount).slice(0, k);
  return {
    text: [`The **${top.length} highest-risk accounts**:`, "",
      ...top.map((n, i) => `${i + 1}. **${n.id}** — risk ${n.risk} · ${n.roles.map((r) => `${ROLE_LABEL[r.role]} in ${r.finding}`).join(", ")}${n.flags.length ? ` · ${n.flags.length} red flag${n.flags.length > 1 ? "s" : ""}` : ""}`)].join("\n"),
    citations: top.map((n) => ({ kind: "account", id: n.id })),
    actions: [],
  };
}

function exposure(D) {
  const byType = {};
  for (const f of D.findings) {
    const r = (byType[f.type] ??= { amount: 0, n: 0, accounts: new Set() });
    r.amount += f.total_amount; r.n++; Object.keys(f.accounts).forEach((a) => r.accounts.add(a));
  }
  const mules = D.nodes.filter((n) => n.roles.some((r) => r.role === "mule")).length;
  return {
    text: [`**${inr(D.summary.amount_at_risk)}** moved through suspicious networks this period (${num(D.summary.flagged_transactions)} transactions, ${D.summary.flagged_accounts} accounts, ${mules} of them mules).`, "",
      ...Object.entries(byType).map(([t, r]) => `- **${PATTERN[t].name}:** ${inr(r.amount)} across ${r.n} network${r.n > 1 ? "s" : ""}, ${r.accounts.size} accounts`)].join("\n"),
    citations: D.findings.map((f) => ({ kind: "finding", id: f.id })),
    actions: [],
  };
}

function accuracy(D) {
  const e = D.summary.evaluation;
  if (!e) return { text: "This dataset has no ground-truth labels, so accuracy can't be scored.", citations: [], actions: [] };
  return {
    text: `On this synthetic dataset, every transaction carries a hidden ground-truth label the detector never sees.\n\n- **Precision:** ${(e.precision * 100).toFixed(2)}% (${num(e.true_positive_txns)} of ${num(e.flagged_txns)} flagged transactions are planted fraud)\n- **Recall:** ${(e.recall * 100).toFixed(2)}% (${num(e.true_positive_txns)} of ${num(e.planted_fraud_txns)} planted fraud transactions caught)\n\nThe data also contains legitimate look-alikes — society dues, gym subscriptions, family transfers — that the detector correctly leaves alone.`,
    citations: [], actions: [],
  };
}

function policyAnswer(D, q) {
  const hits = searchPolicies(D, q, 2);
  if (!hits.length) return null;
  const lines = [];
  const qt = new Set(tokens(q).flatMap((w) => [w, ...(SYNONYMS[w] || [])]));
  for (const p of hits) {
    const paras = p.text.split("\n").filter(Boolean);
    const scored = paras.map((l, i) => ({ l, i, s: tokens(l).filter((w) => qt.has(w)).length }));
    const best = paras.length > 2 ? scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2).sort((a, b) => a.i - b.i) : scored;
    const quote = (best.length ? best : scored.slice(0, 1)).map((x) => `> ${x.l}`).join("\n>\n");
    lines.push(`**${p.id} — ${p.heading}**`, "", quote, "");
  }
  return { text: lines.join("\n").trim(), citations: hits.map((p) => ({ kind: "policy", id: p.id })), actions: [] };
}

// ------------------------------------------------------------------ router

export function answerLocal(question, D, ctx = {}) {
  const q = question.trim();
  const ql = q.toLowerCase();
  const acct = q.match(/AC\d{8}/i)?.[0]?.toUpperCase();
  const fid = q.match(/\bF\d{3}\b/i)?.[0]?.toUpperCase();
  const amounts = parseAmounts(q);
  const finding = fid ? D.findingById.get(fid) : null;
  const ctxFinding = ctx.findingId ? D.findingById.get(ctx.findingId) : null;
  const refersToSelection = /\b(this|it|selected|current)\b/.test(ql);

  if (/\b(str|suspicious transaction report)\b/.test(ql) && /(draft|write|prepare|generate|create|file)/.test(ql)) {
    const f = finding || ctxFinding || D.findings[0];
    return { text: `Opening the STR draft for **${f.id}** (${f.title}). It is pre-filled with the subjects, transactions, grounds of suspicion and policy basis — review it, then mark it filed.`, citations: [{ kind: "finding", id: f.id }], actions: [{ kind: "str", id: f.id, label: "Open STR draft" }], open: { kind: "str", id: f.id } };
  }
  if (/(where did|trace|follow|went|flow|go\b|moved? to)/.test(ql)) {
    let a = acct || (refersToSelection ? ctx.accountId : null);
    if (!a && /fan.?out|source/.test(ql)) a = D.findings.find((f) => f.type === "fan_out_fan_in")?.metrics.source;
    if (!a && /layer|chain/.test(ql)) a = D.findings.find((f) => f.type === "layering")?.metrics.chain[1];
    a ||= ctx.accountId;
    if (a) return trace(D, a, parseHours(q) || 72);
  }
  if (amounts.length && /(receiv|inflow|got|credited|collected)/.test(ql)) return smallTransferReceivers(D, q, amounts);
  if (finding) return explainFinding(D, finding);
  if (acct) return accountProfile(D, acct, ctx.pii);
  if (ctxFinding && /(this|why|explain|risk|score|breach|evidence|finding)/.test(ql) && !/(deadline|how many days|retention|tipping)/.test(ql)) return explainFinding(D, ctxFinding);
  if (/(accura|precision|recall|false positive|ground truth)/.test(ql)) return accuracy(D);
  if (/(riskiest|highest risk|most risky|top \d*\s*(risk|account))/.test(ql)) return riskiest(D, +(ql.match(/top (\d+)/)?.[1] || ql.match(/(\d+) riskiest/)?.[1] || 10));
  if (/(how much|total|exposure|amount at risk)/.test(ql)) return exposure(D);
  for (const [type, re] of [["structuring", /structur|smurf/], ["fan_out_fan_in", /fan.?(out|in)/], ["layering", /layer|chain/], ["round_trip", /round.?trip|cycle|circular|loop/]]) {
    if (re.test(ql) && !/(policy|rule|define|what is|meaning)/.test(ql)) {
      const fs = D.findings.filter((f) => f.type === type);
      if (fs.length === 1) return explainFinding(D, fs[0]);
      return {
        text: [`**${fs.length} ${PATTERN[type].name}** findings:`, "", ...fs.map((f) => `- **${f.id}** · risk ${f.risk_score} — ${f.title}`)].join("\n"),
        citations: fs.map((f) => ({ kind: "finding", id: f.id })), actions: fs.map((f) => ({ kind: "finding", id: f.id, label: `Open ${f.id}` })),
      };
    }
  }
  if (/(policy|rule|regulat|deadline|tipping|retention|retain|ctr|kyc|pmla|fiu|principal officer|days|report|freeze|define|what is|meaning)/.test(ql)) {
    const p = policyAnswer(D, q);
    if (p) return p;
  }
  if (/(suspicious|summary|overview|anything|alerts?|findings?|what.*(found|look))/.test(ql)) return overview(D);
  const p = policyAnswer(D, q);
  if (p) return p;
  return { ...overview(D), text: `I couldn't map that to a specific query, so here's the current picture.\n\n${overview(D).text}` };
}

// ------------------------------------------------------------------ Snowflake Cortex (optional)

let cortexStatus = null;
export async function cortexAvailable() {
  if (cortexStatus) return cortexStatus;
  try {
    const r = await fetch("/api/health");
    cortexStatus = r.ok ? await r.json() : { snowflake: false };
  } catch {
    cortexStatus = { snowflake: false };
  }
  return cortexStatus;
}

export async function askCortex(question, local, D) {
  const policies = local.citations.filter((c) => c.kind === "policy").map((c) => D.policyById.get(c.id)).filter(Boolean);
  const r = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, evidence: local.text, policies: policies.map((p) => ({ id: p.id, text: p.text })) }),
  });
  if (!r.ok) throw new Error(`Cortex request failed (${r.status})`);
  return r.json();
}
