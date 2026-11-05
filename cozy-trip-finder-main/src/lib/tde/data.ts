export type Kind = "travel" | "stay" | "experience";
export type Mode = "Flight" | "Train" | "Bus";

export interface Service {
  id: string;
  kind: Kind;
  name: string;
  provider: string;
  mode?: Mode;
  from?: string;
  to?: string;
  depart?: string; // HH:MM
  arrive?: string;
  overnight?: boolean;
  duration?: string;
  location?: string;
  start?: string;
  end?: string;
  price: number; // per person / per room per night
  about: string;
  included: string[];
  cancellation: string;
  rating?: number;
}

export const SERVICES: Service[] = [
  { id: "trn-001", kind: "travel", mode: "Train", name: "Southern Rail Connect", provider: "Southern Rail Connect", from: "Vijayawada", to: "Hyderabad", depart: "05:45", arrive: "13:05", duration: "7h 20m", price: 240, about: "Sleeper-class intercity service with reserved seating.", included: ["Reserved seat", "Onboard water"], cancellation: "Free cancellation up to 4 hours before departure." },
  { id: "trn-002", kind: "travel", mode: "Train", name: "Southern Rail Connect", provider: "Southern Rail Connect", from: "Vijayawada", to: "Hyderabad", depart: "14:20", arrive: "19:50", duration: "5h 30m", price: 610, about: "AC chair car express.", included: ["AC chair car", "Meal on request"], cancellation: "Free cancellation up to 4 hours before departure." },
  { id: "trn-003", kind: "travel", mode: "Train", name: "Southern Rail Connect", provider: "Southern Rail Connect", from: "Vijayawada", to: "Hyderabad", depart: "18:10", arrive: "23:10", duration: "5h 00m", price: 890, about: "AC 3-tier evening express.", included: ["Berth", "Bedding"], cancellation: "Free cancellation up to 4 hours before departure." },
  { id: "bus-001", kind: "travel", mode: "Bus", name: "Deccan Night Rider", provider: "Deccan Coachways", from: "Vijayawada", to: "Hyderabad", depart: "22:00", arrive: "04:15", overnight: true, duration: "6h 15m", price: 950, about: "AC sleeper coach departing Benz Circle.", included: ["Sleeper berth", "Blanket", "Charging point"], cancellation: "Free cancellation up to 6 hours before departure." },
  { id: "bus-002", kind: "travel", mode: "Bus", name: "Krishna Express Coach", provider: "Deccan Coachways", from: "Vijayawada", to: "Hyderabad", depart: "08:30", arrive: "14:30", duration: "6h 00m", price: 620, about: "AC seater coach.", included: ["Reclining seat"], cancellation: "Free cancellation up to 6 hours before departure." },
  { id: "flt-001", kind: "travel", mode: "Flight", name: "SkyDeccan 6E-401", provider: "SkyDeccan Airways", from: "Vijayawada", to: "Hyderabad", depart: "07:10", arrive: "08:15", duration: "1h 05m", price: 3450, about: "Direct economy flight.", included: ["7 kg cabin bag", "15 kg checked bag"], cancellation: "Cancellation fee of ₹1,500 applies." },
  { id: "flt-002", kind: "travel", mode: "Flight", name: "SkyDeccan 6E-417", provider: "SkyDeccan Airways", from: "Vijayawada", to: "Hyderabad", depart: "19:40", arrive: "20:45", duration: "1h 05m", price: 4100, about: "Direct economy flight.", included: ["7 kg cabin bag", "15 kg checked bag"], cancellation: "Cancellation fee of ₹1,500 applies." },
  { id: "sty-001", kind: "stay", name: "StayNest Charminar Heritage — Standard", provider: "StayNest Hotels", location: "Hyderabad", price: 2800, rating: 4.3, about: "Standard room in a restored heritage building near Charminar.", included: ["Breakfast", "Wi-Fi", "Free cancellation"], cancellation: "Free cancellation up to 24 hours before check-in date." },
  { id: "sty-002", kind: "stay", name: "Banjara Courtyard — Deluxe", provider: "Courtyard Stays", location: "Hyderabad", price: 4100, rating: 4.6, about: "Deluxe room with garden view in Banjara Hills.", included: ["Wi-Fi", "Parking", "Restaurant"], cancellation: "Non-refundable within 48 hours of check-in date." },
  { id: "exp-001", kind: "experience", name: "Hyderabadi Biryani Food Trail", provider: "LocalTrails Experiences", location: "Hyderabad", start: "09:00", end: "11:30", duration: "2h 30m", price: 1200, rating: 4.8, about: "A guided walk through the old city's biryani kitchens with tastings.", included: ["Local guide", "4 tastings", "Bottled water"], cancellation: "Free cancellation up to 24 hours before start." },
  { id: "exp-002", kind: "experience", name: "Golconda Fort Heritage Walk", provider: "LocalTrails Experiences", location: "Hyderabad", start: "16:00", end: "18:00", duration: "2h 00m", price: 800, rating: 4.5, about: "Sunset heritage walk through Golconda Fort.", included: ["Local guide", "Entry ticket"], cancellation: "Free cancellation up to 24 hours before start." },
];

export const getService = (id: string) => SERVICES.find((s) => s.id === id);

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

/** Parse YYYY-MM-DD as a calendar date (no timezone conversion). */
export function fmtDate(d: string, opts: { weekday?: boolean } = {}) {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const s = `${day} ${months[m - 1]} ${y}`;
  if (!opts.weekday) return s;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${wd}, ${s}`;
}

export function addDays(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return dt.toISOString().slice(0, 10);
}

export function nightsBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
}

export function hotelTotal(rate: number, rooms: number, nights: number) {
  return rate * rooms * nights;
}
