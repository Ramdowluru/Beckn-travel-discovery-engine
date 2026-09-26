import { experienceOptions, stayOptions, transportOptions } from "@/lib/mockData";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const travellers = Number(url.searchParams.get("travellers") || "1");
  return Response.json({
    query: {
      from: url.searchParams.get("from") || "Visakhapatnam",
      to: url.searchParams.get("to") || "Hyderabad",
      date: url.searchParams.get("date") || "",
      travellers: Number.isFinite(travellers) && travellers > 0 ? travellers : 1,
    },
    counts: { transport: transportOptions.length, stays: stayOptions.length, experiences: experienceOptions.length },
    transport: transportOptions,
    stays: stayOptions,
    experiences: experienceOptions,
  }, { headers: { "Cache-Control": "no-store" } });
}