/** Builds a draft Suspicious Transaction Report (Markdown) for a finding, structured along FIU-IND STR lines. */
import { PATTERN, ROLE_LABEL, addWorkingDays, inr, maskName, num, when } from "./format.js";
import { findingTxns, policiesForFinding } from "./data.js";

const ROLE_ORDER = ["source", "collector", "distributor", "entry", "exit", "layer", "cycle_member", "mule"];

function groundsOfSuspicion(D, f) {
  const m = f.metrics;
  const n = Object.keys(f.accounts).length;
  const flagged = Object.keys(f.account_flags || {}).length;
  const text = {
    structuring: () => `Between ${when(f.first_seen)} and ${when(f.last_seen)}, ${m.spokes} accounts made ${num(f.txn_count)} transfers totalling ${inr(f.total_amount)} to account ${m.hub}. ${Math.round(m.common_share * 100)}% of these transfers were for exactly ${inr(m.common_amount, false)}, and every transfer was ₹2,000 or less. The senders had no apparent relationship with the recipient. The pattern is consistent with deliberate structuring ("smurfing") to keep each transfer below monitoring thresholds while consolidating a large sum.`,
    fan_out_fan_in: () => `On ${when(f.first_seen)}, account ${m.source} transferred funds to ${m.mules} accounts, mostly in amounts just below ₹10,000. Within a median of ${m.median_delay_h} hours, these accounts passed ${Math.round(m.pass_through * 100)}% of the money to a single account, ${m.collector}. The rapid split-and-regroup, with intermediaries retaining almost nothing, is characteristic of a money-mule network laundering proceeds of fraud.`,
    layering: () => `${inr(f.total_amount)} moved through ${m.hops} consecutive accounts (${m.chain.join(" → ")}) within ${m.hours} hours, with ${(m.value_kept * 100).toFixed(1)}% of the original amount reaching the final account. Each hop followed the previous one within 24 hours. The pattern is consistent with layering intended to distance funds from their source.`,
    round_trip: () => `Funds of ${inr(f.total_amount)} left account ${m.ring[0]} and returned to it within ${m.hours} hours via ${m.ring.slice(1).join(" → ")}, with ${(m.value_kept * 100).toFixed(1)}% of the value intact. There is no apparent commercial rationale for the circular movement, which is consistent with round-tripping to inflate turnover or obscure the origin of funds.`,
  };
  const base = text[f.type]();
  const extra = flagged
    ? ` ${flagged} of the ${n} accounts involved show additional risk indicators under AML-04 §7, including recently opened accounts, minimum-KYC status, and inflows far exceeding declared income.`
    : "";
  return base + extra;
}

