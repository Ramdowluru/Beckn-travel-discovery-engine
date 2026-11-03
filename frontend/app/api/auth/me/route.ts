import { forwardAuthGet } from "@/lib/serverBackend";

export async function GET(request: Request) {
  const response = await forwardAuthGet(request, "/api/auth/me");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
