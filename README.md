# MuleTrace — Risk, Fraud & Regulatory Intelligence Copilot

**Snowflake CoCo Hackathon 2026 – GCC Edition** · Problem statement: *Risk, Fraud and Regulatory Intelligence Copilot*

> ₹10 lakh can leave a bank as 2,000 harmless-looking ₹500 UPI transfers through 100 mule accounts.
> No single transfer trips a rule. MuleTrace sees the **network**, explains it with **evidence and policy**,
> and drafts the **Suspicious Transaction Report** — from a plain-English question.

| | |
|---|---|
| 📊 **Deck** | [`deck/MuleTrace_MVP_Brief.pptx`](deck/MuleTrace_MVP_Brief.pptx) |
| 🖥️ **App** | Svelte investigator workspace (`frontend/`), deployable to Cloudflare Pages |
| ❄️ **Snowflake** | Numbered SQL in [`snowflake/`](snowflake/) + custom CoCo skill in [`.cortex/skills/`](.cortex/skills/muletrace-investigate/SKILL.md) |

## What it does — signal → evidence → finding → report

1. **Signal.** A graph detector ([`backend/detector.py`](backend/detector.py)) scans every transaction for four laundering typologies as *time-ordered graph patterns*, not single-transaction rules:

   | Typology | Detected when (defaults, configurable per policy) |
   |---|---|
   | Structuring / smurfing | ≥10 senders each make ≥5 transfers ≤₹2,000 to one account, mostly the same amount, >₹1 L in total |
   | Fan-out → fan-in | one account pays ≥8 mules who forward ≥70% to one collector within 72 h |
   | Layering chain | ≥₹10k hops through ≥4 accounts, each hop ≤24 h later, keeping ≥85% |
   | Round-trip cycle | money returns to its origin within 7 days, keeping ≥80% |

2. **Evidence.** Every alert carries its exact transactions, account roles (source, mule, collector, exit…), KYC red flags (new account, minimum KYC, inflow ≫ declared income), an explainable risk score, and the **policy clause it breaches**.
3. **Finding.** Investigators record decisions (escalate / request info / close); every action lands in an audit log. Names are **masked** unless the user is the Principal Officer.
4. **Report.** One click drafts the STR for FIU-IND — subjects, transactions, grounds of suspicion, policy basis, recommended actions, and the **7-working-day deadline** — exportable as Markdown, CSV annex or PDF.

The **copilot** answers questions such as *"Which accounts received over ₹5 lakh in sub-₹1,000 transfers?"*, *"Where did the money from AC… go within 48 hours?"* or *"What is our STR deadline?"* with cited findings, accounts and policy clauses.

### Measured on the demo data

The synthetic month (10,259 transactions, 603 accounts) hides four schemes **plus legitimate look-alikes** — society dues (80 identical payments to one account), weekly gym subscriptions, and parent→student→landlord transfers — to test precision honestly.

| Precision | Recall | Findings | Runtime |
|---|---|---|---|
| **100%** (2,092 / 2,092 flagged txns are planted fraud) | **99.95%** (2,092 / 2,093) | 6 networks, 154 accounts, ₹30.07 L | ~0.1 s for 10k txns |

The one missed transaction is the victim's original payment into the fan-out source, which by design isn't part of the mule network.

## Architecture

```
 Sources                    Snowflake (governed boundary)                                       Experience
┌──────────────────┐   ┌───────────────┐   ┌──────────────────────────┐   ┌────────────────────┐   ┌─────────────────────┐
│ Structured       │──▶│ RAW.TRANSACT- │──▶│ Dynamic Tables           │──▶│ Cortex Agent        │──▶│ MuleTrace app       │
│ core banking/UPI │   │ IONS/ACCOUNTS │   │ PAIR_FLOWS, ACCOUNT_FLOWS│   │  ├ Cortex Analyst   │   │ Svelte · Cloudflare │
│ accounts & KYC   │   └───────────────┘   │ Snowpark RUN_DETECTOR ──▶│   │  │  (semantic view) │   │ Pages (+ /api/ask   │
├──────────────────┤   ┌───────────────┐   │ FINDINGS, ACCOUNT_RISK   │   │  ├ Cortex Search    │   │ → Cortex REST)      │
│ Unstructured     │──▶│ POLICY_DOCS   │──▶│ POLICY_CHUNKS ──▶ Cortex │──▶│  │  (policy text)   │   │ alert queue · graph │
│ AML policy, RBI/ │   │ stage +       │   │ Search service           │   │  └ AI_COMPLETE      │   │ copilot · STR · log │
│ PMLA obligations │   │ AI_PARSE_DOC  │   └──────────────────────────┘   │     (STR narrative) │   └─────────────────────┘
└──────────────────┘   └───────────────┘   Governance: masking policy on PII · tags · ACCESS_HISTORY audit · least-privilege roles
```

