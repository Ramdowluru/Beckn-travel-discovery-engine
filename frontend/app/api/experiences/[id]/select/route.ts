import { forwardCategoryBookingRequest } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const transactionId = new URL(request.url).searchParams.get("transaction_id") ?? "";
  const body = await request.json();
  return forwardCategoryBookingRequest(
    request,
    `/api/experiences/${encodeURIComponent(id)}/select?transaction_id=${encodeURIComponent(transactionId)}`,
    "POST",
    body,
  );
}
