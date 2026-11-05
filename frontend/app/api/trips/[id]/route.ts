import { forwardTripRequest } from "@/lib/serverBackend";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return forwardTripRequest(
    request,
    `/api/trips/${encodeURIComponent(id)}`,
    "GET",
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return forwardTripRequest(
    request,
    `/api/trips/${encodeURIComponent(id)}`,
    "PATCH",
  );
}
