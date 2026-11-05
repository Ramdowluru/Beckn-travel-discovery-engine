import { forwardTransportSelection } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const transactionId = new URL(request.url).searchParams.get("transaction_id") ?? "";
  const body = await request.json();
  const response = await forwardTransportSelection(request, id, transactionId, body);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
