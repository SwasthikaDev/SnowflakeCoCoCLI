// Shared helpers for calling Snowflake Cortex REST APIs from Cloudflare Pages Functions.
//
// Required secrets (Pages → Settings → Variables and Secrets):
//   SNOWFLAKE_ACCOUNT_URL   e.g. https://<org>-<account>.snowflakecomputing.com
//   SNOWFLAKE_PAT           a programmatic access token for a role that can use Cortex
// Optional:
//   SNOWFLAKE_AGENT         fully qualified agent, e.g. MULETRACE.APP.MULETRACE_AGENT (uses the Cortex Agent)
//   SNOWFLAKE_MODEL         model for AI_COMPLETE fallback (default: claude-sonnet-4-5)

export const configured = (env) => Boolean(env.SNOWFLAKE_ACCOUNT_URL && env.SNOWFLAKE_PAT);

function headers(env) {
  return {
    Authorization: `Bearer ${env.SNOWFLAKE_PAT}`,
    "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/json",
  };
}

/** Collect text from an SSE or JSON response produced by Cortex endpoints. */
async function collectText(res) {
  const body = await res.text();
  if (!body.includes("data:")) {
    try {
      const j = JSON.parse(body);
      return j.choices?.[0]?.message?.content ?? j.message?.content?.map?.((c) => c.text).join("") ?? "";
    } catch {
      return body;
    }
  }
  let deltas = "";
  let final = "";
  let event = "";
  for (const line of body.split("\n")) {
    if (line.startsWith("event:")) { event = line.slice(6).trim(); continue; }
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    let d;
    try { d = JSON.parse(raw); } catch { continue; }
    if (event === "response.text.delta" && d.text) deltas += d.text;
    else if (event === "response" && Array.isArray(d.content)) {
      final = d.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    } else if (d.choices?.[0]?.delta) {
      deltas += d.choices[0].delta.content ?? d.choices[0].delta.text ?? "";
    }
  }
  return final || deltas;
}

export async function runAgent(env, question) {
  const [db, schema, name] = env.SNOWFLAKE_AGENT.split(".");
  const url = `${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/databases/${db}/schemas/${schema}/agents/${name}:run`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text: question }] }] }),
  });
  if (!res.ok) throw new Error(`agent ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return collectText(res);
}

export async function complete(env, system, user) {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/inference:complete`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      model: env.SNOWFLAKE_MODEL || "claude-sonnet-4-5",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 900,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`complete ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return collectText(res);
}
