const integer = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCredits(n: number, options?: { signed?: boolean }): string {
  const sign = options?.signed && n > 0 ? "+" : "";
  const noun = Math.abs(n) === 1 ? "credit" : "credits";
  return `${sign}${integer.format(n)} ${noun}`;
}

export function formatNumber(value: number): string {
  return integer.format(value);
}

/** `fraction` is 0–1; 0.45 → "45%". */
export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** For unit costs that are fractions of a cent, e.g. $0.033. */
export function formatUsdPrecise(amount: number): string {
  return usdPrecise.format(amount);
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${integer.format(n)} ${n === 1 ? singular : plural}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(ms);
}

/** Storage keys and camera dumps are not names. Real filenames still read as labels. */
function isOpaqueFileId(fileName: string): boolean {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return (
    /^[0-9a-f-]{16,}$/i.test(stem) ||
    /^(img|image|photo|picture|dsc|pxl)[-_ ]?\d+$/i.test(stem)
  );
}

/** Piece names when we have them. Otherwise a readable filename, never a raw image id. */
export function photoLabel(
  fileName: string,
  names: readonly string[],
  fallback: string,
): string {
  const related = names.map((name) => name.trim()).filter(Boolean);
  if (related.length > 0) {
    const shown = related.slice(0, 3);
    const rest = related.length - shown.length;
    return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ");
  }
  if (!isOpaqueFileId(fileName)) {
    const cleaned = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (cleaned) return cleaned;
  }
  return fallback;
}

export function titleCase(value: string): string {
  return value
    .replace(/(^|[\s-])([a-z])/g, (match) => match.toUpperCase())
    .replace(/-/g, " ");
}
