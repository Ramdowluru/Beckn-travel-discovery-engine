const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function forwardAuthRequest(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${backendUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json(
      { detail: "Authentication service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardSearchRequest(query: URLSearchParams): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}/api/search?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Search service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
