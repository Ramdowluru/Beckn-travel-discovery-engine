import type { ExperienceOption, StayOption, TransportOption } from "@/lib/types";

export interface SearchResponse {
  query: {
    from: string;
    to: string;
    date: string;
    travellers: number;
  };
  counts: {
    transport: number;
    stays: number;
    experiences: number;
  };
  transport: TransportOption[];
  stays: StayOption[];
  experiences: ExperienceOption[];
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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

export function signUpRequest(name: string, email: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function resetPasswordRequest(email: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/api/auth/password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}