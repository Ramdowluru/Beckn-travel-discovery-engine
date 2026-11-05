import { forwardSearchRequest } from "@/lib/serverBackend";

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of [
    "from",
    "to",
    "date",
    "travellers",
    "check_in",
    "check_out",
    "rooms",
    "guests",
    "experience_date",
    "participants",
    "tab",
  ]) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }

  const response = await forwardSearchRequest(query);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
