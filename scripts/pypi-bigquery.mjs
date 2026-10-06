// PyPI weekly downloads from the public BigQuery table, as pypistats.org asks bulk readers to do.
// One query per refresh; maximumBytesBilled makes BigQuery refuse a query that would scan more.
export const TABLE = "bigquery-public-data.pypi.file_downloads";
export const MAX_BYTES_BILLED = 200 * 1024 ** 3;

// PEP 503 normalized form, which is how the table stores file.project.
export const normalizePypi = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");

// Seven complete UTC days ending yesterday, so every run covers the same span of finished days.
export function weekWindow(now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start: new Date(end - 7 * 864e5).toISOString(), end: new Date(end).toISOString() };
}

export const QUERY = `SELECT file.project AS project, COUNT(*) AS downloads
FROM \`${TABLE}\`
WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
  AND file.project IN UNNEST(@names)
GROUP BY project`;

// rows: [{ project, downloads }]. A listed package with no row had no downloads in the window: 0, not unknown.
export function countsByName(names, rows) {
  const byProject = new Map(rows.map((r) => [r.project, Number(r.downloads)]));
  return Object.fromEntries(names.map((n) => [n, byProject.get(normalizePypi(n)) ?? 0]));
}

// runQuery({ query, params }) -> { rows, bytesBilled }; injectable so tests stay offline.
export async function readPypiDownloads(names, { runQuery = bigQueryRunner(), now = new Date() } = {}) {
  const window = weekWindow(now);
  const { rows, bytesBilled } = await runQuery({ query: QUERY, params: { ...window, names: [...new Set(names.map(normalizePypi))] } });
  return { counts: countsByName(names, rows), window, bytesBilled, checkedAt: new Date().toISOString() };
}

export function bigQueryRunner() {
  return async ({ query, params }) => {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const [job] = await new BigQuery().createQueryJob({ query, params, location: "US", maximumBytesBilled: String(MAX_BYTES_BILLED) });
    const [rows] = await job.getQueryResults();
    const [meta] = await job.getMetadata();
    return { rows, bytesBilled: Number(meta.statistics?.query?.totalBytesBilled ?? 0) };
  };
}
