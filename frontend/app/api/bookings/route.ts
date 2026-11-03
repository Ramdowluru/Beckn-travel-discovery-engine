import { forwardBookingRequest } from "@/lib/serverBackend";

export async function GET(request: Request) {
  const response = await forwardBookingRequest(request, "/api/bookings");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
