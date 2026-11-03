import { forwardTransportInit } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await forwardTransportInit(request, id, await request.json());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
