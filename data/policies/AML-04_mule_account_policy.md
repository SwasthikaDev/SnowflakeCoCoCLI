# AML-04 — Mule Account & Transaction Monitoring Policy

*Synthetic internal policy of a fictional bank, written for the MuleTrace demo. Version 3.1, effective 1 April 2026. Owner: Principal Officer, AML Compliance.*

## §1 Purpose and scope
This policy sets out how the Bank detects, investigates and reports accounts used to receive, move or layer the proceeds of crime ("mule accounts"). It applies to all savings, current and wallet-linked accounts and to all channels, including UPI, IMPS, NEFT, RTGS and cash.

## §2 Definitions
A **mule account** is an account, opened by or rented from a real customer, that is used to receive and pass on illicit funds. A **collector** is an account that consolidates funds from many mules. A **typology** is a recognised pattern of laundering behaviour. **Value retained** is the share of an incoming amount that is passed on to the next account.

## §3 Structuring and smurfing
§3.1 Structuring means splitting a large sum into many small transactions to stay below monitoring thresholds or limits.
§3.2 The following is a red flag requiring an alert: ten or more unrelated accounts each sending five or more transfers of ₹2,000 or less to the same account, where most transfers share an identical amount and the combined value exceeds ₹1 lakh.
§3.3 The mirror pattern — one account distributing many identical small amounts to many accounts — is treated the same way.
§3.4 Legitimate exceptions include fixed-fee collections (housing societies, schools, subscriptions) where each payer pays once per period and the receiving entity is a verified organisation.

## §4 Rapid fan-out and fan-in
§4.1 A red flag arises when one account sends funds to eight or more accounts, and those accounts forward 70% or more of what they received to a single common account within 72 hours.
§4.2 Amounts kept just below ₹10,000 per transfer are an aggravating factor, as they suggest deliberate avoidance of channel limits or enhanced checks.
§4.3 The intermediate accounts are presumed to be mules until the investigation shows otherwise.

## §5 Layering through account chains
§5.1 Layering is the movement of funds through a succession of accounts to distance them from their source.
§5.2 A red flag arises when an amount of ₹10,000 or more passes through four or more consecutive accounts, each hop occurring within 24 hours of the previous one and retaining at least 85% of the value.
§5.3 The final account in the chain ("exit") and any account that receives funds and immediately withdraws them in cash must be prioritised for freezing review.

## §6 Round-tripping
§6.1 Round-tripping is the circular movement of funds that returns to the originating account, often to inflate turnover, obtain credit, or obscure the origin of funds.
§6.2 A red flag arises when funds of ₹10,000 or more leave an account and return to it through two or more other accounts within seven days, retaining at least 80% of the value.
§6.3 Round-tripping involving borrowers must also be notified to the Credit Risk team, as it may indicate inflated turnover in loan applications.

## §7 Account-level risk indicators
The following raise the risk score of an account involved in any red-flag pattern:
§7.1 The account was opened within the last 90 days.
§7.2 The account holds minimum-KYC status.
§7.3 Monthly inflows exceed five times the declared monthly income.
§7.4 The account has many unrelated counterparties with no business rationale.

## §8 Investigation, escalation and reporting
§8.1 Every alert must be reviewed by an investigator, who records the evidence considered and a decision: escalate, close as false positive, or request more information.
§8.2 Escalated cases go to the Principal Officer, who decides whether the transactions are suspicious.
§8.3 Once the Principal Officer concludes that a transaction or series of integrally connected transactions is suspicious, a Suspicious Transaction Report (STR) must be filed with FIU-IND within seven working days.
§8.4 The reasons for treating transactions as suspicious must be recorded in writing and kept with the case file.
§8.5 Staff must not disclose to the customer, or to anyone else, that an STR is being considered or has been filed (no tipping-off).
§8.6 Accounts in a confirmed mule network must be considered for debit freeze and reported to law-enforcement portals as per the Bank's cyber-fraud procedures.

## §9 Record keeping and audit
§9.1 Alerts, evidence, decisions and filed reports must be retained for at least five years.
§9.2 Every answer, alert and report produced by automated systems must be traceable to its source transactions and to the policy clause that was applied.
§9.3 Access to customer personal data during investigations is limited to authorised roles; personal identifiers are masked for all other users.
