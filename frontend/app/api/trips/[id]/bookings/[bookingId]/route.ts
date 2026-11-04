import { forwardTripRequest } from "@/lib/serverBackend";

interface RouteContext {
  params: Promise<{ id: string; bookingId: string }>;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id, bookingId } = await params;
  return forwardTripRequest(
    request,
    `/api/trips/${encodeURIComponent(id)}/bookings/${encodeURIComponent(bookingId)}`,
    "PUT",
  );
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id, bookingId } = await params;
  return forwardTripRequest(
    request,
    `/api/trips/${encodeURIComponent(id)}/bookings/${encodeURIComponent(bookingId)}`,
    "DELETE",
  );
}
