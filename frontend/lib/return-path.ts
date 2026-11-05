export function safeInternalReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) {
    return null;
  }

  try {
    const url = new URL(value, "https://tde.invalid");
    if (url.origin !== "https://tde.invalid" || url.username || url.password) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
