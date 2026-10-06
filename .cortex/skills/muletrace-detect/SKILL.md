---
name: muletrace-detect
description: PROCESSING step of the MuleTrace workflow — build flow features, run the Snowpark graph detector, and rank the laundering networks it finds.
tools:
- sql_execute
- bash
---

# When to Use

- After `$muletrace-ingest`, or whenever new transactions land
- The user asks "scan for mule networks", "run detection", or "what's suspicious?"

# What This Skill Provides

Turns raw transactions into ranked, explainable signals:

1. **Dynamic Tables** `CORE.PAIR_FLOWS` and `CORE.ACCOUNT_FLOWS` (incremental flow features).
2. **Snowpark procedure** `CORE.RUN_DETECTOR()` running `backend/detector.py`, which finds four typologies as time-ordered graph patterns:
   structuring / smurfing, fan-out → fan-in, layering chains, round-trip cycles.
3. Writes `CORE.FINDINGS`, `CORE.FINDING_ACCOUNTS`, `CORE.FINDING_TXNS`, `CORE.ACCOUNT_RISK`.

# Instructions

1. Run `snowflake/03_features.sql` (dynamic tables) and `snowflake/04_detector.sql` (stages the detector, creates and calls the procedure, schedules the hourly task).
2. Show the ranked alert queue:
   ```sql
   SELECT FINDING_ID, PATTERN, SEVERITY, RISK_SCORE, TOTAL_AMOUNT, ACCOUNT_COUNT, TITLE
   FROM MULETRACE.CORE.FINDINGS ORDER BY TOTAL_AMOUNT DESC;
   ```
3. Explain the top finding in two sentences (who sent what to whom, how fast, how much).
4. Show the risk breakdown for it: `SELECT RISK_BREAKDOWN FROM MULETRACE.CORE.FINDINGS WHERE FINDING_ID = 'F001';`
5. (Demo data only, as ACCOUNTADMIN) prove accuracy against the hidden labels:
   ```sql
   SELECT COUNT_IF(t.LABEL <> 'normal') AS caught_fraud, COUNT(*) AS flagged
   FROM MULETRACE.CORE.FINDING_TXNS ft JOIN MULETRACE.RAW.TRANSACTIONS t USING (TXN_ID);
   ```
   Expected: 2,092 flagged, 2,092 fraud (100% precision).

## Best Practices

- Present amounts in INR with lakh/crore.
- Thresholds live in `detector.DEFAULTS`; pass overrides as `CALL RUN_DETECTOR(PARSE_JSON('{"smurf_min_senders": 8}'))`.

# Examples

User: $muletrace-detect scan this month's transactions
Assistant: Builds features, runs the detector, and lists 6 networks led by F001 — ₹9.94 L moved into one account as 2,000 small transfers from 100 accounts.
