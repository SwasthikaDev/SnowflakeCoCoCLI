---
name: muletrace-investigate
description: Investigate a MuleTrace laundering alert end to end in Snowflake — pull the evidence pack, explain the network, check the policy clause, record a decision, and draft the STR.
tools:
- sql_execute
---

# When to Use

- The user asks to investigate, explain or triage a MuleTrace finding (e.g. "investigate F001", "what's in the alert queue?")
- The user asks whether an account or network breaches AML policy
- The user wants an STR drafted or a case decision recorded

# What This Skill Provides

A repeatable, auditable investigation workflow over the MULETRACE database:
`CORE.FINDINGS` (signals) → `CORE.EVIDENCE_PACKS` (evidence) → `CORE.CASES` (documented decision) → `CORE.STR_DRAFTS` (report).
Policy text lives in `CORE.POLICY_CHUNKS` and the `APP.POLICY_SEARCH` Cortex Search service.

# Instructions

1. **Alert queue.** If no finding is named, list open alerts:
   ```sql
   SELECT f.FINDING_ID, f.PATTERN, f.SEVERITY, f.RISK_SCORE, f.TOTAL_AMOUNT, f.TITLE
   FROM MULETRACE.CORE.FINDINGS f
   WHERE f.FINDING_ID NOT IN (SELECT FINDING_ID FROM MULETRACE.CORE.CASES WHERE STATUS IN ('closed', 'filed'))
   ORDER BY f.RISK_SCORE DESC, f.TOTAL_AMOUNT DESC;
   ```
2. **Evidence pack.** For the chosen finding:
   ```sql
   SELECT * FROM MULETRACE.CORE.EVIDENCE_PACKS WHERE FINDING_ID = '<id>';
   ```
   Summarise: typology, amount (INR, lakh/crore), period, number of accounts and their roles, red flags, risk breakdown.
3. **Trace the money** when asked where funds went:
   ```sql
   SELECT t.* FROM MULETRACE.RAW.TRANSACTIONS t
   JOIN MULETRACE.CORE.FINDING_TXNS ft ON ft.TXN_ID = t.TXN_ID
   WHERE ft.FINDING_ID = '<id>' ORDER BY t.TIMESTAMP;
   ```
4. **Policy check.** Quote the clause in `POLICY_REF` (e.g. AML-04 §3) from `MULETRACE.CORE.POLICY_CHUNKS`, plus `REG-IN §2` for the STR deadline.
5. **Record the decision** only after the user confirms it:
   ```sql
   INSERT INTO MULETRACE.CORE.CASES (FINDING_ID, STATUS, NOTE) VALUES ('<id>', 'escalated', '<investigator note>');
   ```
6. **Draft the STR** when the Principal Officer asks: `CALL MULETRACE.CORE.DRAFT_STR('<id>');`

## Best Practices

- Never state a fact that is not in the query results; show the SQL you ran.
- Never reveal or infer customer names unless the session role is MULETRACE_PRINCIPAL_OFFICER (names are masked otherwise).
- Never suggest contacting the customer about an STR (tipping-off, AML-04 §8.5).
- Always mention the 7-working-day STR deadline once suspicion is confirmed (REG-IN §2).

# Examples

## Example 1: Triage

User: $muletrace-investigate what should I look at first?
Assistant: Lists open alerts by risk, recommends the top one, and summarises its evidence pack.

## Example 2: Full investigation

User: $muletrace-investigate F001
Assistant: Pulls the evidence pack, explains the structuring network (100 senders → 1 collector, ₹9.94 L in ₹500 transfers),
quotes AML-04 §3.2, lists the collector's red flags, and offers to record an escalation and draft the STR.