| Step | Snowflake object | Script | CoCo CLI skill used to build it |
|---|---|---|---|
| Ingest | `RAW.TRANSACTIONS`, `RAW.ACCOUNTS`, `POLICY_DOCS` stage | [`01`](snowflake/01_setup.sql), [`02`](snowflake/02_load.sql) | `openflow`, `document-intelligence` |
| Features | Dynamic Tables `PAIR_FLOWS`, `ACCOUNT_FLOWS` | [`03`](snowflake/03_features.sql) | `dynamic-tables` |
| Detect | Snowpark proc `RUN_DETECTOR` + hourly task | [`04`](snowflake/04_detector.sql) | `snowpark-python`, `snowflake-tasks` |
| Policy search | Cortex Search `APP.POLICY_SEARCH` | [`05`](snowflake/05_policy_search.sql) | `search-optimization` |
| NL → SQL | Semantic view `APP.MULETRACE_SV` | [`06`](snowflake/06_semantic_view.sql) | `agent-studio` |
| Copilot | Cortex Agent `APP.MULETRACE_AGENT` | [`07`](snowflake/07_agent.sql) | `agent-studio` |
| Governance | masking policies, tags, access audit view | [`08`](snowflake/08_governance.sql) | `data-governance`, `lineage` |
| Cases & STR | `CASES`, `EVIDENCE_PACKS`, `DRAFT_STR` (AI_COMPLETE), alert | [`09`](snowflake/09_cases_and_str.sql) | `ai-functions-pipeline-builder`, `alert` |
| Analyst workflow | custom skill `$muletrace-investigate` | [`.cortex/skills`](.cortex/skills/muletrace-investigate/SKILL.md) | `skill-development` |

Modules talk only through tables, so a new typology, another UI or a different detector plugs in without touching the rest. The **same `detector.py`** runs locally and inside Snowflake.

## Run it locally (2 minutes)

```bash
# 1. Generate data, run detection, build the app's data file
python backend/pipeline.py

# 2. Start the investigator app
cd frontend && npm install && npm run dev      # → http://localhost:5173
```

No Snowflake account is needed for the demo: the copilot's evidence engine runs in the browser. With Snowflake configured, answers are written by Cortex.

## Deploy

**Snowflake** (with the [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/index), from the repo root):

```bash
for f in snowflake/0*.sql; do snow sql -f "$f"; done
```

**Cloudflare Pages:** connect this repo in the Cloudflare dashboard with root directory `frontend`, build command `npm run build`, output directory `dist`. To switch the copilot to Snowflake Cortex, add these secrets:

| Variable | Example |
|---|---|
| `SNOWFLAKE_ACCOUNT_URL` | `https://<org>-<account>.snowflakecomputing.com` |
| `SNOWFLAKE_PAT` | programmatic access token for a role granted `MULETRACE_INVESTIGATOR` |
| `SNOWFLAKE_AGENT` *(optional)* | `MULETRACE.APP.MULETRACE_AGENT` |

## Repository

```
backend/    generator.py (synthetic bank) · detector.py (graph detection) · pipeline.py (end-to-end)
data/       transactions.csv · accounts.csv · policy_chunks.csv · policies/*.md
frontend/   Svelte app · functions/api (Cloudflare Pages Functions → Snowflake Cortex REST)
snowflake/  01–09 numbered SQL: setup → load → features → detector → search → semantic view → agent → governance → cases/STR
.cortex/    custom CoCo CLI skill
deck/       submission deck + generator
```

*All data is synthetic. The policy documents are a fictional bank policy and a plain-language summary of Indian AML obligations for demo purposes, not legal advice.*
