"""Synthetic bank transaction generator with planted fraud patterns.

Produces a month of ordinary activity (salaries, shopping, bills, P2P transfers)
and hides four laundering patterns inside it. Every row carries a `label`
column (ground truth) so the detector can be scored; the detector itself
never reads it.
"""
import csv
import io
import random
from datetime import datetime, timedelta

START = datetime(2026, 9, 1)
DAYS = 30
FIELDS = ["txn_id", "timestamp", "from_account", "to_account", "amount", "channel", "label"]


class _Builder:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self._ids = iter(self.rng.sample(range(10_000_000, 99_999_999), 5000))
        self.txns = []

    def accounts(self, n):
        return [f"AC{next(self._ids)}" for _ in range(n)]

    def at(self, day, hour=None):
        hour = self.rng.uniform(7, 23) if hour is None else hour
        return START + timedelta(days=int(day), hours=hour)

    def add(self, src, dst, amount, ts, label="normal", channel=None):
        channel = channel or self.rng.choice(["UPI", "UPI", "UPI", "IMPS", "NEFT"])
        self.txns.append({"timestamp": ts, "from_account": src, "to_account": dst,
                          "amount": round(amount, 2), "channel": channel, "label": label})


def _normal_activity(b, customers):
    rng = b.rng
    employers = b.accounts(6)
    merchants = b.accounts(40)
    utilities = b.accounts(3)
    merchant_weights = [min(rng.paretovariate(1.2), 8) for _ in merchants]

    for c in customers:
        b.add(rng.choice(employers), c, round(rng.uniform(25_000, 150_000), -2),
              b.at(0, rng.uniform(9, 12)), channel="NEFT")
        for _ in range(rng.randint(8, 25)):
            m = rng.choices(merchants, merchant_weights)[0]
            b.add(c, m, min(rng.lognormvariate(6.5, 0.9), 40_000), b.at(rng.uniform(0, DAYS)))
        b.add(c, rng.choice(utilities), rng.uniform(500, 4_000), b.at(rng.randint(3, 10)))
        for _ in range(rng.randint(0, 3)):
            other = rng.choice(customers)
            if other != c:
                b.add(c, other, round(rng.uniform(100, 5_000)), b.at(rng.uniform(0, DAYS)))
    return merchants


def _plant_structuring(b, merchants):
    """100 mule accounts push ~₹10L to one collector in ~₹500 pieces."""
    rng = b.rng
    collector = b.accounts(1)[0]
    mules = b.accounts(100)
    for m in mules:
        for _ in range(20):
            amt = 500 if rng.random() < 0.85 else rng.choice([450, 490, 495, 499])
            b.add(m, collector, amt, b.at(rng.uniform(10, 15)), "structuring", "UPI")
        # a little ordinary-looking noise so mules aren't trivially isolated
        for _ in range(rng.randint(0, 2)):
            b.add(m, rng.choice(merchants), rng.uniform(100, 1_500), b.at(rng.uniform(0, DAYS)))


def _plant_fan_out_fan_in(b, customers):
    """Stolen funds are spread to 30 mules just under ₹10k, then regrouped."""
    rng = b.rng
    source, collector = b.accounts(2)
    mules = b.accounts(30)
    b.add(rng.choice(customers), source, 300_000, b.at(17, 22), "fan_out_fan_in", "IMPS")
    t0 = b.at(18, 1.5)
    for m in mules:
        amt = rng.randint(9_500, 9_990)
        ts = t0 + timedelta(minutes=rng.uniform(0, 90))
        b.add(source, m, amt, ts, "fan_out_fan_in", "IMPS")
        fwd = amt - rng.randint(0, 200)
        ts2 = ts + timedelta(hours=rng.uniform(0.5, 10))
        if rng.random() < 0.4:
            part = round(fwd * rng.uniform(0.4, 0.6))
            b.add(m, collector, part, ts2, "fan_out_fan_in", "UPI")
            b.add(m, collector, fwd - part, ts2 + timedelta(minutes=rng.uniform(5, 60)), "fan_out_fan_in", "UPI")
        else:
            b.add(m, collector, fwd, ts2, "fan_out_fan_in", "IMPS")


def _plant_layering(b, customers, n_chains=2, hops=6):
    """A large sum hops quickly through a chain of accounts, losing a small cut each hop."""
    rng = b.rng
    for _ in range(n_chains):
        path = [rng.choice(customers)] + b.accounts(hops)
        amt = rng.choice([320_000, 500_000, 750_000])
        ts = b.at(rng.uniform(5, 25))
        for a, z in zip(path, path[1:]):
            b.add(a, z, amt, ts, "layering", rng.choice(["IMPS", "NEFT"]))
            amt = round(amt * rng.uniform(0.97, 0.995))
            ts += timedelta(minutes=rng.uniform(10, 300))


def _plant_round_trips(b, lengths=(4, 3)):
    """Money leaves an account and returns to it via a ring of accounts."""
    rng = b.rng
    for n in lengths:
        ring = b.accounts(n)
        amt = rng.choice([200_000, 450_000])
        ts = b.at(rng.uniform(3, 24))
        for i in range(n):
            b.add(ring[i], ring[(i + 1) % n], amt, ts, "round_trip", "NEFT")
            amt = round(amt * rng.uniform(0.985, 0.998))
            ts += timedelta(hours=rng.uniform(2, 20))


def generate(seed=7):
    """Return a list of CSV-style row dicts (all string values), sorted by time."""
    b = _Builder(seed)
    customers = b.accounts(400)
    merchants = _normal_activity(b, customers)
    _plant_structuring(b, merchants)
    _plant_fan_out_fan_in(b, customers)
    _plant_layering(b, customers)
    _plant_round_trips(b)

    b.txns.sort(key=lambda t: t["timestamp"])
    rows = []
    for i, t in enumerate(b.txns, 1):
        rows.append({**t, "txn_id": f"T{i:06d}", "timestamp": t["timestamp"].isoformat(timespec="seconds"),
                     "amount": f"{t['amount']:.2f}"})
    return rows


def to_csv(rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "sample_transactions.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write(to_csv(generate()))
    print(f"wrote {out}")
