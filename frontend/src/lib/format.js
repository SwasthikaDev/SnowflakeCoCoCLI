export const PATTERN = {
  structuring: { name: "Structuring", color: "#E8A33D" },
  fan_out_fan_in: { name: "Fan-out → fan-in", color: "#E4572E" },
  layering: { name: "Layering chain", color: "#7B61FF" },
  round_trip: { name: "Round-trip cycle", color: "#1B998B" },
};

export const ROLE_LABEL = {
  collector: "Collector", distributor: "Distributor", source: "Source", mule: "Mule", entry: "Entry",
  layer: "Layer", exit: "Exit", cycle_member: "Ring member",
};

const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹ with Indian grouping, or compact L / Cr. */
export function inr(x, compact = true) {
  if (x == null || Number.isNaN(x)) return "—";
  if (compact && x >= 1e7) return `₹${(x / 1e7).toFixed(2)} Cr`;
  if (compact && x >= 1e5) return `₹${(x / 1e5).toFixed(2)} L`;
  return `₹${grouped.format(x)}`;
}

export const num = (x) => grouped.format(x);

export function when(iso, withTime = true) {
  const d = new Date(iso);
  const opts = withTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }
    : { day: "numeric", month: "short", year: "numeric" };
  return d.toLocaleString("en-IN", opts);
}

export function maskName(name) {
  if (!name) return "";
  return name.split(" ").map((w) => (w.length > 1 ? w[0] + "•".repeat(Math.min(5, w.length - 1)) : w)).join(" ");
}

/** Add n working days (Mon–Fri) to a date. */
export function addWorkingDays(date, n) {
  const d = new Date(date);
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n--;
  }
  return d;
}

export function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
