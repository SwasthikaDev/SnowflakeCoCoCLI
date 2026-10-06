<script>
  import { download } from "./format.js";
  let { log, onselectFinding } = $props();
  const LABEL = { escalated: "Escalated to Principal Officer", info: "Requested more information", closed: "Closed as false positive", filed: "STR marked as filed", viewed: "Opened alert", str: "Drafted STR", role: "Switched role" };
</script>

<div class="bar">
  <span class="muted">{log.length} event{log.length === 1 ? "" : "s"} · stored in this browser (in Snowflake: the CASES table + ACCESS_HISTORY)</span>
  <button class="btn" disabled={!log.length} onclick={() => download("muletrace_audit_log.json", JSON.stringify(log, null, 2), "application/json")}>⭳ Export</button>
</div>
{#if !log.length}
  <div class="empty">No decisions yet. Escalate, close or file an alert and it will be recorded here with who, what and when.</div>
{:else}
  <ol class="log">
    {#each [...log].reverse() as e}
      <li>
        <div class="when">{new Date(e.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
        <div>
          <b>{LABEL[e.action] || e.action}</b>
          {#if e.finding}<button class="link" onclick={() => onselectFinding(e.finding)}>{e.finding}</button>{/if}
          <div class="who">{e.role === "principal" ? "Principal Officer" : "Investigator"}{#if e.note} · “{e.note}”{/if}</div>
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; }
  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 24px 8px; text-align: center; }
  .log { list-style: none; margin: 0; padding: 0; }
  .log li { display: grid; grid-template-columns: 92px 1fr; gap: 10px; padding: 10px 12px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; font-size: 13px; }
  .when { color: var(--muted); font-size: 12px; }
  .who { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .link { background: none; border: none; color: #1d4ed8; font-weight: 600; padding: 0 0 0 4px; }
</style>
