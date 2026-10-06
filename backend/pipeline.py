"""End-to-end local pipeline: generate data -> detect -> attach policy evidence -> write app data.

    python pipeline.py            # regenerate synthetic data and rebuild frontend/public/data/*.json
    python pipeline.py --no-gen   # re-run detection on the existing data/*.csv (e.g. your own export)
"""
import argparse
import csv
import json
import re
from pathlib import Path

from detector import analyze, parse_rows
from generator import ACCOUNT_FIELDS, TXN_FIELDS, generate, to_csv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "frontend" / "public" / "data"


def load_policies(folder: Path):
    """Split each policy markdown file into one chunk per '## §N' section."""
    chunks = []
    for path in sorted(folder.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        doc_title = text.splitlines()[0].lstrip("# ").strip()
        doc_id = doc_title.split(" ")[0]
        for m in re.finditer(r"^## (§\d+) (.+?)\n(.*?)(?=^## |\Z)", text, flags=re.S | re.M):
            sec, heading, body = m.group(1), m.group(2).strip(), m.group(3).strip()
            chunks.append({"id": f"{doc_id} {sec}", "doc": doc_title, "section": sec, "heading": heading,
                           "text": body, "source": f"data/policies/{path.name}"})
    return chunks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-gen", action="store_true", help="use existing data/*.csv instead of regenerating")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    DATA.mkdir(exist_ok=True)
    if not args.no_gen:
        txns, accounts = generate(args.seed)
        (DATA / "transactions.csv").write_text(to_csv(txns, TXN_FIELDS), encoding="utf-8")
        (DATA / "accounts.csv").write_text(to_csv(accounts, ACCOUNT_FIELDS), encoding="utf-8")

    with open(DATA / "transactions.csv", encoding="utf-8") as f:
        txns = parse_rows(csv.DictReader(f))
    meta = {}
    if (DATA / "accounts.csv").exists():
        with open(DATA / "accounts.csv", encoding="utf-8") as f:
            meta = {r["account_id"]: r for r in csv.DictReader(f)}

    result = analyze(txns, meta)
    policies = load_policies(DATA / "policies")
    chunk_rows = [{"chunk_id": p["id"], "doc_id": p["id"].split(" ")[0], "doc_title": p["doc"], "section": p["section"],
                   "heading": p["heading"], "chunk_text": p["text"], "source": p["source"]} for p in policies]
    (DATA / "policy_chunks.csv").write_text(to_csv(chunk_rows, list(chunk_rows[0])), encoding="utf-8")
    result["policies"] = policies
    # compact copy of every transaction so the copilot can answer ad-hoc questions in the browser
    result["all_txns"] = [[t.id, t.ts.isoformat(timespec="minutes"), t.src, t.dst, t.amount, t.channel] for t in txns]
    result.pop("transactions")  # flagged subset is derivable from all_txns + findings

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "analysis.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    s = result["summary"]
    print(f"{s['transactions']:,} txns · {s['accounts']} accounts · {s['findings']} findings · "
          f"{s['flagged_accounts']} flagged accounts")
    if "evaluation" in s:
        e = s["evaluation"]
        print(f"precision {e['precision']:.2%} · recall {e['recall']:.2%} "
              f"({e['true_positive_txns']}/{e['planted_fraud_txns']} planted fraud txns)")
    for f in result["findings"]:
        print(f"  {f['id']} {f['severity']:<8} risk {f['risk_score']:>3}  {f['title']}")
    print(f"wrote {OUT / 'analysis.json'} ({(OUT / 'analysis.json').stat().st_size / 1e6:.1f} MB), "
          f"{len(policies)} policy sections")


if __name__ == "__main__":
    main()
