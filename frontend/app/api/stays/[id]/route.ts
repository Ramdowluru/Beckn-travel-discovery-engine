import { stayOptions } from "@/lib/mockData";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stay = stayOptions.find((item) => item.id === id);
  return stay ? Response.json(stay) : Response.json({ error: "Stay not found" }, { status: 404 });
}