import { forwardCategoryBookingRequest } from "@/lib/serverBackend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await forwardCategoryBookingRequest(
    request,
    `/api/category-selections/${encodeURIComponent(id)}/cancel`,
    "POST",
    await request.json(),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
