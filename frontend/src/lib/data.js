/** Loads the pipeline output and builds the lookup indexes the UI and copilot need. */
export async function loadData(url = "/data/analysis.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const d = await res.json();

  const txns = d.all_txns.map(([id, ts, src, dst, amount, channel]) => ({ id, ts, src, dst, amount, channel }));
  delete d.all_txns;
  const outBy = new Map();
  const inBy = new Map();
  for (const t of txns) {
    (outBy.get(t.src) ?? outBy.set(t.src, []).get(t.src)).push(t);
    (inBy.get(t.dst) ?? inBy.set(t.dst, []).get(t.dst)).push(t);
  }

  return {
    ...d,
    txns,
    outBy,
    inBy,
    txnById: new Map(txns.map((t) => [t.id, t])),
    nodeById: new Map(d.nodes.map((n) => [n.id, n])),
    findingById: new Map(d.findings.map((f) => [f.id, f])),
    policyById: new Map(d.policies.map((p) => [p.id, p])),
  };
}

/** Policy sections cited for a finding: the typology clause, account-indicator clause, and reporting duty. */
export function policiesForFinding(D, f) {
  const ids = [f.policy_ref];
  if (Object.keys(f.account_flags || {}).length) ids.push("AML-04 §7");
  ids.push("AML-04 §8", "REG-IN §2");
  return ids.map((id) => D.policyById.get(id)).filter(Boolean);
}

export function findingTxns(D, f) {
  return f.txn_ids.map((id) => D.txnById.get(id)).filter(Boolean).sort((a, b) => a.ts.localeCompare(b.ts));
}
