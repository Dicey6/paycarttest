/** Parse a decimal string ("12.5") into base units without floating point. */
export function toUnits(value: string, decimals: number): bigint {
  const clean = value.trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") {
    throw new Error("Enter a valid amount.");
  }
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals}).`);
  }
  const units = BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= BigInt(0)) throw new Error("Amount must be greater than zero.");
  return units;
}

export function formatAmount(value: number | undefined, max = 4) {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function formatUsd(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
