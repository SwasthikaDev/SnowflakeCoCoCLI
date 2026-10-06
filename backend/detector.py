"""Graph-based detection of money-mule and laundering patterns in bank transactions.

Pure standard library, so the same module runs locally, in a Snowpark Python
stored procedure inside Snowflake, or anywhere else Python runs.

Four typologies are detected as time-ordered patterns over the account graph:
  structuring      many senders -> one collector in repeated, near-identical small amounts
  fan_out_fan_in   one source -> many mules -> one collector, mules pass most of the money on quickly
  layering         a large sum hops through a chain of accounts, keeping most of its value
  round_trip       money returns to the account it left from
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta

DEFAULTS = {
    # structuring / smurfing
    "small_amount": 2_000, "smurf_min_repeat": 5, "smurf_min_senders": 10,
    "smurf_min_total": 100_000, "smurf_mode_share": 0.5,
    # fan-out -> fan-in
    "fan_min_mules": 8, "fan_window_h": 72, "fan_pass_ratio": 0.7,
    # layering chains
    "chain_min_hops": 4, "chain_window_h": 24, "chain_min_ratio": 0.85, "chain_min_amount": 10_000,
    # round trips
    "cycle_max_len": 6, "cycle_window_h": 168, "cycle_min_ratio": 0.8, "cycle_min_amount": 10_000,
    # account context
    "new_account_days": 90, "income_multiple": 5,
}

PATTERNS = {
    "structuring": {"name": "Structuring / smurfing", "weight": 35, "policy": "AML-04 §3"},
    "fan_out_fan_in": {"name": "Fan-out → fan-in", "weight": 40, "policy": "AML-04 §4"},
    "layering": {"name": "Layering chain", "weight": 40, "policy": "AML-04 §5"},
    "round_trip": {"name": "Round-trip cycle", "weight": 45, "policy": "AML-04 §6"},
}

# how strongly each role implicates an account (multiplies the pattern weight)
ROLE_FACTOR = {"collector": 0.95, "distributor": 0.95, "source": 0.9, "exit": 0.95, "layer": 0.8,
               "cycle_member": 0.9, "mule": 0.65, "entry": 0.3}


@dataclass(frozen=True)
class Txn:
    id: str
    ts: datetime
    src: str
    dst: str
    amount: float
    channel: str = ""
    label: str = ""


# ---------------------------------------------------------------- parsing

_ALIASES = {
    "id": ["txn_id", "transaction_id", "id", "txn", "reference"],
    "ts": ["timestamp", "datetime", "date_time", "txn_time", "date", "time"],
    "src": ["from_account", "from", "sender", "source", "debit_account", "payer"],
    "dst": ["to_account", "to", "receiver", "beneficiary", "credit_account", "payee"],
    "amount": ["amount", "amt", "value", "amount_inr"],
    "channel": ["channel", "mode", "payment_mode"],
    "label": ["label", "is_fraud", "ground_truth"],
}
_TS_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S",
               "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"]


def _parse_ts(value: str) -> datetime:
    value = value.strip()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        pass
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError(f"unrecognised timestamp: {value!r}")


def parse_rows(rows) -> list[Txn]:
    """Turn CSV-style dicts into Txn objects, accepting common column-name variants."""
    rows = list(rows)
    if not rows:
        return []
    keys = {k.strip().lower(): k for k in rows[0].keys()}
    col = {}
    for field, names in _ALIASES.items():
        col[field] = next((keys[n] for n in names if n in keys), None)
    missing = [f for f in ("ts", "src", "dst", "amount") if col[f] is None]
    if missing:
        raise ValueError(f"missing required columns for: {', '.join(missing)} (found: {', '.join(keys)})")
    out = []
    for i, r in enumerate(rows, 1):
        amount = float(str(r[col["amount"]]).replace(",", "").replace("₹", "").strip())
        out.append(Txn(
            id=str(r[col["id"]]) if col["id"] else f"R{i:07d}",
            ts=_parse_ts(str(r[col["ts"]])),
            src=str(r[col["src"]]).strip(), dst=str(r[col["dst"]]).strip(), amount=amount,
            channel=str(r[col["channel"]]) if col["channel"] else "",
            label=str(r[col["label"]]) if col["label"] else "",
        ))
    out.sort(key=lambda t: t.ts)
    return out


# ---------------------------------------------------------------- helpers

def _fmt_inr(x: float) -> str:
    if x >= 1e7:
        return f"₹{x / 1e7:.2f} Cr"
    if x >= 1e5:
        return f"₹{x / 1e5:.2f} L"
    return f"₹{x:,.0f}"


class _OutIndex:
    """Outgoing transactions per account, sorted by time, for fast 'what happened next' queries."""

    def __init__(self, txns):
        self.by_acct = defaultdict(list)
        for t in txns:
            self.by_acct[t.src].append(t)
        self.times = {a: [t.ts for t in lst] for a, lst in self.by_acct.items()}

    def after(self, acct, start, until):
        lst = self.by_acct.get(acct)
        if not lst:
            return
        i = bisect_right(self.times[acct], start)
        while i < len(lst) and lst[i].ts <= until:
            yield lst[i]
            i += 1


def _finding(kind, accounts, txns, title, summary, metrics=None, value=None):
    """`value` is the money actually laundered (not double-counted across hops); defaults to the sum of txns."""
    gross = sum(t.amount for t in txns)
    total = gross if value is None else value
    return {
        "type": kind,
        "pattern": PATTERNS[kind]["name"],
        "policy_ref": PATTERNS[kind]["policy"],
        "title": title,
        "summary": summary,
        "accounts": accounts,  # {account_id: role}
        "txn_ids": [t.id for t in txns],
        "txn_count": len(txns),
        "total_amount": round(total, 2),
        "gross_flow": round(gross, 2),
        "first_seen": min(t.ts for t in txns).isoformat(timespec="seconds"),
        "last_seen": max(t.ts for t in txns).isoformat(timespec="seconds"),
        "metrics": metrics or {},
    }


# ---------------------------------------------------------------- detectors

def detect_structuring(txns, cfg):
    pair = defaultdict(list)
    for t in txns:
        if t.amount <= cfg["small_amount"]:
            pair[(t.src, t.dst)].append(t)
    findings = []
    for hub_is_receiver in (True, False):
        groups = defaultdict(list)
        for (s, d), lst in pair.items():
            if len(lst) >= cfg["smurf_min_repeat"]:
                hub, spoke = (d, s) if hub_is_receiver else (s, d)
                groups[hub].append((spoke, lst))
        for hub, spokes in groups.items():
            if len(spokes) < cfg["smurf_min_senders"]:
                continue
            all_t = [t for _, lst in spokes for t in lst]
            total = sum(t.amount for t in all_t)
            if total < cfg["smurf_min_total"]:
                continue
            common_amt, n = Counter(round(t.amount) for t in all_t).most_common(1)[0]
            share = n / len(all_t)
            if share < cfg["smurf_mode_share"]:
                continue
            hub_role, spoke_role = ("collector", "mule") if hub_is_receiver else ("distributor", "mule")
            accounts = {s: spoke_role for s, _ in spokes}
            accounts[hub] = hub_role
            direction = "into" if hub_is_receiver else "out of"
            findings.append(_finding(
                "structuring", accounts, all_t,
                f"{_fmt_inr(total)} {direction} {hub} as {len(all_t):,} small transfers",
                f"{len(spokes)} accounts made {len(all_t):,} transfers of ≤{_fmt_inr(cfg['small_amount'])} "
                f"{'to' if hub_is_receiver else 'from'} {hub}; {share:.0%} were exactly {_fmt_inr(common_amt)}. "
                f"Each transfer is individually below thresholds, but together they move {_fmt_inr(total)}.",
                {"hub": hub, "spokes": len(spokes), "common_amount": common_amt, "common_share": round(share, 3)},
            ))
    return findings


def detect_fan_out_fan_in(txns, cfg):
    into = defaultdict(lambda: defaultdict(list))
    out = defaultdict(lambda: defaultdict(list))
    for t in txns:
        into[t.dst][t.src].append(t)
        out[t.src][t.dst].append(t)
    window = timedelta(hours=cfg["fan_window_h"])
    pairs = defaultdict(list)
    for m, senders in into.items():
        receivers = out.get(m)
        if not receivers:
            continue
        for s, ins in senders.items():
            received = sum(t.amount for t in ins)
            first = min(t.ts for t in ins)
            for d, outs in receivers.items():
                if d == s:
                    continue
                fwd = [t for t in outs if first <= t.ts <= first + window]
                if fwd and sum(t.amount for t in fwd) >= cfg["fan_pass_ratio"] * received:
                    pairs[(s, d)].append((m, ins, fwd))
    findings = []
    for (s, d), mules in pairs.items():
        if len(mules) < cfg["fan_min_mules"]:
            continue
        all_t = [t for _, ins, fwd in mules for t in ins + fwd]
        sent = sum(t.amount for _, ins, _ in mules for t in ins)
        regrouped = sum(t.amount for _, _, fwd in mules for t in fwd)
        delays = sorted((min(t.ts for t in fwd) - min(t.ts for t in ins)).total_seconds() / 3600 for _, ins, fwd in mules)
        accounts = {m: "mule" for m, _, _ in mules}
        accounts[s] = "source"
        accounts[d] = "collector"
        findings.append(_finding(
            "fan_out_fan_in", accounts, all_t,
            f"{_fmt_inr(sent)} split across {len(mules)} mules and regrouped at {d}",
            f"{s} sent {_fmt_inr(sent)} to {len(mules)} accounts; they passed {regrouped / sent:.0%} of it on to {d}, "
            f"with a median delay of {delays[len(delays) // 2]:.1f} h.",
            {"source": s, "collector": d, "mules": len(mules), "pass_through": round(regrouped / sent, 3),
             "median_delay_h": round(delays[len(delays) // 2], 2)},
            value=sent,
        ))
    return findings


def _temporal_paths(start_txns, idx, *, min_amount, lo, hi, hop_window=None, deadline=None, close_at=None, max_len=8):
    """Depth-first search over time-ordered, value-preserving transaction paths."""
    results = []

    def nxt(t, until):
        for u in idx.after(t.dst, t.ts, until):
            if u.amount >= min_amount and lo * t.amount <= u.amount <= hi * t.amount:
                yield u

    def dfs(path, seen, until_fn):
        last = path[-1]
        if close_at is not None and last.dst == close_at:
            results.append(list(path))
            return
        extended = False
        if len(path) < max_len:
            for u in nxt(last, until_fn(last)):
                if u.dst in seen and u.dst != close_at:
                    continue
                extended = True
                path.append(u)
                seen.add(u.dst)
                dfs(path, seen, until_fn)
                seen.discard(u.dst)
                path.pop()
                if len(results) > 2000:
                    return
        if close_at is None and not extended:
            results.append(list(path))

    for t in start_txns:
        if t.src == t.dst:
            continue
        if deadline is not None:
            end = t.ts + deadline
            dfs([t], {t.src, t.dst}, lambda _last, end=end: end)
        else:
            dfs([t], {t.src, t.dst}, lambda last: last.ts + hop_window)
    return results


def detect_round_trips(txns, idx, cfg):
    found = {}
    for t in txns:
        if t.amount < cfg["cycle_min_amount"]:
            continue
        for path in _temporal_paths([t], idx, min_amount=cfg["cycle_min_amount"], lo=cfg["cycle_min_ratio"], hi=1.05,
                                    deadline=timedelta(hours=cfg["cycle_window_h"]), close_at=t.src,
                                    max_len=cfg["cycle_max_len"]):
            ring = [p.src for p in path]
            k = ring.index(min(ring))
            key = tuple(ring[k:] + ring[:k])
            found.setdefault(key, path)
    findings = []
    for ring, path in found.items():
        hours = (path[-1].ts - path[0].ts).total_seconds() / 3600
        kept = path[-1].amount / path[0].amount
        findings.append(_finding(
            "round_trip", {a: "cycle_member" for a in ring}, path,
            f"{_fmt_inr(path[0].amount)} looped through {len(ring)} accounts back to {path[0].src}",
            f"Funds left {path[0].src} and returned within {hours:.0f} h via {' → '.join(ring[1:])}, "
            f"with {kept:.1%} of the value intact — consistent with round-tripping to fake turnover or obscure origin.",
            {"ring": list(ring), "hours": round(hours, 1), "value_kept": round(kept, 4)},
            value=path[0].amount,
        ))
    return findings


def detect_layering(txns, idx, cfg, exclude_txn_ids=frozenset()):
    cand = [t for t in txns if t.amount >= cfg["chain_min_amount"]]
    window = timedelta(hours=cfg["chain_window_h"])
    # a chain starts at a transaction that no qualifying hop leads into
    has_pred = set()
    for t in cand:
        for u in idx.after(t.dst, t.ts, t.ts + window):
            if u.amount >= cfg["chain_min_amount"] and cfg["chain_min_ratio"] * t.amount <= u.amount <= t.amount:
                has_pred.add(u.id)
    starts = [t for t in cand if t.id not in has_pred]
    paths = _temporal_paths(starts, idx, min_amount=cfg["chain_min_amount"], lo=cfg["chain_min_ratio"], hi=1.0,
                            hop_window=window, max_len=12)
    findings, seen = [], set()
    for path in paths:
        if len(path) < cfg["chain_min_hops"]:
            continue
        ids = frozenset(p.id for p in path)
        if ids <= exclude_txn_ids or ids in seen:
            continue
        seen.add(ids)
        chain = [path[0].src] + [p.dst for p in path]
        accounts = {a: "layer" for a in chain}
        accounts[chain[0]] = "entry"
        accounts[chain[-1]] = "exit"
        hours = (path[-1].ts - path[0].ts).total_seconds() / 3600
        kept = path[-1].amount / path[0].amount
        findings.append(_finding(
            "layering", accounts, path,
            f"{_fmt_inr(path[0].amount)} layered through {len(path)} hops in {hours:.1f} h",
            f"Funds moved {' → '.join(chain)} in {hours:.1f} h; {kept:.1%} of the value reached {chain[-1]}. "
            f"Each hop followed the previous one within {cfg['chain_window_h']} h.",
            {"chain": chain, "hops": len(path), "hours": round(hours, 2), "value_kept": round(kept, 4)},
            value=path[0].amount,
        ))
    return findings


# ---------------------------------------------------------------- orchestration

def _account_flags(acct, meta, inflow, as_of, cfg):
    flags = []
    if not meta:
        return flags
    try:
        opened = datetime.fromisoformat(meta.get("opened_on", ""))
        age = (as_of - opened).days
        if age <= cfg["new_account_days"]:
            flags.append(f"Account opened {age} days before activity")
    except ValueError:
        pass
    if meta.get("kyc_level", "").upper() == "MIN":
        flags.append("Minimum-KYC account")
    try:
        income = float(meta.get("declared_monthly_income") or 0)
        if income and inflow > cfg["income_multiple"] * income:
            flags.append(f"Inflow {_fmt_inr(inflow)} is {inflow / income:.0f}× declared monthly income")
    except ValueError:
        pass
    return flags


def analyze(txns: list[Txn], accounts_meta: dict | None = None, cfg: dict | None = None) -> dict:
    cfg = {**DEFAULTS, **(cfg or {})}
    accounts_meta = accounts_meta or {}
    txns = sorted(txns, key=lambda t: t.ts)
    idx = _OutIndex(txns)

    cycles = detect_round_trips(txns, idx, cfg)
    cycle_ids = frozenset(i for f in cycles for i in f["txn_ids"])
    findings = (detect_structuring(txns, cfg) + detect_fan_out_fan_in(txns, cfg) + cycles
                + detect_layering(txns, idx, cfg, cycle_ids))
    findings.sort(key=lambda f: -f["total_amount"])

    # per-account stats
    stats = defaultdict(lambda: {"in_amount": 0.0, "out_amount": 0.0, "in_count": 0, "out_count": 0})
    for t in txns:
        stats[t.src]["out_amount"] += t.amount
        stats[t.src]["out_count"] += 1
        stats[t.dst]["in_amount"] += t.amount
        stats[t.dst]["in_count"] += 1
    as_of = txns[0].ts if txns else datetime.now()

    roles = defaultdict(list)
    for i, f in enumerate(findings, 1):
        f["id"] = f"F{i:03d}"
        for acct, role in f["accounts"].items():
            roles[acct].append({"finding": f["id"], "type": f["type"], "role": role})

    for f in findings:
        flagged = {a: _account_flags(a, accounts_meta.get(a), stats[a]["in_amount"], as_of, cfg) for a in f["accounts"]}
        f["account_flags"] = {a: fl for a, fl in flagged.items() if fl}
        m = f["metrics"]
        strength = m.get("common_share") or m.get("pass_through") or m.get("value_kept") or 0.5
        parts = {
            "pattern_detected": 40,
            "amount": round(min(25, max(0, 12.5 * math.log10(max(f["total_amount"], 1) / 1e4))), 1),
            "account_red_flags": round(25 * len(f["account_flags"]) / len(f["accounts"]), 1),
            "pattern_strength": round(10 * min(1, strength), 1),
        }
        f["risk_breakdown"] = parts
        f["risk_score"] = min(100, round(sum(parts.values())))
        f["severity"] = "critical" if f["risk_score"] >= 85 else "high" if f["risk_score"] >= 65 else "medium"

    # account risk: the strongest network it sits in, scaled by how central its role is, plus own red flags
    by_id = {f["id"]: f for f in findings}
    risk = {}
    for acct, rs in roles.items():
        flags = _account_flags(acct, accounts_meta.get(acct), stats[acct]["in_amount"], as_of, cfg)
        base = max(by_id[r["finding"]]["risk_score"] * ROLE_FACTOR.get(r["role"], 0.5) for r in rs)
        risk[acct] = min(100, round(base + 3 * len(flags) + 5 * (len(rs) - 1)))

    txn_findings = defaultdict(list)
    for f in findings:
        for tid in f["txn_ids"]:
            txn_findings[tid].append(f["id"])

    # aggregated edges
    edges = {}
    for t in txns:
        e = edges.setdefault((t.src, t.dst), {"source": t.src, "target": t.dst, "count": 0, "total": 0.0,
                                              "first": t.ts, "last": t.ts, "findings": set()})
        e["count"] += 1
        e["total"] += t.amount
        e["last"] = t.ts
        e["findings"].update(txn_findings.get(t.id, ()))

    nodes = []
    for acct, s in stats.items():
        meta = accounts_meta.get(acct, {})
        nodes.append({
            "id": acct, "name": meta.get("holder_name", ""), "segment": meta.get("segment", ""),
            "branch": meta.get("branch", ""), "kyc": meta.get("kyc_level", ""), "opened_on": meta.get("opened_on", ""),
            "income": meta.get("declared_monthly_income", ""),
            "risk": risk.get(acct, 0), "roles": roles.get(acct, []),
            "flags": _account_flags(acct, meta, s["in_amount"], as_of, cfg) if acct in roles else [],
            **{k: round(v, 2) if isinstance(v, float) else v for k, v in s.items()},
        })

    flagged_txn_ids = set(txn_findings)
    flagged_txns = [{"id": t.id, "ts": t.ts.isoformat(timespec="seconds"), "src": t.src, "dst": t.dst,
                     "amount": t.amount, "channel": t.channel, "findings": txn_findings[t.id]}
                    for t in txns if t.id in flagged_txn_ids]

    summary = {
        "transactions": len(txns), "accounts": len(stats),
        "volume": round(sum(t.amount for t in txns), 2),
        "period": [txns[0].ts.isoformat(timespec="seconds"), txns[-1].ts.isoformat(timespec="seconds")] if txns else [],
        "findings": len(findings),
        "by_type": dict(Counter(f["type"] for f in findings)),
        "flagged_accounts": len(roles),
        "flagged_transactions": len(flagged_txn_ids),
        "amount_at_risk": round(sum(f["total_amount"] for f in findings), 2),
        "gross_flagged_flow": round(sum(t.amount for t in txns if t.id in flagged_txn_ids), 2),
    }
    labels = {t.id: t.label for t in txns if t.label}
    if labels:
        truth = {i for i, lab in labels.items() if lab not in ("", "normal", "0", "false")}
        tp = len(truth & flagged_txn_ids)
        summary["evaluation"] = {
            "precision": round(tp / len(flagged_txn_ids), 4) if flagged_txn_ids else None,
            "recall": round(tp / len(truth), 4) if truth else None,
            "true_positive_txns": tp, "planted_fraud_txns": len(truth), "flagged_txns": len(flagged_txn_ids),
        }

    return {
        "summary": summary, "config": cfg, "findings": findings, "nodes": nodes,
        "edges": [{**e, "total": round(e["total"], 2), "first": e["first"].isoformat(timespec="seconds"),
                   "last": e["last"].isoformat(timespec="seconds"), "findings": sorted(e["findings"])}
                  for e in edges.values()],
        "transactions": flagged_txns,
    }
