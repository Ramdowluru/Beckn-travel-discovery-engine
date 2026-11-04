const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["cookie", "origin", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseWithCookies(response: Response): Response {
  const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") || "application/json" });
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export async function forwardAuthRequest(
  request: Request,
  path: string,
  body: unknown,
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method: "POST",
      headers: forwardedHeaders(request),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return responseWithCookies(response);
  } catch {
    return Response.json(
      { detail: "Authentication service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardAuthGet(request: Request, path: string): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method: "GET",
      headers: forwardedHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return responseWithCookies(response);
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

export async function forwardTransportRequest(
  offerId: string,
  transactionId: string,
): Promise<Response> {
  try {
    const query = new URLSearchParams({ transaction_id: transactionId });
    const response = await fetch(
      `${backendUrl}/api/transport/${encodeURIComponent(offerId)}?${query.toString()}`,
      { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Transport details are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardCategoryOfferRequest(
  category: "stays" | "experiences",
  offerId: string,
  transactionId: string,
): Promise<Response> {
  try {
    const query = new URLSearchParams({ transaction_id: transactionId });
    const response = await fetch(
      `${backendUrl}/api/${category}/${encodeURIComponent(offerId)}?${query.toString()}`,
      { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Category details are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardCategoryBookingRequest(
  request: Request,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: forwardedHeaders(request),
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Category booking is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardItineraryRequest(
  request: Request,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: forwardedHeaders(request),
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Saved itineraries are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardTripRequest(
  request: Request,
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
): Promise<Response> {
  try {
    const body = method === "GET" ? undefined : await request.text();
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: forwardedHeaders(request),
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const headers = new Headers({
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store",
    });
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      { detail: "Trip service is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function forwardBookingRequest(
  request: Request,
  path: string,
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method: "GET",
      headers: forwardedHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const headers = new Headers();
    const contentType = response.headers.get("Content-Type");
    const disposition = response.headers.get("Content-Disposition");
    if (contentType) headers.set("Content-Type", contentType);
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      { detail: "Booking records are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardTransportSelection(
  request: Request,
  offerId: string,
  transactionId: string,
  body: unknown,
): Promise<Response> {
  try {
    const response = await fetch(
      `${backendUrl}/api/transport/${encodeURIComponent(offerId)}/select?transaction_id=${encodeURIComponent(transactionId)}`,
      {
        method: "POST",
        headers: forwardedHeaders(request),
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Transport selection is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardTransportInit(
  request: Request,
  selectionId: string,
  body: unknown,
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}/api/transport/selections/${encodeURIComponent(selectionId)}/init`, {
      method: "POST",
      headers: forwardedHeaders(request),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Transport initialization is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function forwardTransportConfirm(
  request: Request,
  selectionId: string,
  body: unknown,
): Promise<Response> {
  try {
    const response = await fetch(
      `${backendUrl}/api/transport/selections/${encodeURIComponent(selectionId)}/confirm`,
      {
        method: "POST",
        headers: forwardedHeaders(request),
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Transport confirmation is temporarily unavailable. Please refresh booking status." },
      { status: 503 },
    );
  }
}

export async function forwardTransportSelectionStatus(
  request: Request,
  selectionId: string,
): Promise<Response> {
  try {
    const response = await fetch(
      `${backendUrl}/api/transport/selections/${encodeURIComponent(selectionId)}`,
      {
        method: "GET",
        headers: forwardedHeaders(request),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Transport selection status is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
