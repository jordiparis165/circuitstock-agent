const DEFAULT_SCALE = 8n;

export type DecimalAtom = {
  atoms: bigint;
  scale: bigint;
};

export function decimal(value: string | number | bigint, scale = DEFAULT_SCALE): DecimalAtom {
  if (typeof value === "bigint") return { atoms: value * 10n ** scale, scale };
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid decimal: ${raw}`);
  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = normalized.split(".");
  const places = Number(scale);
  const padded = `${fraction}${"0".repeat(places)}`.slice(0, places);
  const atoms = BigInt(whole || "0") * 10n ** scale + BigInt(padded || "0");
  return { atoms: negative ? -atoms : atoms, scale };
}

export function formatDecimal(input: DecimalAtom, maxFraction = 6): string {
  const negative = input.atoms < 0n;
  const value = negative ? -input.atoms : input.atoms;
  const base = 10n ** input.scale;
  const whole = value / base;
  const fraction = value % base;
  const places = Number(input.scale);
  let fractionText = fraction.toString().padStart(places, "0").slice(0, maxFraction);
  fractionText = fractionText.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}

export function compareDecimal(a: string, b: string): number {
  const left = decimal(a).atoms;
  const right = decimal(b).atoms;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function minDecimal(a: string, b: string): string {
  return compareDecimal(a, b) <= 0 ? a : b;
}

export function subtractDecimal(a: string, b: string): DecimalAtom {
  const left = decimal(a);
  const right = decimal(b);
  return { atoms: left.atoms - right.atoms, scale: left.scale };
}

export function addDecimal(a: string, b: string): string {
  const left = decimal(a);
  const right = decimal(b);
  return formatDecimal({ atoms: left.atoms + right.atoms, scale: left.scale });
}

export function percentDiff(high: string, low: string): DecimalAtom {
  const highAtoms = decimal(high).atoms;
  const lowAtoms = decimal(low).atoms;
  if (lowAtoms <= 0n) return { atoms: 0n, scale: DEFAULT_SCALE };
  const scaleFactor = 10n ** DEFAULT_SCALE;
  return { atoms: ((highAtoms - lowAtoms) * scaleFactor * 100n) / lowAtoms, scale: DEFAULT_SCALE };
}

export function minusPct(a: string, pct: string): string {
  const left = decimal(a);
  const right = decimal(pct);
  return formatDecimal({ atoms: left.atoms - right.atoms, scale: left.scale });
}

export function gteDecimal(a: string, b: string): boolean {
  return compareDecimal(a, b) >= 0;
}

export function lteDecimal(a: string, b: string): boolean {
  return compareDecimal(a, b) <= 0;
}
