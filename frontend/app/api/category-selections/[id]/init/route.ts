import { forwardCategoryBookingRequest } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  return forwardCategoryBookingRequest(
    request,
    `/api/category-selections/${encodeURIComponent(id)}/init`,
    "POST",
    body,
  );
}
