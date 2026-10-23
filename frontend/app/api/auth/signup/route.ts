import { forwardAuthRequest } from "@/lib/serverBackend";

export async function POST(request: Request) {
  const body = await request.json();
  const response = await forwardAuthRequest("/api/auth/signup", body);
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}