# MuleTrace demo video: script (target 4:00, hard limit 5:00)

Requirement: an end-to-end workflow executed via CoCo CLI, Input → Processing → Output, with 2–3 modular skills.
Record at 1920×1080 with the terminal font at 16–18 pt. Speak over the recording or add captions.

**Before recording (not on camera):** CoCo CLI is connected (`cortex` opens without errors), you are in the repo root, and
`python backend/pipeline.py` has been run once. Do one full dry run so the warehouse is warm, then reset with
`DROP DATABASE MULETRACE;` so the recording shows a clean load.

| Time | Screen | What you type / do | What you say |
|---|---|---|---|
| 0:00–0:20 | Title slide (deck slide 1) | — | "₹10 lakh can leave a bank as 2,000 harmless ₹500 transfers through 100 mule accounts. No rule fires. MuleTrace sees the network, explains it and drafts the STR, built with Snowflake CoCo CLI." |
| 0:20–0:35 | Terminal: `cortex` | `/skill list` | "Three custom skills, one per stage: ingest, detect, investigate." |
| 0:35–1:20 | **INPUT** | `$muletrace-ingest load the demo bank data` | "Input: a month of transactions, account KYC data, and our AML policy text, structured and unstructured, into Snowflake." Pause on the row counts (10,259 / 603 / 17) and the sample rows. |
| 1:20–2:20 | **PROCESSING** | `$muletrace-detect scan this month's transactions` | "Processing: Dynamic Tables build flow features, then a Snowpark procedure runs our graph detector." Pause on the ranked findings table. "Six networks. The top one: ₹9.94 lakh into one account from 100 senders, 84% of transfers exactly ₹500." Show the precision query: "Every flagged transaction is planted fraud: 100% precision." |
| 2:20–3:30 | **OUTPUT** | `$muletrace-investigate F001` then answer "yes, escalate" and "draft the STR" | "Output: the evidence pack, the policy clause it breaches (AML-04 §3.2), the account red flags, a logged decision, and a Suspicious Transaction Report drafted with Cortex AI_COMPLETE, due to FIU-IND in 7 working days." |
| 3:30–3:55 | Browser: muletrace.pages.dev/?finding=F001 | Click F001, click an account, open the STR tab | "The same findings in the investigator app: the network, the evidence and the one-click STR." |
| 3:55–4:10 | Closing slide | — | "MuleTrace: follow the money, file with confidence. Code and live demo are on the slide." |

**Fallbacks:** if a step is slow, cut the wait in editing (keep the command and the result on screen).
If Cortex Agent isn't available in your region, use `$muletrace-investigate`, which runs on SQL and AI_COMPLETE only.
