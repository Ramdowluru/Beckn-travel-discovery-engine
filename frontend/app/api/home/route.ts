import { transportOptions } from "@/lib/mockData";

export async function GET() {
  const popularIds = ["skyconnect-vtz-hyd", "railway-12727", "intercity-bus"];
  const popularOptions = popularIds.flatMap((id) => {
    const option = transportOptions.find((item) => item.id === id);
    return option ? [{ ...option, type: option.type === "FLIGHT" ? "Flight" : option.type === "TRAIN" ? "Train" : "Bus" }] : [];
  });
  return Response.json({
    popularOptions,
    stats: [
      { value: String(transportOptions.length), label: "Transport options" },
      { value: "42", label: "Hotels & stays" },
      { value: "18", label: "Local experiences" },
      { value: "4.6★", label: "Average rating" },
    ],
  });
}