import { forwardTripRequest } from "@/lib/serverBackend";

export async function GET(request: Request) {
  return forwardTripRequest(request, "/api/trips", "GET");
}

export async function POST(request: Request) {
  return forwardTripRequest(request, "/api/trips", "POST");
}
