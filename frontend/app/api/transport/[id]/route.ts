import { transportOptions } from "@/lib/mockData";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const option = transportOptions.find((item) => item.id === id);
  return option ? Response.json(option) : Response.json({ error: "Transport option not found" }, { status: 404 });
}