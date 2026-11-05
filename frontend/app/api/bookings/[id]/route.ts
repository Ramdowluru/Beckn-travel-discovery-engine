import { forwardBookingRequest } from "@/lib/serverBackend";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const response = await forwardBookingRequest(request, `/api/bookings/${encodeURIComponent(id)}`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
