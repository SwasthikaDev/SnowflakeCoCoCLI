-- MuleTrace · 09 · Findings → documented cases → STR drafts, plus alerting
-- Signal (FINDINGS) → evidence (EVIDENCE_PACKS view) → finding/decision (CASES) → report (STR_DRAFTS)

USE WAREHOUSE MULETRACE_WH;
USE SCHEMA MULETRACE.CORE;

CREATE TABLE IF NOT EXISTS CASES (
  FINDING_ID STRING, STATUS STRING, DECIDED_BY STRING DEFAULT CURRENT_USER(), DECIDED_ROLE STRING DEFAULT CURRENT_ROLE(),
  NOTE STRING, DECIDED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP()
) COMMENT = 'Append-only decision log: escalated / info / closed / filed';

CREATE TABLE IF NOT EXISTS STR_DRAFTS (
  FINDING_ID STRING, DRAFTED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(), DUE_BY DATE, GROUNDS_OF_SUSPICION STRING, MODEL STRING
);

-- Everything an investigator (or auditor) needs for one finding, in one row.
CREATE OR REPLACE VIEW EVIDENCE_PACKS AS
SELECT
  f.FINDING_ID, f.PATTERN, f.SEVERITY, f.RISK_SCORE, f.TOTAL_AMOUNT, f.TITLE, f.SUMMARY, f.POLICY_REF,
  f.FIRST_SEEN, f.LAST_SEEN, f.METRICS, f.RISK_BREAKDOWN,
  (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('account', fa.ACCOUNT_ID, 'role', fa.ROLE, 'red_flags', fa.RED_FLAGS))
     FROM FINDING_ACCOUNTS fa WHERE fa.FINDING_ID = f.FINDING_ID) AS ACCOUNTS,
  (SELECT COUNT(*) FROM FINDING_TXNS ft WHERE ft.FINDING_ID = f.FINDING_ID) AS EVIDENCE_TXNS,
  (SELECT LISTAGG(p.HEADING || ': ' || p.CHUNK_TEXT, '\n\n') FROM POLICY_CHUNKS p
     WHERE p.CHUNK_ID IN (f.POLICY_REF, 'AML-04 §8', 'REG-IN §2')) AS POLICY_TEXT
FROM FINDINGS f;

-- Draft the "grounds of suspicion" narrative with Cortex, strictly from the evidence pack.
CREATE OR REPLACE PROCEDURE DRAFT_STR(FINDING STRING, MODEL STRING DEFAULT 'mistral-large2')
  RETURNS STRING
  LANGUAGE SQL
AS
$$
DECLARE
  narrative STRING;
BEGIN
  SELECT AI_COMPLETE(
           :MODEL,
           'You are drafting the "grounds of suspicion" section of a Suspicious Transaction Report for FIU-IND. ' ||
           'Use ONLY the facts below. Write 150-220 words, formal tone, no speculation, cite the policy clauses. ' ||
           'Do not include customer names.\n\nEVIDENCE:\n' || TO_VARCHAR(OBJECT_CONSTRUCT(
             'finding', FINDING_ID, 'pattern', PATTERN, 'amount_inr', TOTAL_AMOUNT, 'title', TITLE, 'summary', SUMMARY,
             'period', FIRST_SEEN || ' to ' || LAST_SEEN, 'metrics', METRICS, 'accounts', ACCOUNTS)) ||
           '\n\nPOLICY:\n' || POLICY_TEXT)
    INTO :narrative
    FROM EVIDENCE_PACKS WHERE FINDING_ID = :FINDING;

  INSERT INTO STR_DRAFTS (FINDING_ID, DUE_BY, GROUNDS_OF_SUSPICION, MODEL)
  -- 7 working days ≈ 9 calendar days when no holiday calendar is loaded
  SELECT :FINDING, DATEADD(day, 9, CURRENT_DATE()), :narrative, :MODEL;
  RETURN narrative;
END;
$$;

-- Example:  CALL DRAFT_STR('F001');

-- Alert the compliance inbox when a new critical network appears (needs an email notification integration).
-- CREATE NOTIFICATION INTEGRATION MULETRACE_EMAIL TYPE = EMAIL ENABLED = TRUE ALLOWED_RECIPIENTS = ('compliance@yourbank.example');
-- CREATE OR REPLACE ALERT CRITICAL_NETWORK_ALERT
--   WAREHOUSE = MULETRACE_WH SCHEDULE = '60 MINUTE'
--   IF (EXISTS (SELECT 1 FROM FINDINGS WHERE SEVERITY = 'critical'
--               AND FINDING_ID NOT IN (SELECT FINDING_ID FROM CASES)))
--   THEN CALL SYSTEM$SEND_EMAIL('MULETRACE_EMAIL', 'compliance@yourbank.example',
--        'MuleTrace: new critical laundering network', 'Open MuleTrace to review the alert queue.');
-- ALTER ALERT CRITICAL_NETWORK_ALERT RESUME;
