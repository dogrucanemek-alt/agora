import type { Server } from "./store.ts";

export const PACKAGE_COLUMNS = ["npm_package", "npm_exists", "npm_weekly_downloads", "npm_latest_publish", "pypi_package", "pypi_exists", "pypi_last_week_downloads", "pypi_latest_upload", "package_deprecated"];

// One row per server: multiple packages use aligned JSON arrays, preserving unknown and zero.
export function packageCells(server: Pick<Server, "packages">): unknown[] {
  const compact = (values: unknown[]) => values.length > 1 ? JSON.stringify(values.map((v) => v ?? null)) : values[0] ?? null;
  const npm = server.packages.filter((p) => p.registry === "npm");
  const pypi = server.packages.filter((p) => p.registry === "pypi");
  const flags = [...npm, ...pypi].map((p) => p.registry === "npm" ? p.signal?.deprecated : p.signal?.yanked);
  return [compact(npm.map((p) => p.id)), compact(npm.map((p) => p.signal?.exists)),
    compact(npm.map((p) => p.signal?.weeklyDownloads)), compact(npm.map((p) => p.signal?.latestPublish)),
    compact(pypi.map((p) => p.id)), compact(pypi.map((p) => p.signal?.exists)),
    compact(pypi.map((p) => p.signal?.weeklyDownloads)), compact(pypi.map((p) => p.signal?.latestUpload)),
    flags.some((f) => f === true) ? true : flags.length && flags.every((f) => f === false) ? false : null];
}

export const csvCell = (value: unknown) => {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
