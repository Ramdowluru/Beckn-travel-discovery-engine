import type { ExperienceOption, StayOption, TransportOption } from "@/lib/mockData";

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
    name: string;
    email: string;
    initials: string;
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchSearch(params: URLSearchParams): Promise<SearchResponse> {
  return requestJson<SearchResponse>(`/api/search?${params.toString()}`);
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

export function signUpRequest(name: string, email: string, password: string): Promise<{ verificationCode: string }> {
  return requestJson<{ verificationCode: string }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function verifySignUpRequest(name: string, email: string, code: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ name, email, code }),
  });
}

export function resetPasswordRequest(email: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/api/auth/password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}