import { forwardAuthRequest } from "@/lib/serverBackend";

export async function POST(request: Request) {
  return forwardAuthRequest(request, "/api/auth/logout", {});
}
