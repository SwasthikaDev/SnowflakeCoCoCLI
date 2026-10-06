---
name: muletrace-ingest
description: INPUT step of the MuleTrace workflow — set up the MULETRACE database and load transactions, accounts and AML policy text into Snowflake, then verify the load.
tools:
- sql_execute
- bash
---

# When to Use

- The user asks to set up MuleTrace, load bank data, or refresh the demo data
- Before running `$muletrace-detect` on a new account

# What This Skill Provides

Loads the three inputs the copilot reasons over:

| Input | Type | Lands in |
|---|---|---|
| `data/transactions.csv` | structured | `MULETRACE.RAW.TRANSACTIONS` |
| `data/accounts.csv` (KYC, branch, declared income) | structured | `MULETRACE.RAW.ACCOUNTS` |
| `data/policies/*.md` → `data/policy_chunks.csv` | unstructured | `MULETRACE.CORE.POLICY_CHUNKS` + `@RAW.POLICY_DOCS` |

# Instructions

1. If `data/transactions.csv` is missing, generate it: `python backend/pipeline.py` (synthetic month with planted laundering schemes).
2. Run `snowflake/01_setup.sql` (database, schemas, warehouse, roles, raw tables, stages).
3. Run `snowflake/02_load.sql` from the repository root (PUT + COPY INTO).
4. Verify and report the row counts:
   ```sql
   SELECT 'transactions' t, COUNT(*) n FROM MULETRACE.RAW.TRANSACTIONS
   UNION ALL SELECT 'accounts', COUNT(*) FROM MULETRACE.RAW.ACCOUNTS
   UNION ALL SELECT 'policy sections', COUNT(*) FROM MULETRACE.CORE.POLICY_CHUNKS;
   ```
   Expected for the demo data: 10,259 transactions, 603 accounts, 17 policy sections.
5. Show a 5-row sample of transactions so the user sees the input.

## Best Practices

- Never print `LABEL` values to the user; it is ground truth for scoring only.
- If a script fails, show the error, fix the SQL, and re-run only that statement.

# Examples

User: $muletrace-ingest load the demo bank data
Assistant: Runs setup and load, then reports "10,259 transactions, 603 accounts, 17 policy sections loaded" with a sample.
