import { complete, configured, runAgent } from "./_snowflake.js";

const SYSTEM = `You are MuleTrace, an AML and fraud copilot for an Indian bank's investigators and Principal Officer.
Answer ONLY from the EVIDENCE and POLICY text provided. Never invent accounts, amounts, dates or clauses.
Be concise (under 180 words), use Markdown, bold key figures, and cite clauses like "AML-04 §3.2" or "REG-IN §2" and finding IDs like "F001".
If the evidence does not answer the question, say so and suggest what to check next.`;

export async function onRequestPost({ request, env }) {
  if (!configured(env)) return Response.json({ error: "Snowflake not configured" }, { status: 501 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = String(body.question || "").slice(0, 1000);
  const evidence = String(body.evidence || "").slice(0, 8000);
  const policies = (body.policies || []).slice(0, 4).map((p) => `[${p.id}]\n${String(p.text).slice(0, 2000)}`).join("\n\n");
  if (!question) return Response.json({ error: "question required" }, { status: 400 });

  try {
    if (env.SNOWFLAKE_AGENT) {
      const text = await runAgent(env, question);
      if (text) return Response.json({ text, source: "cortex-agent" });
    }
    const text = await complete(env, SYSTEM, `QUESTION:\n${question}\n\nEVIDENCE (computed from the transaction graph):\n${evidence}\n\nPOLICY:\n${policies || "(none retrieved)"}`);
    return Response.json({ text, source: "cortex-complete" });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
