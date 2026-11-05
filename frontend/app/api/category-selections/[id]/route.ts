import { forwardCategoryBookingRequest } from "@/lib/serverBackend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forwardCategoryBookingRequest(
    request,
    `/api/category-selections/${encodeURIComponent(id)}`,
    "GET",
  );
}
