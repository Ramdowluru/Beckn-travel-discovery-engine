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
