import { forwardTransportRequest } from "@/lib/serverBackend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const transactionId = new URL(request.url).searchParams.get("transaction_id") ?? "";
  const response = await forwardTransportRequest(id, transactionId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
