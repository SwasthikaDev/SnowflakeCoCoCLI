"""Synthetic bank data generator with planted fraud patterns.

Produces a month of ordinary activity (salaries, shopping, bills, P2P transfers)
plus account/KYC master data, and hides four laundering schemes inside it.
Every transaction row carries a `label` column (ground truth) so the detector
can be scored; the detector itself never reads it.
"""
import csv
import io
import random
from datetime import datetime, timedelta

START = datetime(2026, 9, 1)
DAYS = 30
TXN_FIELDS = ["txn_id", "timestamp", "from_account", "to_account", "amount", "channel", "label"]
ACCOUNT_FIELDS = ["account_id", "holder_name", "segment", "account_type", "branch", "opened_on",
                  "kyc_level", "declared_monthly_income"]

FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir",
         "Ananya", "Diya", "Saanvi", "Aadhya", "Kavya", "Meera", "Priya", "Lakshmi", "Nithya", "Fatima",
         "Rahul", "Vikram", "Suresh", "Ganesh", "Imran", "Joseph", "Harpreet", "Deepa", "Pooja", "Swati"]
LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Patel", "Gupta", "Khan", "Singh", "Rao", "Menon",
        "Das", "Mukherjee", "Joshi", "Kulkarni", "Pillai", "Fernandes", "Chopra", "Banerjee", "Verma", "Shetty"]
BRANCHES = ["Chennai-Anna Nagar", "Bengaluru-Koramangala", "Mumbai-Andheri", "Hyderabad-Madhapur",
            "Delhi-Karol Bagh", "Pune-Kothrud", "Kolkata-Salt Lake", "Kochi-Edappally"]
MERCHANT_NAMES = ["FreshMart Groceries", "QuickFuel Station", "Metro Pharmacy", "Urban Threads", "Spice Route Cafe",
                  "TechZone Electronics", "BookNook", "CityCab Services", "HomeNeeds Store", "Daily Dairy"]


class _Builder:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self._ids = iter(self.rng.sample(range(10_000_000, 99_999_999), 5000))
        self.txns = []
        self.accounts = {}

    def accounts_of(self, n, segment, *, opened_days_ago=(400, 4000), kyc="FULL", income=(25_000, 150_000),
                    account_type="SAVINGS", name=None):
        rng = self.rng
        out = []
        for i in range(n):
            acct = f"AC{next(self._ids)}"
            holder = name(i) if name else f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            opened = (START - timedelta(days=rng.randint(*opened_days_ago))).date()
            self.accounts[acct] = {
                "account_id": acct, "holder_name": holder, "segment": segment, "account_type": account_type,
                "branch": rng.choice(BRANCHES), "opened_on": opened.isoformat(),
                "kyc_level": kyc if isinstance(kyc, str) else rng.choice(kyc),
                "declared_monthly_income": str(int(round(rng.uniform(*income), -2))) if income else "",
            }
            out.append(acct)
        return out

    def at(self, day, hour=None):
        hour = self.rng.uniform(7, 23) if hour is None else hour
        return START + timedelta(days=int(day), hours=hour)

    def add(self, src, dst, amount, ts, label="normal", channel=None):
        channel = channel or self.rng.choice(["UPI", "UPI", "UPI", "IMPS", "NEFT"])
        self.txns.append({"timestamp": ts, "from_account": src, "to_account": dst,
                          "amount": round(amount, 2), "channel": channel, "label": label})


def _mules(b, n):
    """Mule accounts: recently opened, thin KYC, low declared income."""
    return b.accounts_of(n, "RETAIL", opened_days_ago=(10, 75), kyc=["MIN", "MIN", "FULL"], income=(8_000, 18_000))


def _normal_activity(b, customers):
    rng = b.rng
    employers = b.accounts_of(6, "CORPORATE", account_type="CURRENT", income=None,
                              name=lambda i: ["Zenith Infotech Pvt Ltd", "Coastal Logistics Ltd", "Nova Textiles",
                                              "Brightpath Schools", "Apex Healthcare", "Sunrise Foods"][i])
    merchants = b.accounts_of(len(MERCHANT_NAMES) * 4, "MERCHANT", account_type="CURRENT", income=None,
                              name=lambda i: f"{MERCHANT_NAMES[i % len(MERCHANT_NAMES)]} #{i // len(MERCHANT_NAMES) + 1}")
    utilities = b.accounts_of(3, "CORPORATE", account_type="CURRENT", income=None,
                              name=lambda i: ["State Electricity Board", "City Water Supply", "FiberNet Broadband"][i])
    merchant_weights = [min(rng.paretovariate(1.2), 8) for _ in merchants]

    for c in customers:
        income = float(b.accounts[c]["declared_monthly_income"])
        b.add(rng.choice(employers), c, income, b.at(0, rng.uniform(9, 12)), channel="NEFT")
        for _ in range(rng.randint(8, 25)):
            m = rng.choices(merchants, merchant_weights)[0]
            b.add(c, m, min(rng.lognormvariate(6.5, 0.9), 40_000), b.at(rng.uniform(0, DAYS)))
        b.add(c, rng.choice(utilities), rng.uniform(500, 4_000), b.at(rng.randint(3, 10)))
        for _ in range(rng.randint(0, 3)):
            other = rng.choice(customers)
            if other != c:
                b.add(c, other, round(rng.uniform(100, 5_000)), b.at(rng.uniform(0, DAYS)))
    return merchants


