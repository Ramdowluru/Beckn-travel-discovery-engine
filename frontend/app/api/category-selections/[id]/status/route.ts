import { forwardCategoryBookingRequest } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await forwardCategoryBookingRequest(
    request,
    `/api/category-selections/${encodeURIComponent(id)}/status`,
    "POST",
    {},
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
