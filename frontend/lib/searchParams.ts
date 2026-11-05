export type PageSearchParams = Record<string, string | string[] | undefined>;

export function getSearchParam(
  searchParams: PageSearchParams,
  key: string,
): string {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function getSelectionIds(
  searchParams: PageSearchParams,
  pluralKey: string,
  singularKey: string,
): string[] {
  const values = [getSearchParam(searchParams, pluralKey), getSearchParam(searchParams, singularKey)]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export function buildSearchHref(
  path: string,
  tab: string,
  searchParams: PageSearchParams,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);

  for (const key of ["from", "to", "date", "travellers"]) {
    const value = getSearchParam(searchParams, key);
    if (value) params.set(key, value);
  }

  for (const key of ["transports", "stays", "experiences"]) {
    const value = getSearchParam(searchParams, key);
    if (value) params.set(key, value);
  }

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  return `${path}?${params.toString()}`;
}

export function buildSelectionHref(
  path: string,
  tab: string,
  searchParams: PageSearchParams,
  selectionKey: "transports" | "stays" | "experiences",
  id: string,
): string {
  const selected = getSelectionIds(searchParams, selectionKey, selectionKey.slice(0, -1));
  if (!selected.includes(id)) selected.push(id);

  return buildSearchHref(path, tab, searchParams, {
    [selectionKey]: selected.join(","),
  });
}