/** Format a number with K/M suffix. */
export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

/** Format "YYYY-MM-DD" → "M/D". */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const x = new Date(y, m - 1, day);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

/** Format number as full USD string: "$1,234.56". */
export function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format number as compact USD: "$1.2K" or "$42". */
export function fmtUsdShort(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

/** Format milliseconds as latency: "42ms" or "1.2s". */
export function fmtMs(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

/** Format minutes as duration: "42m" or "1.5h". */
export function fmtDuration(min: number): string {
  if (min >= 60) return (min / 60).toFixed(1) + "h";
  return Math.round(min) + "m";
}

/** Format milliseconds as duration: "42m" or "1.5h". */
export function fmtDurationMs(ms: number): string {
  return fmtDuration(ms / 60000);
}

/** Strip "models/" prefix, date suffix, and truncate model names. */
export function shortenModel(name: string): string {
  return name
    .replace(/^models\//, "")
    .replace(/-\d{8}$/, "")
    .slice(0, 28);
}
