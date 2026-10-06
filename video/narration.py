"""Narration script for the MuleTrace demo video. Each scene = one voiceover clip + one visual.

kind: "slide" (deck slide image), "terminal" (real pipeline run), or "app" (recorded browser session).
"""

VOICE = "en-IN-NeerjaNeural"
RATE = "+12%"

SCENES = [
    {"id": "01_title", "kind": "slide", "slide": 1, "text":
        "This is MuleTrace, a risk, fraud and regulatory intelligence copilot for banks and NBFCs. "
        "It finds mule-account networks hidden in transaction data, explains each one with evidence and policy, "
        "and drafts an audit-ready suspicious transaction report."},
    {"id": "02_problem", "kind": "slide", "slide": 3, "text":
        "Here is the problem. Ten lakh rupees can leave a bank as two thousand transfers of five hundred rupees, "
        "through a hundred mule accounts. Every transfer sits below every threshold, so no rule fires. "
        "The fraud is only visible as a network."},
    {"id": "03_pipeline", "kind": "terminal", "text":
        "Let's run it end to end. The input is a synthetic month of banking data: ten thousand transactions, "
        "six hundred accounts with KYC details, and our AML policy documents. "
        "Processing: the graph detector scans every transaction for four laundering typologies. "
        "The output is six suspicious networks, ranked by risk. Because the data carries hidden ground-truth labels, "
        "we can score ourselves: one hundred percent precision and ninety-nine point nine five percent recall, "
        "in about a tenth of a second."},
    {"id": "04_overview", "kind": "app", "text":
        "This is the investigator workspace, live on Cloudflare. The header shows the month at a glance: "
        "transactions, accounts, networks found, and thirty lakh rupees at risk. "
        "On the left is the alert queue, ranked by risk, with a filter by typology. "
        "The canvas draws every network the detector found: a structuring ring, two layering chains, "
        "a fan-out and fan-in, and two round-trip cycles."},
    {"id": "05_evidence", "kind": "app", "text":
        "Let's open the top alert, F zero zero one. A hundred accounts sent two thousand small transfers to one collector, "
        "eighty-four percent of them exactly five hundred rupees. The risk score of ninety-eight is fully explainable: "
        "pattern detected, amount at stake, account red flags, and pattern strength. "
        "Below it is the exact clause the network breaches, AML-04 section 3.2, quoted with its source document, "
        "followed by every account and every transaction, exportable as a CSV evidence pack."},
    {"id": "06_account", "kind": "app", "text":
        "Clicking an account opens its profile. This collector was opened just thirty-one days before the activity, "
        "holds minimum KYC, and received sixty-three times its declared monthly income. "
        "Its counterparties are listed, and the graph highlights its neighbourhood. "
        "Names stay masked, because an investigator doesn't need personal data to triage."},
    {"id": "07_typologies", "kind": "app", "text":
        "The same evidence exists for every typology. F zero zero five is a fan-out and fan-in: one source splits money "
        "across thirty mules, just under ten thousand rupees each, and they pass ninety-nine percent of it to one collector "
        "within hours. F zero zero two is a layering chain: seven and a half lakh rupees hop through six accounts in twelve hours. "
        "F zero zero three is a round trip: money loops through four accounts and comes back home."},
    {"id": "08_copilot", "kind": "app", "text":
        "Now the copilot. Ask in plain English: which accounts received over five lakh rupees in transfers under a thousand? "
        "It finds the collector, links the finding, and quotes the policy clause. "
        "Ask it to trace money, and it follows the funds from the fan-out source through thirty mules to one account "
        "within forty-eight hours. Ask a regulatory question, and it answers from the policy text: "
        "an STR is due to FIU-IND within seven working days. Every answer lists its sources."},
    {"id": "09_decision_str", "kind": "app", "text":
        "Every alert ends in a documented decision. The investigator adds a note and escalates to the Principal Officer. "
        "Switching the role to Principal Officer unmasks names, just as a Snowflake masking policy would. "
        "One click drafts the suspicious transaction report: subjects, transactions, grounds of suspicion, policy basis, "
        "recommended actions, and the filing deadline. Only the Principal Officer can mark it filed, "
        "and every step lands in the audit log."},
    {"id": "10_architecture", "kind": "slide", "slide": 13, "text":
        "Under the hood, MuleTrace is designed Snowflake-native. Transactions and policy documents land in Snowflake. "
        "Dynamic Tables keep flow features fresh. The same Python detector runs as a Snowpark procedure. "
        "Cortex Search indexes the policies, and a Cortex Agent combines a semantic view with search, "
        "so every answer carries both numbers and citations."},
    {"id": "11_coco", "kind": "slide", "slide": 14, "text":
        "The workflow is packaged as three modular CoCo CLI skills: ingest for input, detect for processing, "
        "and investigate for output. Each is a reusable skill, versioned in the repository."},
    {"id": "12_results", "kind": "slide", "slide": 17, "text":
        "The results: every planted scheme caught, no legitimate look-alikes flagged, and a complete path from signal, "
        "to evidence, to a filed report."},
    {"id": "13_close", "kind": "slide", "slide": 22, "text":
        "MuleTrace. Follow the money, and file with confidence."},
]
