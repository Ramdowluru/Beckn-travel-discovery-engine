import type { ExperienceOption, StayOption, TransportOption } from "@/lib/types";

export interface SearchResponse {
  transaction_id: string;
  query: {
    from?: string;
    to: string;
    date?: string;
    travellers?: number;
    check_in?: string;
    check_out?: string;
    rooms?: number;
    guests?: number;
  };
  counts: {
    transport: number;
    stays: number;
    experiences: number;
  };
  transport: TransportOption[];
  stays: StayOption[];
  experiences: ExperienceOption[];
  providers_expected: number;
  providers_replied: number;
  partial_results: boolean;
}

export function refreshCategoryBookingStatus(
  selectionId: string,
): Promise<CategorySelectionResponse> {
  return requestJson(`/api/category-selections/${encodeURIComponent(selectionId)}/status`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface TripRecord {
  id: string;
  title: string;
  status: "SAVED" | "COMPLETED" | "UPCOMING";
  route: string;
  dates: string;
  included: string;
  total: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
}

export function refreshTransportBookingStatus(
  selectionId: string,
): Promise<TransportSelectionResponse> {
  return requestJson(`/api/transport/selections/${encodeURIComponent(selectionId)}/status`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface SavedItinerary {
  id: string;
  transport: TransportOption;
  query: {
    from: string;
    to: string;
    date: string;
    travellers: number;
  };
  price_status: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function ensureCsrfToken(): Promise<void> {
  const existing = typeof document === "undefined"
    ? ""
    : document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("tde_csrf="));
  if (existing) return;
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ApiError("Authentication service is unavailable. Please try again.", response.status);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    await ensureCsrfToken();
  }
  const csrfToken = typeof document === "undefined"
    ? null
    : document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("tde_csrf="))
        ?.slice("tde_csrf=".length) ?? null;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": decodeURIComponent(csrfToken) } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await response.json() as {
        detail?: string | { msg?: string }[];
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((item) => item.msg || "Invalid input.").join(" ");
      }

    } catch {
      /* Use the generic message when the server response is not JSON. */
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export function fetchSearch(params: URLSearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  return requestJson<SearchResponse>(`/api/search?${params.toString()}`, { signal });
}

export function fetchTrips(): Promise<TripRecord[]> {
  return requestJson<TripRecord[]>("/api/trips");
}

export function signInRequest(email: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function confirmCategoryRequest(
  selectionId: string,
  acceptedQuote: { currency: string; value: string },
): Promise<CategorySelectionResponse> {
  return requestJson(`/api/category-selections/${encodeURIComponent(selectionId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ accept_final_quote: true, accepted_quote: acceptedQuote }),
  });
}

export function cancelCategoryRequest(
  selectionId: string,
  reason: string,
): Promise<CategorySelectionResponse> {
  return requestJson(`/api/category-selections/${encodeURIComponent(selectionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ confirm_cancellation: true, reason }),
  });
}

export function signUpRequest(name: string, email: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function meRequest(): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/me");
}

export function logoutRequest(): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function saveItineraryRequest(
  transactionId: string,
  offerId: string,
): Promise<SavedItinerary> {
  return requestJson<SavedItinerary>("/api/itineraries", {
    method: "POST",
    body: JSON.stringify({
      transaction_id: transactionId,
      offer_id: offerId,
    }),
  });
}

export function selectTransportRequest(
  offerId: string,
  transactionId: string,
  quantity: number,
): Promise<{ selection_id: string; state: string; quote?: { price?: { currency?: string; value?: string } } }> {
  return requestJson(`/api/transport/${encodeURIComponent(offerId)}/select?transaction_id=${encodeURIComponent(transactionId)}`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
}

export function initTransportRequest(
  selectionId: string,
  travellers: Array<{ name: string }>,
  contactEmail: string,
  contactPhone: string,
): Promise<TransportSelectionResponse> {
  return requestJson(`/api/transport/selections/${encodeURIComponent(selectionId)}/init`, {
    method: "POST",
    body: JSON.stringify({
      travellers,
      contact_email: contactEmail,
      contact_phone: contactPhone,
    }),
  });
}

export function getTransportSelectionRequest(
  selectionId: string,
): Promise<TransportSelectionResponse> {
  return requestJson(`/api/transport/selections/${encodeURIComponent(selectionId)}`);
}

export function confirmTransportRequest(
  selectionId: string,
  acceptedQuote: { currency: string; value: string },
): Promise<TransportSelectionResponse> {
  return requestJson(`/api/transport/selections/${encodeURIComponent(selectionId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ accept_final_quote: true, accepted_quote: acceptedQuote }),
  });
}

export function cancelTransportRequest(
  selectionId: string,
  reason: string,
): Promise<TransportSelectionResponse> {
  return requestJson(`/api/transport/selections/${encodeURIComponent(selectionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ confirm_cancellation: true, reason }),
  });
}

export interface CategorySelectionResponse {
  selection_id: string;
  state: string;
  kind?: "hotel" | "experience";
  quote?: {
    price?: { currency?: string; value?: string };
    breakup?: Array<{ title?: string; price?: { currency?: string; value?: string } }>;
  };
  init_state?: string;
  price_changed?: boolean;
  customer_details?: {
    travellers?: Array<{ name: string }>;
    people?: Array<{ name: string }>;
    room_assignments?: number[];
    contact_email?: string;
    contact_phone?: string;
  };
  booking_display?: Record<string, unknown>;
  order?: {
    id?: string;
    state?: string;
    status?: string;
    provider?: { id?: string; descriptor?: { name?: string } };
    items?: Array<{ id?: string; descriptor?: { name?: string }; quantity?: { selected?: { count?: number } } }>;
    fulfillments?: Array<{ type?: string; start?: { time?: { timestamp?: string } }; end?: { time?: { timestamp?: string } }; stops?: Array<{ type?: string; location?: { descriptor?: { name?: string } }; time?: { timestamp?: string } }> }>;
    quote?: {
      price?: { currency?: string; value?: string };
      breakup?: Array<{ title?: string; price?: { currency?: string; value?: string } }>;
    };
    payments?: Array<{ status?: string }>;
    cancellation?: {
      time?: string;
      cancelled_by?: string;
      reason?: { id?: string; descriptor?: { short_desc?: string } };
    };
  };
  confirm_state?: string;
  accepted_quote?: { currency?: string; value?: string };
  confirmed_order?: {
    message?: { order?: CategorySelectionResponse["order"] };
  };
  confirm_error?: string;
  provider_status?: {
    message?: { order?: CategorySelectionResponse["order"] };
    error?: { code?: string; message?: string };
  };
  status_state?: string;
  status_message?: string;
  status_error?: string;
  status_response?: CategorySelectionResponse["provider_status"];
  cancel_state?: string;
  cancel_error?: string;
  cancellation_policy?: string;
  cancelled_order?: {
    message?: { order?: CategorySelectionResponse["order"] };
    error?: { code?: string; message?: string };
  };
}

export type TransportSelectionResponse = Omit<CategorySelectionResponse, "kind">;

export interface BookingRecord {
  id: string;
  kind: "transport" | "hotel" | "experience";
  status: "CONFIRMED" | "CANCELLED" | "PENDING_UNKNOWN" | "INITIALIZED" | "REJECTED";
  selection_state?: string;
  init_state?: string;
  confirm_state?: string;
  cancel_state?: string;
  transaction_id?: string;
  provider_id?: string;
  provider_name?: string;
  provider_order_id?: string;
  service?: string;
  display: {
    type?: string;
    route?: string;
    departure?: string;
    arrival?: string;
    departureCity?: string;
    arrivalCity?: string;
    location?: string;
    checkIn?: string;
    checkOut?: string;
    date?: string;
    time?: string;
    [key: string]: unknown;
  };
  criteria: Record<string, unknown>;
  quantity?: number;
  quote?: {
    price?: { currency?: string; value?: string };
    breakup?: Array<{ title?: string; price?: { currency?: string; value?: string } }>;
  };
  customer_details: {
    travellers?: Array<{ name: string }>;
    people?: Array<{ name: string }>;
    room_assignments?: number[];
    contact_email?: string;
    contact_phone?: string;
  };
  order: {
    payments?: Array<{ status?: string }>;
    fulfillments?: Array<{
      start?: { time?: { timestamp?: string }; location?: { address?: { name?: string } } };
      end?: { time?: { timestamp?: string }; location?: { address?: { name?: string } } };
    }>;
  };
  cancellation_policy?: string;
}

export function getBookingsRequest(): Promise<BookingRecord[]> {
  return requestJson("/api/bookings");
}

export function getBookingRequest(bookingId: string): Promise<BookingRecord> {
  return requestJson(`/api/bookings/${encodeURIComponent(bookingId)}`);
}

export function selectCategoryRequest(
  kind: "hotel" | "experience",
  offerId: string,
  transactionId: string,
  quantity: number,
): Promise<CategorySelectionResponse> {
  const category = kind === "hotel" ? "stays" : "experiences";
  return requestJson(`/api/${category}/${encodeURIComponent(offerId)}/select?transaction_id=${encodeURIComponent(transactionId)}`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
}

export function getCategorySelectionRequest(
  selectionId: string,
): Promise<CategorySelectionResponse> {
  return requestJson(`/api/category-selections/${encodeURIComponent(selectionId)}`);
}

export function initCategoryRequest(
  selectionId: string,
  people: Array<{ name: string }>,
  roomAssignments: number[] | undefined,
  contactEmail: string,
  contactPhone: string,
): Promise<CategorySelectionResponse> {
  return requestJson(`/api/category-selections/${encodeURIComponent(selectionId)}/init`, {
    method: "POST",
    body: JSON.stringify({
      people,
      ...(roomAssignments ? { room_assignments: roomAssignments } : {}),
      contact_email: contactEmail,
      contact_phone: contactPhone,
    }),
  });
}

export function resetPasswordRequest(email: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/api/auth/password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}