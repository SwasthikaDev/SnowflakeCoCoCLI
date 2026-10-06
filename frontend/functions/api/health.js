import { configured } from "./_snowflake.js";

export const onRequestGet = ({ env }) =>
  Response.json({
    snowflake: configured(env),
    agent: configured(env) ? env.SNOWFLAKE_AGENT || null : null,
    mode: !configured(env) ? "local" : env.SNOWFLAKE_AGENT ? "cortex-agent" : "cortex-complete",
  });
