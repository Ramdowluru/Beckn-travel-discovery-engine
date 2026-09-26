import { experienceOptions } from "@/lib/mockData";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experience = experienceOptions.find((item) => item.id === id);
  return experience ? Response.json(experience) : Response.json({ error: "Experience not found" }, { status: 404 });
}