def _legit_lookalikes(b, customers):
    """Benign activity that superficially resembles fraud, so precision is actually tested."""
    rng = b.rng
    society, gym = b.accounts_of(2, "CORPORATE", account_type="CURRENT", income=None,
                                 name=lambda i: ["Green Meadows Residents Welfare Assn", "IronCore Fitness"][i])
    # many residents pay the same maintenance amount to one account (fan-in, identical amounts, but once each)
    for c in rng.sample(customers, 80):
        b.add(c, society, 1_500, b.at(rng.uniform(1, 6)), channel="UPI")
    # members pay a fixed ₹499 weekly (repeated identical small amounts, but modest totals)
    for c in rng.sample(customers, 15):
        for week in range(4):
            b.add(c, gym, 499, b.at(week * 7 + rng.uniform(0, 2)), channel="UPI")
    # family support: parent -> student -> landlord (short value-preserving chain)
    for _ in range(10):
        parent, student, landlord = rng.sample(customers, 3)
        amt = round(rng.uniform(20_000, 60_000), -2)
        ts = b.at(rng.uniform(0, 25))
        b.add(parent, student, amt, ts, channel="IMPS")
        b.add(student, landlord, round(amt * rng.uniform(0.85, 0.98), -2), ts + timedelta(hours=rng.uniform(2, 20)))


def _plant_structuring(b, merchants):
    """100 mule accounts push ~₹10L to one collector in ~₹500 pieces."""
    rng = b.rng
    collector = b.accounts_of(1, "RETAIL", account_type="CURRENT", opened_days_ago=(20, 40), kyc="MIN",
                              income=(15_000, 20_000))[0]
    for m in _mules(b, 100):
        for _ in range(20):
            amt = 500 if rng.random() < 0.85 else rng.choice([450, 490, 495, 499])
            b.add(m, collector, amt, b.at(rng.uniform(10, 15)), "structuring", "UPI")
        for _ in range(rng.randint(0, 2)):  # ordinary-looking noise
            b.add(m, rng.choice(merchants), rng.uniform(100, 1_500), b.at(rng.uniform(0, DAYS)))


def _plant_fan_out_fan_in(b, customers):
    """Stolen funds are spread to 30 mules just under ₹10k, then regrouped."""
    rng = b.rng
    source = b.accounts_of(1, "RETAIL", opened_days_ago=(30, 60), kyc="MIN", income=(10_000, 15_000))[0]
    collector = b.accounts_of(1, "RETAIL", account_type="CURRENT", opened_days_ago=(15, 30), kyc="MIN",
                              income=(12_000, 18_000))[0]
    b.add(rng.choice(customers), source, 300_000, b.at(17, 22), "fan_out_fan_in", "IMPS")
    t0 = b.at(18, 1.5)
    for m in _mules(b, 30):
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
    for victim in rng.sample(customers, n_chains):
        path = [victim] + _mules(b, hops)
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
        ring = b.accounts_of(n, "SME", account_type="CURRENT", opened_days_ago=(90, 400), income=(40_000, 90_000))
        amt = rng.choice([200_000, 450_000])
        ts = b.at(rng.uniform(3, 24))
        for i in range(n):
            b.add(ring[i], ring[(i + 1) % n], amt, ts, "round_trip", "NEFT")
            amt = round(amt * rng.uniform(0.985, 0.998))
            ts += timedelta(hours=rng.uniform(2, 20))


def generate(seed=7):
    """Return (transactions, accounts) as lists of CSV-style row dicts with string values."""
    b = _Builder(seed)
    customers = b.accounts_of(400, "RETAIL")
    merchants = _normal_activity(b, customers)
    _legit_lookalikes(b, customers)
    _plant_structuring(b, merchants)
    _plant_fan_out_fan_in(b, customers)
    _plant_layering(b, customers)
    _plant_round_trips(b)

    b.txns.sort(key=lambda t: t["timestamp"])
    txns = [{**t, "txn_id": f"T{i:06d}", "timestamp": t["timestamp"].isoformat(timespec="seconds"),
             "amount": f"{t['amount']:.2f}"} for i, t in enumerate(b.txns, 1)]
    return txns, list(b.accounts.values())


def to_csv(rows, fields):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


if __name__ == "__main__":
    import sys
    from pathlib import Path
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "data")
    out.mkdir(parents=True, exist_ok=True)
    txns, accounts = generate()
    (out / "transactions.csv").write_text(to_csv(txns, TXN_FIELDS), encoding="utf-8")
    (out / "accounts.csv").write_text(to_csv(accounts, ACCOUNT_FIELDS), encoding="utf-8")
    print(f"wrote {len(txns)} transactions and {len(accounts)} accounts to {out}/")
