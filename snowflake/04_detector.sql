-- MuleTrace · 04 · Graph detector as a Snowpark Python stored procedure + scheduled task
-- The SAME backend/detector.py used locally runs here (pure standard library, no extra packages).
-- Run from the repository root:  snow sql -f snowflake/04_detector.sql

USE WAREHOUSE MULETRACE_WH;
USE SCHEMA MULETRACE.CORE;

CREATE STAGE IF NOT EXISTS CODE;
PUT file://backend/detector.py @CODE AUTO_COMPRESS = FALSE OVERWRITE = TRUE;

CREATE TABLE IF NOT EXISTS FINDINGS (
  FINDING_ID STRING, RUN_AT TIMESTAMP_LTZ, TYPOLOGY STRING, PATTERN STRING, SEVERITY STRING, RISK_SCORE NUMBER,
  TOTAL_AMOUNT NUMBER(16, 2), GROSS_FLOW NUMBER(16, 2), TXN_COUNT NUMBER, ACCOUNT_COUNT NUMBER,
  TITLE STRING, SUMMARY STRING, POLICY_REF STRING, FIRST_SEEN TIMESTAMP_NTZ, LAST_SEEN TIMESTAMP_NTZ,
  METRICS VARIANT, RISK_BREAKDOWN VARIANT
);
CREATE TABLE IF NOT EXISTS FINDING_ACCOUNTS (FINDING_ID STRING, ACCOUNT_ID STRING, ROLE STRING, RED_FLAGS ARRAY);
CREATE TABLE IF NOT EXISTS FINDING_TXNS (FINDING_ID STRING, TXN_ID STRING);
CREATE TABLE IF NOT EXISTS ACCOUNT_RISK (ACCOUNT_ID STRING, RISK_SCORE NUMBER, ROLES VARIANT, RED_FLAGS ARRAY, RUN_AT TIMESTAMP_LTZ);

CREATE OR REPLACE PROCEDURE RUN_DETECTOR(CONFIG VARIANT DEFAULT NULL)
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python')
  IMPORTS = ('@MULETRACE.CORE.CODE/detector.py')
  HANDLER = 'run'
  COMMENT = 'Detects structuring, fan-out/fan-in, layering and round-trip networks; writes FINDINGS*, ACCOUNT_RISK'
AS
$$
import json
from datetime import datetime, timezone
from detector import analyze, parse_rows

def run(session, config):
    txn_rows = [r.as_dict() for r in session.table("MULETRACE.RAW.TRANSACTIONS")
                .select("TXN_ID", "TIMESTAMP", "FROM_ACCOUNT", "TO_ACCOUNT", "AMOUNT", "CHANNEL").collect()]
    meta = {}
    for r in session.table("MULETRACE.RAW.ACCOUNTS").collect():
        d = {k.lower(): ("" if v is None else str(v)) for k, v in r.as_dict().items()}
        meta[d["account_id"]] = d
    result = analyze(parse_rows(txn_rows), meta, json.loads(str(config)) if config else None)
    now = datetime.now(timezone.utc)

    findings, fa, ft = [], [], []
    for f in result["findings"]:
        findings.append([f["id"], now, f["type"], f["pattern"], f["severity"], f["risk_score"], f["total_amount"],
                         f["gross_flow"], f["txn_count"], len(f["accounts"]), f["title"], f["summary"], f["policy_ref"],
                         f["first_seen"], f["last_seen"], json.dumps(f["metrics"]), json.dumps(f["risk_breakdown"])])
        fa += [[f["id"], a, role, json.dumps(f["account_flags"].get(a, []))] for a, role in f["accounts"].items()]
        ft += [[f["id"], t] for t in f["txn_ids"]]
    risk = [[n["id"], n["risk"], json.dumps(n["roles"]), json.dumps(n["flags"]), now] for n in result["nodes"] if n["roles"]]

    def overwrite(table, rows, cols, variant_cols=()):
        tmp = f"{table}_STAGE"
        if not rows:
            session.sql(f"TRUNCATE TABLE {table}").collect()
            return
        session.create_dataframe(rows, schema=cols).write.mode("overwrite").save_as_table(tmp, table_type="temporary")
        select = ", ".join(f"PARSE_JSON({c})" if c in variant_cols else c for c in cols)
        session.sql(f"TRUNCATE TABLE {table}").collect()
        session.sql(f"INSERT INTO {table} SELECT {select} FROM {tmp}").collect()

    overwrite("MULETRACE.CORE.FINDINGS", findings,
              ["FINDING_ID", "RUN_AT", "TYPOLOGY", "PATTERN", "SEVERITY", "RISK_SCORE", "TOTAL_AMOUNT", "GROSS_FLOW",
               "TXN_COUNT", "ACCOUNT_COUNT", "TITLE", "SUMMARY", "POLICY_REF", "FIRST_SEEN", "LAST_SEEN", "METRICS",
               "RISK_BREAKDOWN"], {"METRICS", "RISK_BREAKDOWN"})
    overwrite("MULETRACE.CORE.FINDING_ACCOUNTS", fa, ["FINDING_ID", "ACCOUNT_ID", "ROLE", "RED_FLAGS"], {"RED_FLAGS"})
    overwrite("MULETRACE.CORE.FINDING_TXNS", ft, ["FINDING_ID", "TXN_ID"])
    overwrite("MULETRACE.CORE.ACCOUNT_RISK", risk, ["ACCOUNT_ID", "RISK_SCORE", "ROLES", "RED_FLAGS", "RUN_AT"],
              {"ROLES", "RED_FLAGS"})
    return {k: v for k, v in result["summary"].items() if k != "evaluation"}
$$;

-- Run once now…
CALL RUN_DETECTOR();
SELECT FINDING_ID, PATTERN, SEVERITY, RISK_SCORE, TOTAL_AMOUNT, TITLE FROM FINDINGS ORDER BY TOTAL_AMOUNT DESC;

-- …and every hour after that.
CREATE OR REPLACE TASK DETECT_HOURLY
  WAREHOUSE = MULETRACE_WH
  SCHEDULE = '60 MINUTE'
  COMMENT = 'Re-runs the MuleTrace graph detector on fresh transactions'
AS CALL MULETRACE.CORE.RUN_DETECTOR();
ALTER TASK DETECT_HOURLY RESUME;
