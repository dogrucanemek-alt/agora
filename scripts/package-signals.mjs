// Pure joins shared by the collector and index builder. Package counts are distinct registry IDs.
export const packageKey = (registry, id) => registry === "pypi" ? id.toLowerCase().replace(/[-_.]+/g, "-") : id.toLowerCase();

export function listedPackages(servers) {
  const out = { npm: new Set(), pypi: new Set() };
  for (const s of servers) for (const p of s.packages ?? []) {
    if (["npm", "pypi"].includes(p.registry)) out[p.registry].add(packageKey(p.registry, p.id));
  }
  return Object.fromEntries(Object.entries(out).map(([r, ids]) => [r, [...ids].sort()]));
}

export function mergePackages(packages, signals) {
  return packages.map((p) => ({ ...p, ...(["npm", "pypi"].includes(p.registry)
    ? { signal: signals?.[p.registry]?.[packageKey(p.registry, p.id)] ?? null } : {}) }));
}

export function packageFacts(servers, signals) {
  const listed = listedPackages(servers);
  return Object.fromEntries(Object.entries(listed).map(([registry, ids]) => {
    const values = ids.map((id) => signals?.[registry]?.[id]).filter(Boolean);
    return [registry, { listed: ids.length, checked: values.filter((p) => p.exists !== null).length,
      missing: values.filter((p) => p.exists === false).length,
      deprecated: values.filter((p) => p.deprecated === true).length,
      yanked: values.filter((p) => p.yanked === true).length }];
  }));
}
