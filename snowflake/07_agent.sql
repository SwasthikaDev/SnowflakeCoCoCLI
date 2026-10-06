-- MuleTrace · 07 · Cortex Agent: one copilot over numbers (Cortex Analyst) and policy text (Cortex Search)
-- The Cloudflare app calls this agent through the REST API when SNOWFLAKE_AGENT=MULETRACE.APP.MULETRACE_AGENT is set.

USE WAREHOUSE MULETRACE_WH;
USE SCHEMA MULETRACE.APP;

CREATE OR REPLACE AGENT MULETRACE_AGENT
  COMMENT = 'Risk, Fraud & Regulatory Intelligence Copilot'
  PROFILE = '{"display_name": "MuleTrace", "color": "red"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    budget:
      seconds: 45
      tokens: 16000

  instructions:
    orchestration: >
      For questions about money, accounts, transfers, findings, mules, risk scores or totals, use TransactionAnalyst.
      For questions about rules, obligations, thresholds, deadlines, STR filing, KYC or record keeping, use PolicySearch.
      When a question asks whether something breaches policy, use both: first get the facts, then the clause.
    response: >
      You are MuleTrace, an AML copilot for an Indian bank's fraud investigators and Principal Officer.
      Answer only from tool results. Never invent accounts, amounts, dates or clauses.
      Be concise, use INR with lakh/crore, bold key figures, and cite finding IDs (e.g. F001) and policy clauses (e.g. AML-04 §3.2, REG-IN §2).
      Remind the user that STRs are due to FIU-IND within 7 working days of the suspicion decision when relevant,
      and never suggest informing the customer (tipping-off).
    sample_questions:
      - question: "Which accounts received over 5 lakh in transfers under 1,000 rupees?"
      - question: "How much money moved through mule networks this month, by typology?"
      - question: "Explain finding F001 and the policy clause it breaches"
      - question: "What is our deadline to file an STR?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "TransactionAnalyst"
        description: "Answers quantitative questions over transactions, accounts, detected laundering networks (findings) and account risk scores."
    - tool_spec:
        type: "cortex_search"
        name: "PolicySearch"
        description: "Searches the bank's AML-04 mule-account policy and a summary of Indian AML reporting obligations (PMLA, PML Rules, RBI KYC Master Direction)."

  tool_resources:
    TransactionAnalyst:
      semantic_view: "MULETRACE.APP.MULETRACE_SV"
    PolicySearch:
      search_service: "MULETRACE.APP.POLICY_SEARCH"
      max_results: "4"
      title_column: "HEADING"
      id_column: "CHUNK_ID"
  $$;

GRANT USAGE ON AGENT MULETRACE_AGENT TO ROLE MULETRACE_INVESTIGATOR;
