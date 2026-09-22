export type PageSearchParams = Record<string, string | string[] | undefined>;

export function getSearchParam(
  searchParams: PageSearchParams,
  key: string,
): string {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  return `${path}?${params.toString()}`;
}