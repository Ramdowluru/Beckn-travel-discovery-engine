import { forwardTransportSelectionStatus } from "@/lib/serverBackend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await forwardTransportSelectionStatus(request, id);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
