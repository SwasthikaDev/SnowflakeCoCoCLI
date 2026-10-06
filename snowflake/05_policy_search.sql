-- MuleTrace · 05 · Cortex Search over policy and regulatory text (the unstructured half)

USE WAREHOUSE MULETRACE_WH;
USE SCHEMA MULETRACE.APP;

CREATE OR REPLACE CORTEX SEARCH SERVICE POLICY_SEARCH
  ON CHUNK_TEXT
  ATTRIBUTES DOC_ID, SECTION, HEADING
  WAREHOUSE = MULETRACE_WH
  TARGET_LAG = '1 day'
  COMMENT = 'AML-04 internal policy + Indian regulatory obligations, one row per section'
AS (
  SELECT CHUNK_ID, DOC_ID, DOC_TITLE, SECTION, HEADING, HEADING || ': ' || CHUNK_TEXT AS CHUNK_TEXT, SOURCE
  FROM MULETRACE.CORE.POLICY_CHUNKS
);

-- Smoke test
SELECT PARSE_JSON(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'MULETRACE.APP.POLICY_SEARCH',
    '{"query": "deadline to file a suspicious transaction report", "columns": ["CHUNK_ID", "HEADING"], "limit": 3}'
  )
):results AS RESULTS;
