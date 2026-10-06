-- MuleTrace · 06 · Semantic view: lets Cortex Analyst turn plain-English questions into governed SQL

USE WAREHOUSE MULETRACE_WH;
USE SCHEMA MULETRACE.APP;

CREATE OR REPLACE SEMANTIC VIEW MULETRACE_SV
  TABLES (
    txns AS MULETRACE.RAW.TRANSACTIONS PRIMARY KEY (TXN_ID)
      COMMENT = 'Every money transfer between accounts (UPI, IMPS, NEFT)',
    accounts AS MULETRACE.RAW.ACCOUNTS PRIMARY KEY (ACCOUNT_ID)
      COMMENT = 'Account master data with KYC level, branch and declared income',
    findings AS MULETRACE.CORE.FINDINGS PRIMARY KEY (FINDING_ID)
      COMMENT = 'Suspicious networks detected by the MuleTrace graph detector',
    finding_accounts AS MULETRACE.CORE.FINDING_ACCOUNTS PRIMARY KEY (FINDING_ID, ACCOUNT_ID)
      COMMENT = 'Which accounts take part in which finding, and their role (mule, collector, source, ...)',
    account_risk AS MULETRACE.CORE.ACCOUNT_RISK PRIMARY KEY (ACCOUNT_ID)
      COMMENT = 'Latest risk score per flagged account'
  )
  RELATIONSHIPS (
    txn_sender AS txns (FROM_ACCOUNT) REFERENCES accounts,
    member_finding AS finding_accounts (FINDING_ID) REFERENCES findings,
    member_account AS finding_accounts (ACCOUNT_ID) REFERENCES accounts,
    risk_account AS account_risk (ACCOUNT_ID) REFERENCES accounts
  )
  FACTS (
    txns.amount AS AMOUNT COMMENT = 'Transfer amount in INR',
    findings.network_amount AS TOTAL_AMOUNT COMMENT = 'Money laundered through the network, INR',
    account_risk.risk AS RISK_SCORE COMMENT = 'Account risk score 0-100'
  )
  DIMENSIONS (
    txns.txn_id AS TXN_ID,
    txns.txn_time AS TIMESTAMP COMMENT = 'When the transfer happened',
    txns.txn_date AS DATE(TIMESTAMP),
    txns.sender AS FROM_ACCOUNT WITH SYNONYMS = ('from account', 'payer', 'debit account'),
    txns.receiver AS TO_ACCOUNT WITH SYNONYMS = ('to account', 'beneficiary', 'payee', 'credit account'),
    txns.channel AS CHANNEL WITH SYNONYMS = ('payment mode', 'rail'),
    accounts.account_id AS ACCOUNT_ID,
    accounts.segment AS SEGMENT,
    accounts.branch AS BRANCH,
    accounts.kyc_level AS KYC_LEVEL COMMENT = 'FULL or MIN (minimum KYC)',
    accounts.opened_on AS OPENED_ON,
    findings.finding_id AS FINDING_ID,
    findings.typology AS PATTERN WITH SYNONYMS = ('pattern', 'scheme', 'typology') COMMENT = 'Structuring / smurfing, Fan-out → fan-in, Layering chain, Round-trip cycle',
    findings.severity AS SEVERITY,
    findings.policy_ref AS POLICY_REF COMMENT = 'Clause of policy AML-04 that the finding breaches',
    finding_accounts.role AS ROLE WITH SYNONYMS = ('mule', 'collector', 'source') COMMENT = 'Role of the account inside the network'
  )
  METRICS (
    txns.total_amount AS SUM(txns.amount) COMMENT = 'Total value transferred',
    txns.transfer_count AS COUNT(txns.txn_id),
    txns.small_transfer_count AS COUNT_IF(txns.amount <= 2000) COMMENT = 'Transfers of ₹2,000 or less',
    findings.amount_at_risk AS SUM(findings.network_amount) COMMENT = 'Money moved through suspicious networks',
    findings.network_count AS COUNT(findings.finding_id),
    account_risk.flagged_accounts AS COUNT(account_risk.account_id),
    account_risk.max_risk AS MAX(account_risk.risk)
  )
  COMMENT = 'MuleTrace: transactions, accounts and detected laundering networks';
