import { experienceOptions, stayOptions, transportOptions } from "@/lib/mockData";

export async function POST(request: Request) {
  const body = await request.json() as { from?: string; to?: string; date?: string; transportId?: string; stayId?: string; experienceId?: string };
  const transport = transportOptions.find((item) => item.id === body.transportId);
  const stay = stayOptions.find((item) => item.id === body.stayId);
  const experience = experienceOptions.find((item) => item.id === body.experienceId);
  const total = (transport?.priceNum || 0) + (stay ? Number(stay.totalPrice.replace(/[^\d]/g, "")) : 0) + (experience?.priceNum || 0);
  const reference = `TDE-${(body.to || "TRIP").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "TRI"}-${(body.date || "TRIP").replace(/-/g, "").slice(-6).toUpperCase()}`;
  return Response.json({ id: `booking-${reference.toLowerCase()}`, reference, status: "CONFIRMED", from: body.from || "Visakhapatnam", to: body.to || "Hyderabad", date: body.date || "", total, items: [transport, stay, experience].filter(Boolean) });
}