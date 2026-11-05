import { headers } from "next/headers";

export class ServerApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed: ${status}`);
    this.name = "ServerApiError";
  }
}

async function apiOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

export async function serverApiFetch<T>(path: string): Promise<T> {
  const requestHeaders = await headers();
  const requestCookie = requestHeaders.get("cookie");
  const response = await fetch(`${await apiOrigin()}${path}`, {
    cache: "no-store",
    headers: requestCookie ? { cookie: requestCookie } : undefined,
  });
  if (!response.ok) throw new ServerApiError(response.status);
  return response.json() as Promise<T>;
}