<script>
  import { marked } from "marked";
  import { tick } from "svelte";
  import { SUGGESTIONS, answerLocal, askCortex } from "./copilot.js";
  import { PATTERN } from "./format.js";

  let { D, messages = $bindable([]), ctx, cortex, pending = $bindable(null), onaction } = $props();

  let input = $state("");
  let busy = $state(false);
  let scroller;

  async function send(q) {
    q = (q ?? input).trim();
    if (!q || busy) return;
    input = "";
    busy = true;
    messages = [...messages, { role: "user", text: q }];
    await scrollDown();
    const local = answerLocal(q, D, ctx);
    let msg = { role: "assistant", ...local, source: "local" };
    if (cortex?.snowflake) {
      try {
        const r = await askCortex(q, local, D);
        if (r?.text) msg = { ...msg, text: r.text, evidence: local.text, source: r.source || "cortex" };
      } catch (e) {
        msg.note = "Snowflake Cortex unavailable — showing the local evidence engine's answer.";
      }
    }
    messages = [...messages, msg];
    busy = false;
    if (local.open) onaction(local.open);
    await scrollDown();
  }

  async function scrollDown() {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    if (pending) {
      const q = pending;
      pending = null;
      send(q);
    }
  });

  const citeLabel = (c) => (c.kind === "policy" ? c.id : c.kind === "finding" ? c.id : c.id);
  const SOURCE = { local: "Evidence engine", "cortex-agent": "Snowflake Cortex Agent", "cortex-complete": "Snowflake Cortex AI_COMPLETE", cortex: "Snowflake Cortex" };
</script>

<div class="copilot">
  <div class="log" bind:this={scroller}>
    {#if !messages.length}
      <div class="intro">
        <h3>Ask about the money</h3>
        <p>Answers come with the transactions, accounts and policy clauses behind them. Try:</p>
        <div class="sugs">
          {#each SUGGESTIONS as s}<button class="sug" onclick={() => send(s)}>{s}</button>{/each}
        </div>
      </div>
    {/if}
    {#each messages as m}
      {#if m.role === "user"}
        <div class="msg user">{m.text}</div>
      {:else}
        <div class="msg bot">
          <div class="who"><span class="avatar">MT</span> MuleTrace <span class="src">{SOURCE[m.source] || m.source}</span></div>
          <div class="md">{@html marked.parse(m.text)}</div>
          {#if m.evidence}
            <details class="evidence"><summary>Evidence used (local engine)</summary><div class="md">{@html marked.parse(m.evidence)}</div></details>
          {/if}
          {#if m.note}<div class="note">{m.note}</div>{/if}
          {#if m.citations?.length}
            <div class="cites">
              <span class="lbl">Sources</span>
              {#each m.citations.slice(0, 10) as c}
                <button class="cite {c.kind}" onclick={() => onaction(c)}>
                  {#if c.kind === "finding"}<span class="dot" style:background={PATTERN[D.findingById.get(c.id)?.type]?.color}></span>{/if}
                  {citeLabel(c)}
                </button>
              {/each}
              {#if m.citations.length > 10}<span class="lbl">+{m.citations.length - 10}</span>{/if}
            </div>
          {/if}
          {#if m.actions?.length}
            <div class="actions">{#each m.actions.slice(0, 4) as a}<button class="btn" onclick={() => onaction(a)}>{a.label}</button>{/each}</div>
          {/if}
        </div>
      {/if}
    {/each}
    {#if busy}<div class="msg bot thinking">Querying the transaction graph…</div>{/if}
  </div>
  <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
    <input placeholder="Ask in plain English… e.g. “Explain F004”" bind:value={input} />
    <button class="btn primary" disabled={busy || !input.trim()}>Ask</button>
  </form>
  <div class="mode">
    {#if cortex?.snowflake}<span class="dot" style:background="var(--ice)"></span> Connected to Snowflake Cortex{#if cortex.agent} · agent {cortex.agent}{/if}
    {:else}<span class="dot" style:background="var(--muted)"></span> Local evidence engine (Snowflake Cortex not configured){/if}
  </div>
</div>

<style>
  .copilot { display: flex; flex-direction: column; height: 100%; }
  .log { flex: 1; overflow-y: auto; padding: 4px 2px 12px; display: flex; flex-direction: column; gap: 10px; }
  .intro h3 { font-size: 16px; margin-bottom: 4px; }
  .intro p { color: var(--muted); margin: 0 0 10px; }
  .sugs { display: flex; flex-direction: column; gap: 6px; }
  .sug { text-align: left; border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 8px 10px; color: #1f2937; }
  .sug:hover { border-color: var(--teal); background: #f0faf8; }
  .msg { border-radius: 10px; padding: 10px 12px; max-width: 100%; }
  .msg.user { align-self: flex-end; background: var(--ink); color: #fff; max-width: 88%; }
  .msg.bot { background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow); }
  .thinking { color: var(--muted); font-style: italic; }
  .who { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12.5px; color: var(--teal); margin-bottom: 6px; }
  .avatar { width: 20px; height: 20px; border-radius: 50%; background: var(--teal); color: #fff; font-size: 9px; display: grid; place-items: center; }
  .src { margin-left: auto; font-weight: 600; color: var(--muted); font-size: 11px; }
  .cites { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .lbl { font-size: 11px; color: var(--muted); margin-right: 2px; }
  .cite { border: 1px solid var(--line); background: var(--soft); border-radius: 6px; padding: 1px 7px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .cite.policy { background: #efeaff; border-color: #ddd3ff; color: #4b3bb5; }
  .cite.account { font-family: "JetBrains Mono", monospace; font-weight: 400; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .evidence { margin-top: 6px; font-size: 12.5px; color: var(--muted); }
  .note { font-size: 12px; color: #8a5a0b; margin-top: 6px; }
  .composer { display: flex; gap: 6px; padding-top: 8px; border-top: 1px solid var(--line); }
  .composer input { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #fff; }
  .composer input:focus { outline: 2px solid #b9e6df; border-color: var(--teal); }
  .mode { font-size: 11.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; padding-top: 6px; }
</style>
