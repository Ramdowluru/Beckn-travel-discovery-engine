import { forwardAuthGet } from "@/lib/serverBackend";

export async function GET(request: Request) {
  const response = await forwardAuthGet(request, "/api/auth/csrf");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
