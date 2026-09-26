import { experienceOptions, stayOptions, transportOptions } from "@/lib/mockData";

interface QuoteRequest {
  transportId?: string;
  stayId?: string;
  experienceId?: string;
}

export async function POST(request: Request) {
  const body = await request.json() as QuoteRequest;
  const transport = transportOptions.find((item) => item.id === body.transportId);
  const stay = stayOptions.find((item) => item.id === body.stayId);
  const experience = experienceOptions.find((item) => item.id === body.experienceId);
  const items = [
    ...(transport ? [{ id: transport.id, type: transport.type, title: `${transport.provider} · ${transport.departureCity} → ${transport.arrivalCity}`, amount: transport.priceNum, displayAmount: transport.price }] : []),
    ...(stay ? [{ id: stay.id, type: "STAY", title: `${stay.name} · ${stay.nights} nights`, amount: Number(stay.totalPrice.replace(/[^\d]/g, "")), displayAmount: stay.totalPrice }] : []),
    ...(experience ? [{ id: experience.id, type: "EXPERIENCE", title: experience.name, amount: experience.priceNum, displayAmount: experience.price }] : []),
  ];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return Response.json({ items, total, displayTotal: `₹${total.toLocaleString("en-IN")}` });
}