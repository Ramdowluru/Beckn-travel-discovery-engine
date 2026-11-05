import { forwardItineraryRequest } from "@/lib/serverBackend";

export async function GET(request: Request) {
  const response = await forwardItineraryRequest(request, "/api/itineraries", "GET");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const body = await request.json();
  const response = await forwardItineraryRequest(request, "/api/itineraries", "POST", body);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
