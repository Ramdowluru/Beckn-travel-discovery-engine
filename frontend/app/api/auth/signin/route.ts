import { forwardAuthRequest } from "@/lib/serverBackend";

export async function POST(request: Request) {
  const body = await request.json();
  return forwardAuthRequest(request, "/api/auth/signin", body);
}