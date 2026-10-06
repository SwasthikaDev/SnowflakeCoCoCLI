# MuleTrace demo video: narration script

Video: `video/MuleTrace_demo.mp4` (4:48, 1080p, voiceover + burned-in captions; captions also in `video/MuleTrace_demo.srt`).
Rebuild: `cd video && python make_audio.py && python record.py && python compose.py`.

## 0:00 · Title
*Deck slide 1*

This is MuleTrace, a risk, fraud and regulatory intelligence copilot for banks and NBFCs. It finds mule-account networks hidden in transaction data, explains each one with evidence and policy, and drafts an audit-ready suspicious transaction report.

## 0:16 · Problem
*Deck slide 3*

Here is the problem. Ten lakh rupees can leave a bank as two thousand transfers of five hundred rupees, through a hundred mule accounts. Every transfer sits below every threshold, so no rule fires. The fraud is only visible as a network.

## 0:33 · Pipeline
*Terminal: real pipeline run (input → processing → output)*

Let's run it end to end. The input is a synthetic month of banking data: ten thousand transactions, six hundred accounts with KYC details, and our AML policy documents. Processing: the graph detector scans every transaction for four laundering typologies. The output is six suspicious networks, ranked by risk. Because the data carries hidden ground-truth labels, we can score ourselves: one hundred percent precision and ninety-nine point nine five percent recall, in about a tenth of a second.

## 1:05 · Overview
*Live app at muletrace.pages.dev (recorded)*

This is the investigator workspace, live on Cloudflare. The header shows the month at a glance: transactions, accounts, networks found, and thirty lakh rupees at risk. On the left is the alert queue, ranked by risk, with a filter by typology. The canvas draws every network the detector found: a structuring ring, two layering chains, a fan-out and fan-in, and two round-trip cycles.

## 1:31 · Evidence
*Live app at muletrace.pages.dev (recorded)*

Let's open the top alert, F zero zero one. A hundred accounts sent two thousand small transfers to one collector, eighty-four percent of them exactly five hundred rupees. The risk score of ninety-eight is fully explainable: pattern detected, amount at stake, account red flags, and pattern strength. Below it is the exact clause the network breaches, AML-04 section 3.2, quoted with its source document, followed by every account and every transaction, exportable as a CSV evidence pack.

## 2:04 · Account
*Live app at muletrace.pages.dev (recorded)*

Clicking an account opens its profile. This collector was opened just thirty-one days before the activity, holds minimum KYC, and received sixty-three times its declared monthly income. Its counterparties are listed, and the graph highlights its neighbourhood. Names stay masked, because an investigator doesn't need personal data to triage.

## 2:26 · Typologies
*Live app at muletrace.pages.dev (recorded)*

The same evidence exists for every typology. F zero zero five is a fan-out and fan-in: one source splits money across thirty mules, just under ten thousand rupees each, and they pass ninety-nine percent of it to one collector within hours. F zero zero two is a layering chain: seven and a half lakh rupees hop through six accounts in twelve hours. F zero zero three is a round trip: money loops through four accounts and comes back home.

## 2:54 · Copilot
*Live app at muletrace.pages.dev (recorded)*

Now the copilot. Ask in plain English: which accounts received over five lakh rupees in transfers under a thousand? It finds the collector, links the finding, and quotes the policy clause. Ask it to trace money, and it follows the funds from the fan-out source through thirty mules to one account within forty-eight hours. Ask a regulatory question, and it answers from the policy text: an STR is due to FIU-IND within seven working days. Every answer lists its sources.

## 3:26 · Decision Str
*Live app at muletrace.pages.dev (recorded)*

Every alert ends in a documented decision. The investigator adds a note and escalates to the Principal Officer. Switching the role to Principal Officer unmasks names, just as a Snowflake masking policy would. One click drafts the suspicious transaction report: subjects, transactions, grounds of suspicion, policy basis, recommended actions, and the filing deadline. Only the Principal Officer can mark it filed, and every step lands in the audit log.

## 3:56 · Architecture
*Deck slide 13*

Under the hood, MuleTrace is designed Snowflake-native. Transactions and policy documents land in Snowflake. Dynamic Tables keep flow features fresh. The same Python detector runs as a Snowpark procedure. Cortex Search indexes the policies, and a Cortex Agent combines a semantic view with search, so every answer carries both numbers and citations.

## 4:21 · Coco
*Deck slide 14*

The workflow is packaged as three modular CoCo CLI skills: ingest for input, detect for processing, and investigate for output. Each is a reusable skill, versioned in the repository.

## 4:34 · Results
*Deck slide 17*

The results: every planted scheme caught, no legitimate look-alikes flagged, and a complete path from signal, to evidence, to a filed report.

## 4:43 · Close
*Deck slide 22*

MuleTrace. Follow the money, and file with confidence.
