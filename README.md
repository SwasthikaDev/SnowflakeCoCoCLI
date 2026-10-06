# MuleTrace — Risk, Fraud & Regulatory Intelligence Copilot

Submission for the **Snowflake CoCo Hackathon 2026 – GCC Edition**.

MuleTrace finds mule-account networks in bank transactions (for example ₹10 lakh moved as
2,000 × ₹500 transfers through 100 accounts), explains each finding with policy evidence,
and drafts an audit-ready Suspicious Transaction Report (STR) from a plain-English question.

## Detected typologies
| Pattern | What it looks like |
|---|---|
| Structuring / smurfing | Many accounts send repeated, near-identical small amounts to one collector |
| Fan-out → fan-in | Funds split across mules just under limits, then regrouped within hours |
| Layering chain | A large sum hops through 4+ accounts quickly, keeping most of its value |
| Round-trip cycle | Money returns to the account it started from |

## Repository layout
```
backend/   Python — synthetic data generator (detector + API in progress)
deck/      Prototype / MVP brief (MuleTrace_MVP_Brief.pptx) and its generator script
```

## Synthetic data
```bash
cd backend
python generator.py sample_transactions.csv
```
Produces a month of normal banking activity with four planted laundering schemes. The `label`
column is ground truth used only to score the detector.

## Rebuilding the deck
```bash
cd deck
npm install
node build_deck.js
```
