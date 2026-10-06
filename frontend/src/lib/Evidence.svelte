<script>
  import { PATTERN, ROLE_LABEL, inr, maskName, num, when, download } from "./format.js";
  import { findingTxns, policiesForFinding } from "./data.js";
  import { evidenceCSV } from "./str.js";

  let { D, finding = null, account = null, pii = false, caseState = null, onact, onselectAccount, onselectFinding, onask, onstr } = $props();

  let note = $state("");
  let showAllAccounts = $state(false);
  let showAllTxns = $state(false);

  const ROLE_ORDER = ["source", "collector", "distributor", "entry", "exit", "layer", "cycle_member", "mule"];
  let accounts = $derived(
    finding
      ? Object.entries(finding.accounts)
          .map(([id, role]) => ({ id, role, n: D.nodeById.get(id) }))
          .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || (b.n?.risk || 0) - (a.n?.risk || 0))
      : []
  );
  let txns = $derived(finding ? findingTxns(D, finding) : []);
  let policies = $derived(finding ? policiesForFinding(D, finding) : []);
  let node = $derived(account ? D.nodeById.get(account) : null);
  let partners = $derived.by(() => {
    if (!account) return [];
    const m = new Map();
    for (const t of D.inBy.get(account) || []) {
      const r = m.get(t.src) ?? m.set(t.src, { id: t.src, in: 0, out: 0, n: 0 }).get(t.src);
      r.in += t.amount; r.n++;
    }
    for (const t of D.outBy.get(account) || []) {
      const r = m.get(t.dst) ?? m.set(t.dst, { id: t.dst, in: 0, out: 0, n: 0 }).get(t.dst);
      r.out += t.amount; r.n++;
    }
    return [...m.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
  });

  $effect(() => { finding?.id; showAllAccounts = false; showAllTxns = false; note = caseState?.note || ""; });

  const nameOf = (n) => (n?.name ? (pii ? n.name : maskName(n.name)) : "");
  const STATUS = { open: "Open", escalated: "Escalated to PO", closed: "Closed · false positive", info: "More info requested", filed: "STR filed" };
</script>

{#if account && node}
  <section class="card account">
    <header>
      <div>
        <div class="eyebrow">Account</div>
        <h3 class="mono">{node.id}</h3>
        <div class="muted">{nameOf(node) || "—"}{#if !pii && node.name}<span class="masked" title="PII masked for the Investigator role (Snowflake masking policy). Switch to Principal Officer to unmask."> · masked</span>{/if}</div>
      </div>
      <button class="btn" onclick={() => onselectAccount(null)} aria-label="Close account">✕</button>
    </header>
    <div class="kv">
      <div><span>Segment</span>{node.segment || "—"}</div>
      <div><span>Branch</span>{node.branch || "—"}</div>
      <div><span>Opened</span>{node.opened_on || "—"}</div>
      <div><span>KYC</span>{node.kyc || "—"}</div>
      <div><span>Declared income</span>{node.income ? inr(+node.income) + "/mo" : "—"}</div>
      <div><span>Risk</span><b>{node.risk}/100</b></div>
      <div><span>Inflow</span>{inr(node.in_amount)} · {num(node.in_count)}</div>
      <div><span>Outflow</span>{inr(node.out_amount)} · {num(node.out_count)}</div>
    </div>
    {#if node.flags.length}
      <div class="flags">{#each node.flags as fl}<span class="chip sev-high">⚑ {fl}</span>{/each}</div>
    {/if}
    {#if node.roles.length}
      <div class="roles">
        {#each node.roles as r}
          <button class="chip linky" onclick={() => onselectFinding(r.finding)}><span class="dot" style:background={PATTERN[r.type].color}></span>{ROLE_LABEL[r.role]} in {r.finding}</button>
        {/each}
      </div>
    {/if}
    <h4>Top counterparties</h4>
    <table class="tbl">
      <thead><tr><th>Account</th><th class="r">In</th><th class="r">Out</th><th class="r">Txns</th></tr></thead>
      <tbody>
        {#each partners.slice(0, 6) as p}
          <tr><td><button class="link mono" onclick={() => onselectAccount(p.id)}>{p.id}</button></td><td class="r">{p.in ? inr(p.in) : ""}</td><td class="r">{p.out ? inr(p.out) : ""}</td><td class="r">{p.n}</td></tr>
        {/each}
      </tbody>
    </table>
    <div class="row">
      <button class="btn" onclick={() => onask(`Where did the money from ${node.id} go within 48 hours?`)}>Trace money forward</button>
      <button class="btn" onclick={() => onask(`Tell me about ${node.id}`)}>Ask copilot</button>
    </div>
  </section>
{/if}

{#if finding}
  <section class="card">
    <div class="tags">
      <span class="chip"><span class="dot" style:background={PATTERN[finding.type].color}></span>{PATTERN[finding.type].name}</span>
      <span class="chip sev-{finding.severity}">{finding.severity}</span>
      <span class="chip">{STATUS[caseState?.status || "open"]}</span>
      <span class="spacer"></span>
      <span class="score" title="Risk score">{finding.risk_score}<small>/100</small></span>
    </div>
    <h3>{finding.id} · {finding.title}</h3>
    <p class="summary">{finding.summary}</p>

    <div class="stats">
      <div><b>{inr(finding.total_amount)}</b><span>amount</span></div>
      <div><b>{Object.keys(finding.accounts).length}</b><span>accounts</span></div>
      <div><b>{num(finding.txn_count)}</b><span>transactions</span></div>
      <div><b>{Object.keys(finding.account_flags).length}</b><span>with red flags</span></div>
    </div>

    <h4>Why this score</h4>
    <div class="bars">
      {#each [["Pattern detected", finding.risk_breakdown.pattern_detected, 40], ["Amount at stake", finding.risk_breakdown.amount, 25], ["Account red flags", finding.risk_breakdown.account_red_flags, 25], ["Pattern strength", finding.risk_breakdown.pattern_strength, 10]] as [label, v, max]}
        <div class="bar"><span>{label}</span><div><i style:width="{(v / max) * 100}%" style:background={PATTERN[finding.type].color}></i></div><b>{v}</b></div>
      {/each}
    </div>

    <h4>Policy applied</h4>
    {#each policies as p}
      <details class="policy" open={p.id === finding.policy_ref}>
        <summary><b>{p.id}</b> — {p.heading}</summary>
        <div class="ptext">{#each p.text.split("\n") as line}<p>{line}</p>{/each}</div>
        <div class="src mono">{p.source}</div>
      </details>
    {/each}

    <h4>Accounts ({accounts.length})</h4>
    <table class="tbl">
      <thead><tr><th>Account</th><th>Role</th><th class="r">Risk</th><th>Flags</th></tr></thead>
      <tbody>
        {#each showAllAccounts ? accounts : accounts.slice(0, 8) as a}
          <tr>
            <td><button class="link mono" onclick={() => onselectAccount(a.id)}>{a.id}</button><div class="sub">{nameOf(a.n)}</div></td>
            <td>{ROLE_LABEL[a.role]}</td>
            <td class="r">{a.n?.risk ?? ""}</td>
            <td class="sub">{(finding.account_flags[a.id] || []).length || ""}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if accounts.length > 8}<button class="link more" onclick={() => (showAllAccounts = !showAllAccounts)}>{showAllAccounts ? "Show fewer" : `Show all ${accounts.length}`}</button>{/if}

    <h4>Transactions ({num(txns.length)})</h4>
    <table class="tbl">
      <thead><tr><th>When</th><th>From → To</th><th class="r">Amount</th></tr></thead>
      <tbody>
        {#each showAllTxns ? txns.slice(0, 300) : txns.slice(0, 8) as t}
          <tr><td class="sub">{when(t.ts)}</td><td class="mono small">{t.src} → {t.dst}</td><td class="r">{inr(t.amount, false)}</td></tr>
        {/each}
      </tbody>
    </table>
    <div class="row">
      {#if txns.length > 8}<button class="link more" onclick={() => (showAllTxns = !showAllTxns)}>{showAllTxns ? "Show fewer" : `Show more`}</button>{/if}
      <span class="spacer"></span>
      <button class="btn" onclick={() => download(`${finding.id}_evidence.csv`, evidenceCSV(D, finding), "text/csv")}>⭳ Evidence CSV</button>
    </div>

    <h4>Decision</h4>
    <textarea rows="2" placeholder="Investigator note (recorded in the audit log)…" bind:value={note}></textarea>
    <div class="row wrap">
      <button class="btn primary" onclick={() => onact(finding.id, "escalated", note)}>Escalate to Principal Officer</button>
      <button class="btn" onclick={() => onact(finding.id, "info", note)}>Request info</button>
      <button class="btn danger" onclick={() => onact(finding.id, "closed", note)}>Close as false positive</button>
      <button class="btn teal" onclick={() => onstr(finding.id)}>Draft STR →</button>
    </div>
  </section>
{:else if !account}
  <section class="card">
    <h3>How MuleTrace works</h3>
    <ol class="how">
      <li><b>Signal.</b> A graph detector scans every transaction for four laundering typologies and scores each network.</li>
      <li><b>Evidence.</b> Each alert links the exact transactions, the accounts' KYC red flags, and the policy clause it breaches.</li>
      <li><b>Finding.</b> The investigator records a decision; every action lands in the audit log.</li>
      <li><b>Report.</b> One click drafts the STR for the Principal Officer, with the FIU-IND deadline computed.</li>
    </ol>
    <p class="muted">Pick an alert on the left, click any account in the graph, or ask the copilot a question.</p>
    {#if D.summary.evaluation}
      <div class="eval">
        <div><b>{(D.summary.evaluation.precision * 100).toFixed(1)}%</b><span>precision</span></div>
        <div><b>{(D.summary.evaluation.recall * 100).toFixed(2)}%</b><span>recall</span></div>
        <div><b>{num(D.summary.evaluation.planted_fraud_txns)}</b><span>planted fraud txns</span></div>
      </div>
      <p class="muted small">Scored against hidden ground-truth labels in the synthetic data, which also contains legitimate look-alikes (society dues, subscriptions, family transfers).</p>
    {/if}
  </section>
{/if}

<style>
  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow); }
  .card.account { border-color: #c9d2de; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  h3 { font-size: 16px; line-height: 1.3; margin: 8px 0 6px; }
  header h3 { margin: 2px 0; }
  h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 16px 0 6px; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .masked { font-size: 11px; color: var(--violet); cursor: help; }
  .summary { margin: 0; color: #334155; line-height: 1.5; }
  .tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .score { font-size: 24px; font-weight: 700; }
  .score small { font-size: 12px; color: var(--muted); font-weight: 500; }
  .stats, .eval { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .eval { grid-template-columns: repeat(3, 1fr); }
  .stats div, .eval div { background: var(--soft); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; }
  .stats b, .eval b { font-size: 15px; }
  .stats span, .eval span { font-size: 11px; color: var(--muted); }
  .bars { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: grid; grid-template-columns: 120px 1fr 32px; align-items: center; gap: 8px; font-size: 12.5px; }
  .bar div { height: 8px; background: var(--soft); border-radius: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 8px; }
  .bar b { text-align: right; }
  .policy { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 13px; }
  .policy summary { cursor: pointer; }
  .ptext p { margin: 6px 0; line-height: 1.45; color: #334155; }
  .src { font-size: 11px; color: var(--muted); }
  .tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .tbl th { text-align: left; font-weight: 600; color: var(--muted); font-size: 11.5px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  .tbl td { padding: 5px 6px; border-bottom: 1px solid #f0f3f7; vertical-align: top; }
  .r { text-align: right; }
  .sub { font-size: 11.5px; color: var(--muted); }
  .link { background: none; border: none; padding: 0; color: #1d4ed8; font-weight: 600; text-align: left; }
  .link:hover { text-decoration: underline; }
  .more { margin-top: 6px; font-size: 12.5px; }
  .row { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .row.wrap { flex-wrap: wrap; }
  textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 8px; resize: vertical; }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 13px; }
  .kv span { display: block; font-size: 11px; color: var(--muted); }
  .flags, .roles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chip.linky { border: none; }
  .chip.linky:hover { background: #e2e8f0; }
  .how { padding-left: 18px; line-height: 1.5; }
  .how li { margin-bottom: 6px; }
</style>