export function buildSTR(D, f, { pii = false, decidedOn = new Date(), caseNote = "" } = {}) {
  const txns = findingTxns(D, f);
  const due = addWorkingDays(decidedOn, 7);
  const accounts = Object.entries(f.accounts)
    .map(([id, role]) => ({ id, role, n: D.nodeById.get(id) }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || (b.n?.risk || 0) - (a.n?.risk || 0));
  const shown = accounts.slice(0, 15);
  const policies = policiesForFinding(D, f);
  const name = (n) => (n?.name ? (pii ? n.name : maskName(n.name)) : "—");

  const md = [];
  md.push(`# Suspicious Transaction Report — DRAFT`);
  md.push("");
  md.push(`> **Status:** Draft for Principal Officer review · not yet filed · **Confidential — do not disclose to the customer (AML-04 §8.5)**`);
  md.push("");
  md.push(`| | |`, `|---|---|`);
  md.push(`| **STR reference** | STR-${f.first_seen.slice(0, 10).replace(/-/g, "")}-${f.id} |`);
  md.push(`| **Reporting entity** | Demo Bank Ltd (synthetic) |`);
  md.push(`| **Prepared by** | MuleTrace copilot, for the Principal Officer |`);
  md.push(`| **Draft date** | ${decidedOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} |`);
  md.push(`| **File with FIU-IND by** | **${due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}** (7 working days from the suspicion decision, REG-IN §2) |`);
  md.push("");
  md.push(`## 1. Summary`);
  md.push("");
  md.push(`| Typology | Period | Amount | Accounts | Transactions | Risk |`, `|---|---|---|---|---|---|`);
  md.push(`| ${PATTERN[f.type].name} | ${when(f.first_seen)} – ${when(f.last_seen)} | ${inr(f.total_amount)} | ${accounts.length} | ${num(f.txn_count)} | ${f.risk_score}/100 (${f.severity}) |`);
  md.push("");
  md.push(`## 2. Subjects and accounts`);
  md.push("");
  md.push(`| Account | Holder | Role | Opened | KYC | Declared income | Risk | Red flags |`, `|---|---|---|---|---|---|---|---|`);
  for (const { id, role, n } of shown) {
    md.push(`| ${id} | ${name(n)} | ${ROLE_LABEL[role]} | ${n?.opened_on || "—"} | ${n?.kyc || "—"} | ${n?.income ? inr(+n.income) : "—"} | ${n?.risk ?? "—"} | ${(f.account_flags?.[id] || []).join("; ") || "—"} |`);
  }
  if (accounts.length > shown.length) md.push("", `*…and ${accounts.length - shown.length} further accounts with the same role, listed in Annex A.*`);
  md.push("");
  md.push(`## 3. Grounds of suspicion`);
  md.push("");
  md.push(groundsOfSuspicion(D, f));
  if (caseNote) md.push("", `**Investigator note:** ${caseNote}`);
  md.push("");
  md.push(`## 4. Transactions`);
  md.push("");
  md.push(`${num(txns.length)} transactions, ${inr(f.total_amount)} in total. ${txns.length > 12 ? "First 12 shown; the complete list is in Annex A." : ""}`);
  md.push("");
  md.push(`| Txn ID | Date & time | From | To | Amount | Channel |`, `|---|---|---|---|---|---|`);
  for (const t of txns.slice(0, 12)) md.push(`| ${t.id} | ${when(t.ts)} | ${t.src} | ${t.dst} | ${inr(t.amount, false)} | ${t.channel} |`);
  md.push("");
  md.push(`## 5. Policy and regulatory basis`);
  md.push("");
  for (const p of policies) md.push(`- **${p.id} — ${p.heading}.** ${p.text.split("\n")[0].replace(/^§[\d.]+\s*/, "")}`);
  md.push("");
  md.push(`## 6. Action taken / recommended`);
  md.push("");
  const exitish = accounts.filter((a) => ["collector", "exit", "source"].includes(a.role)).map((a) => a.id);
  md.push(`- Consider a debit freeze on ${exitish.length ? exitish.join(", ") : "the accounts listed above"} and report them on the cyber-fraud portal (AML-04 §8.6).`);
  md.push(`- Place all ${accounts.length} accounts under enhanced monitoring and trigger periodic KYC review (RBI KYC Master Direction, REG-IN §5).`);
  md.push(`- Retain this report, the evidence pack and the decision log for at least five years (AML-04 §9.1).`);
  md.push("");
  md.push(`## 7. Evidence trail`);
  md.push("");
  md.push(`Finding **${f.id}** was produced by the MuleTrace graph detector (thresholds: ${PATTERN[f.type].name.toLowerCase()} rule per ${f.policy_ref}). Every figure above is computed from the listed source transactions; the full evidence pack (Annex A, CSV) is attached.`);
  return md.join("\n");
}

export function evidenceCSV(D, f) {
  const rows = [["txn_id", "timestamp", "from_account", "to_account", "amount", "channel", "from_role", "to_role"]];
  for (const t of findingTxns(D, f)) rows.push([t.id, t.ts, t.src, t.dst, t.amount, t.channel, f.accounts[t.src] || "", f.accounts[t.dst] || ""]);
  return rows.map((r) => r.join(",")).join("\n");
}
