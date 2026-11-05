import { forwardItineraryRequest } from "@/lib/serverBackend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await forwardItineraryRequest(
    request,
    `/api/itineraries/${encodeURIComponent(id)}`,
    "GET",
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
