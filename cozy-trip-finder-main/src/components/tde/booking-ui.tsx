import { Bus, Hotel, Plane, Sparkles, TrainFront } from "lucide-react";
import { addDays, fmtDate, getService, inr, type Service } from "@/lib/tde/data";
import type { Booking } from "@/lib/tde/store";

export function KindIcon({ s, className = "h-5 w-5" }: { s: Service; className?: string }) {
  if (s.kind === "stay") return <Hotel className={className} />;
  if (s.kind === "experience") return <Sparkles className={className} />;
  if (s.mode === "Flight") return <Plane className={className} />;
  if (s.mode === "Bus") return <Bus className={className} />;
  return <TrainFront className={className} />;
}

export function kindLabel(s: Service) {
  return s.kind === "travel" ? s.mode! : s.kind === "stay" ? "Stay" : "Experience";
}

export function bookingWhen(b: Booking) {
  const s = getService(b.serviceId)!;
  if (s.kind === "travel") {
    const arr = s.overnight ? addDays(b.date, 1) : b.date;
    return `${fmtDate(b.date)}, ${s.depart} → ${fmtDate(arr)}, ${s.arrive} IST`;
  }
  if (s.kind === "stay") return `${fmtDate(b.date)} – ${fmtDate(b.endDate!)}`;
  return `${fmtDate(b.date)}, ${s.start}–${s.end} IST`;
}

export function countLabel(b: Booking) {
  if (b.kind === "stay") return `${b.rooms} room${b.rooms! > 1 ? "s" : ""} · ${b.qty} guest${b.qty > 1 ? "s" : ""}`;
  const w = b.kind === "travel" ? "traveller" : "participant";
  return `${b.qty} ${w}${b.qty > 1 ? "s" : ""}`;
}

export function StatusBadge({ status }: { status: Booking["status"] }) {
  return <span className={`badge ${status === "Confirmed" ? "text-success" : "text-destructive"}`}>{status}</span>;
}

export function downloadTicket(b: Booking) {
  const s = getService(b.serviceId)!;
  const doc = b.kind === "travel" ? "TICKET" : "VOUCHER";
  const lines = [
    `TDE — TRAVEL DISCOVERY ENGINE`, `${doc} (simulated booking)`, ``,
    `Reference: ${b.ref}`, `Status: ${b.status}`, `Service: ${s.name}`, `Provider: ${s.provider}`,
    `When: ${bookingWhen(b)}`, `Quantity: ${countLabel(b)}`,
    ...b.people.map((p, i) => `  ${i + 1}. ${p.name}${p.age ? `, ${p.age}` : ""}${p.room ? ` (Room ${p.room})` : ""}`),
    `Contact: ${b.contact.email} · ${b.contact.phone}`, `Total: ${inr(b.total)}`, ``, `No payment was collected.`,
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${b.ref}-${doc.toLowerCase()}.txt`; a.click();
  URL.revokeObjectURL(url);
}
