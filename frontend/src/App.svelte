<script>
  import { onMount } from "svelte";
  import { loadData } from "./lib/data.js";
  import { PATTERN, inr, num, when } from "./lib/format.js";
  import { cortexAvailable } from "./lib/copilot.js";
  import Graph from "./lib/Graph.svelte";
  import Evidence from "./lib/Evidence.svelte";
  import Copilot from "./lib/Copilot.svelte";
  import StrPanel from "./lib/StrPanel.svelte";
  import Audit from "./lib/Audit.svelte";

  let D = $state.raw(null);
  let error = $state("");
  let findingId = $state(null);
  let accountId = $state(null);
  let tab = $state("evidence");
  let role = $state("investigator");
  let typeFilter = $state("all");
  let messages = $state([]);
  let pendingQuestion = $state(null);
  let cortex = $state({ snowflake: false });
  let graph = $state();

  const store = {
    get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let cases = $state(store.get("mt.cases", {}));
  let audit = $state(store.get("mt.audit", []));
  $effect(() => store.set("mt.cases", cases));
  $effect(() => store.set("mt.audit", audit));

  onMount(async () => {
    try {
      D = await loadData();
    } catch (e) {
      error = e.message;
    }
    cortex = await cortexAvailable();
    // Deep links, e.g. ?finding=F001&tab=str, ?account=AC79448796, ?q=Explain%20F001, ?role=principal
    const p = new URLSearchParams(location.search);
    if (D) {
      if (p.get("role") === "principal") role = "principal";
      if (p.get("finding") && D.findingById.has(p.get("finding"))) findingId = p.get("finding");
      if (p.get("account")) accountId = p.get("account");
      if (["evidence", "copilot", "str", "audit"].includes(p.get("tab"))) tab = p.get("tab");
      if (p.get("q")) ask(p.get("q"));
    }
  });

  let finding = $derived(D && findingId ? D.findingById.get(findingId) : null);
  let pii = $derived(role === "principal");
  let shown = $derived(D ? D.findings.filter((f) => typeFilter === "all" || f.type === typeFilter) : []);

  function log(action, fid, note = "") {
    audit = [...audit, { ts: new Date().toISOString(), role, action, finding: fid, note }];
  }
  function selectFinding(id) {
    findingId = id;
    accountId = null;
    if (id) { tab = tab === "str" || tab === "copilot" ? tab : "evidence"; }
  }
  function selectAccount(id) {
    accountId = id;
    if (id && tab !== "copilot") tab = "evidence";
  }
  function act(fid, status, note) {
    cases = { ...cases, [fid]: { status, note } };
    log(status, fid, note);
  }
  function openSTR(fid) {
    findingId = fid;
    tab = "str";
    log("str", fid);
  }
  function onaction(a) {
    if (a.kind === "finding") selectFinding(a.id);
    else if (a.kind === "str") openSTR(a.id);
    else if (a.kind === "account") { accountId = a.id; const n = D.nodeById.get(a.id); if (n?.roles?.length && !(finding && finding.accounts[a.id])) findingId = n.roles[0].finding; }
    else if (a.kind === "policy") { if (finding) tab = "evidence"; else ask(`What does ${a.id} say?`); }
  }
  function ask(q) {
    tab = "copilot";
    pendingQuestion = q;
  }
  function switchRole(r) {
    role = r;
    log("role", null, r === "principal" ? "Principal Officer" : "Investigator");
  }
  const STATUS_DOT = { escalated: "#7b61ff", closed: "#94a3b8", info: "#e8a33d", filed: "#1b998b" };
</script>

{#if error}
  <div class="fatal">Could not load data: {error}. Run <code>python backend/pipeline.py</code> first.</div>
{:else if !D}
  <div class="fatal">Loading transaction graph…</div>
{:else}
  <div class="shell" class:wide={tab === "str"}>
    <header class="top">
      <div class="brand">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="7" fill="#E4572E" /><circle cx="5" cy="6" r="3" fill="#E8A33D" /><circle cx="27" cy="6" r="3" fill="#E8A33D" /><circle cx="5" cy="26" r="3" fill="#E8A33D" /><circle cx="27" cy="26" r="3" fill="#E8A33D" /><path d="M7 8 12 13M25 8 20 13M7 24 12 19M25 24 20 19" stroke="#94a3b8" stroke-width="1.5" /></svg>
        <div>
          <div class="name">MuleTrace</div>
          <div class="tag">Risk, Fraud & Regulatory Intelligence Copilot</div>
        </div>
      </div>
      <div class="kpis">
        <div><b>{num(D.summary.transactions)}</b><span>transactions</span></div>
        <div><b>{num(D.summary.accounts)}</b><span>accounts</span></div>
        <div><b>{D.summary.findings}</b><span>networks found</span></div>
        <div><b class="hot">{inr(D.summary.amount_at_risk)}</b><span>at risk</span></div>
        {#if D.summary.evaluation}<div title="Scored against hidden ground-truth labels in the synthetic data"><b>{(D.summary.evaluation.recall * 100).toFixed(1)}%</b><span>recall · {(D.summary.evaluation.precision * 100).toFixed(0)}% precision</span></div>{/if}
      </div>
      <div class="right">
        <span class="period">{when(D.summary.period[0], false)} – {when(D.summary.period[1], false)} · synthetic</span>
        <label class="role">
          <span>Role</span>
          <select value={role} onchange={(e) => switchRole(e.currentTarget.value)}>
            <option value="investigator">Investigator (PII masked)</option>
            <option value="principal">Principal Officer</option>
          </select>
        </label>
      </div>
    </header>

    <aside class="queue">
      <div class="qhead">
        <h2>Alert queue</h2>
        <select bind:value={typeFilter} aria-label="Filter by typology">
          <option value="all">All typologies</option>
          {#each Object.entries(PATTERN) as [k, p]}<option value={k}>{p.name}</option>{/each}
        </select>
      </div>
      <button class="alert overview" class:active={!findingId} onclick={() => selectFinding(null)}>
        <div class="row1"><b>All networks</b><span class="amt">{inr(D.summary.amount_at_risk)}</span></div>
        <div class="meta">{D.summary.flagged_accounts} accounts · {num(D.summary.flagged_transactions)} transactions</div>
      </button>
      {#each shown as f (f.id)}
        <button class="alert" class:active={findingId === f.id} onclick={() => { selectFinding(f.id); log("viewed", f.id); }}>
          <div class="row1">
            <span class="dot" style:background={PATTERN[f.type].color}></span>
            <b>{f.id}</b>
            <span class="pname">{PATTERN[f.type].name}</span>
            <span class="chip sev-{f.severity}">{f.risk_score}</span>
          </div>
          <div class="title">{f.title}</div>
          <div class="meta">
            {Object.keys(f.accounts).length} accounts · {num(f.txn_count)} txns · {when(f.first_seen, false)}
            {#if cases[f.id]}<span class="status"><span class="dot" style:background={STATUS_DOT[cases[f.id].status]}></span>{cases[f.id].status}</span>{/if}
          </div>
        </button>
      {/each}
    </aside>

    <main class="stage">
      <div class="stagebar">
        <div>
          <h2>{finding ? `${finding.id} · ${finding.title}` : "All suspicious networks"}</h2>
          <div class="hint">{finding ? `${PATTERN[finding.type].name} · ${when(finding.first_seen)} → ${when(finding.last_seen)}` : "Each cluster is one detected network. Click a cluster's account, or pick an alert."} · click any account to inspect it</div>
        </div>
        <div class="legend">
          {#each Object.values(PATTERN) as p}<span><span class="dot" style:background={p.color}></span>{p.name}</span>{/each}
          <button class="btn" onclick={() => graph?.fit()}>Fit</button>
        </div>
      </div>
      <div class="canvas">
        <Graph bind:this={graph} {D} {findingId} {accountId} onselect={selectAccount} />
      </div>
    </main>

    <section class="panel">
      <nav class="tabs">
        {#each [["evidence", "Evidence"], ["copilot", "Copilot"], ["str", "STR draft"], ["audit", `Audit${audit.length ? ` (${audit.length})` : ""}`]] as [k, label]}
          <button class:on={tab === k} onclick={() => (tab = k)}>{label}</button>
        {/each}
      </nav>
      <div class="pbody" class:chat={tab === "copilot"}>
        {#if tab === "evidence"}
          <Evidence {D} {finding} account={accountId} {pii} caseState={finding ? cases[finding.id] : null} onact={act} onselectAccount={selectAccount} onselectFinding={selectFinding} onask={ask} onstr={openSTR} />
        {:else if tab === "copilot"}
          <Copilot {D} bind:messages bind:pending={pendingQuestion} ctx={{ findingId, accountId, pii }} {cortex} {onaction} />
        {:else if tab === "str"}
          <StrPanel {D} {finding} {pii} {role} caseState={finding ? cases[finding.id] : null} onfiled={(fid) => act(fid, "filed", cases[fid]?.note || "")} />
        {:else}
          <Audit log={audit} onselectFinding={selectFinding} />
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .fatal { display: grid; place-items: center; height: 100%; color: var(--muted); padding: 24px; text-align: center; }
  .shell {
    height: 100vh; display: grid; grid-template-columns: 300px minmax(0, 1fr) 440px; grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "top top top" "queue stage panel";
  }
  .top {
    grid-area: top; background: var(--ink); color: #fff; display: flex; align-items: center; gap: 24px; padding: 10px 18px; flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .name { font-weight: 700; font-size: 17px; letter-spacing: 0.01em; }
  .tag { font-size: 11.5px; color: #9fb0c6; }
  .kpis { display: flex; gap: 22px; flex: 1; flex-wrap: wrap; }
  .kpis div { display: flex; flex-direction: column; }
  .kpis b { font-size: 16px; }
  .kpis b.hot { color: #ff8a65; }
  .kpis span { font-size: 11px; color: #9fb0c6; }
  .right { display: flex; align-items: center; gap: 14px; }
  .period { font-size: 12px; color: #9fb0c6; }
  .role { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9fb0c6; }
  .role select { background: var(--ink-2); color: #fff; border: 1px solid #33465f; border-radius: 6px; padding: 4px 6px; }

  .queue { grid-area: queue; overflow-y: auto; padding: 14px 12px; border-right: 1px solid var(--line); background: #fbfcfd; }
  .qhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
  .qhead h2 { font-size: 14px; }
  .qhead select { border: 1px solid var(--line); border-radius: 6px; padding: 3px 4px; font-size: 12px; background: #fff; max-width: 140px; }
  .alert {
    width: 100%; text-align: left; border: 1px solid var(--line); background: var(--card); border-radius: var(--radius);
    padding: 10px 12px; margin-bottom: 8px; display: block; color: inherit; box-shadow: var(--shadow);
  }
  .alert:hover { border-color: #c3ccd8; }
  .alert.active { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink), var(--shadow); }
  .alert.overview { background: var(--soft); box-shadow: none; }
  .row1 { display: flex; align-items: center; gap: 6px; }
  .pname { color: var(--muted); font-size: 12px; flex: 1; }
  .amt { margin-left: auto; font-weight: 700; }
  .title { font-size: 13px; margin: 6px 0 4px; line-height: 1.35; }
  .meta { font-size: 11.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .status { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; text-transform: capitalize; margin-left: auto; }

  .stage { grid-area: stage; display: flex; flex-direction: column; min-width: 0; padding: 14px; gap: 10px; }
  .stagebar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .stagebar h2 { font-size: 15px; }
  .hint { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .legend { display: flex; gap: 12px; align-items: center; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .canvas { position: relative; flex: 1; min-height: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
    background-image: radial-gradient(#e6ebf1 1px, transparent 1px); background-size: 18px 18px; }

  .panel { grid-area: panel; display: flex; flex-direction: column; border-left: 1px solid var(--line); min-height: 0; }
  .tabs { display: flex; gap: 2px; padding: 10px 12px 0; border-bottom: 1px solid var(--line); background: #fbfcfd; }
  .tabs button { border: none; background: none; padding: 8px 12px; font-weight: 600; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs button.on { color: var(--text); border-bottom-color: var(--ink); }
  .pbody { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }
  .pbody.chat { overflow: hidden; display: flex; flex-direction: column; }

  .shell.wide { grid-template-columns: 260px minmax(0, 1fr) 680px; }
  @media (max-width: 1200px) {
    .shell { grid-template-columns: 260px minmax(0, 1fr) 380px; }
  }
  @media (max-width: 900px) {
    .shell, .shell.wide { height: auto; grid-template-columns: 1fr; grid-template-areas: "top" "queue" "stage" "panel"; }
    .queue { max-height: 320px; border-right: none; }
    .canvas { min-height: 420px; }
    .panel { border-left: none; }
    .pbody { max-height: 80vh; }
    .pbody.chat { height: 80vh; }
  }
</style>
