<script>
  import { marked } from "marked";
  import { buildSTR, evidenceCSV } from "./str.js";
  import { download } from "./format.js";

  let { D, finding, pii, caseState, role, onfiled } = $props();

  let md = $derived(finding ? buildSTR(D, finding, { pii, caseNote: caseState?.note || "" }) : "");
  const filed = $derived(caseState?.status === "filed");
</script>

{#if !finding}
  <div class="empty">Select an alert to draft its Suspicious Transaction Report.</div>
{:else}
  <div class="bar">
    <button class="btn" onclick={() => download(`STR_${finding.id}.md`, md, "text/markdown")}>⭳ Markdown</button>
    <button class="btn" onclick={() => download(`${finding.id}_annexA.csv`, evidenceCSV(D, finding), "text/csv")}>⭳ Annex A (CSV)</button>
    <button class="btn" onclick={() => window.print()}>Print / PDF</button>
    <span class="spacer"></span>
    {#if filed}
      <span class="chip" style="background:#dff3ef;color:#11685e">✓ Filed</span>
    {:else}
      <button class="btn teal" disabled={role !== "principal"} title={role !== "principal" ? "Only the Principal Officer can file an STR — switch role in the header" : ""} onclick={() => onfiled(finding.id)}>Mark as filed</button>
    {/if}
  </div>
  {#if !pii}<div class="hint">Names are masked for the Investigator role. Switch to Principal Officer to see full subject details before filing.</div>{/if}
  <article class="md printable">{@html marked.parse(md)}</article>
{/if}

<style>
  .empty { color: var(--muted); padding: 24px 8px; text-align: center; }
  .bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; position: sticky; top: 0; background: var(--bg); padding: 4px 0 8px; z-index: 1; }
  .spacer { flex: 1; }
  .hint { font-size: 12px; color: #4b3bb5; background: #efeaff; border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); font-size: 13px; }
</style>
