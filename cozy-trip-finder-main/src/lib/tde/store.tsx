import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Kind } from "./data";

export interface SearchCtx { from: string; to: string; date: string; travellers: number; checkIn: string; checkOut: string; rooms: number }
export interface Person { name: string; age?: string; gender?: string; room?: number }
export interface Booking {
  id: string; ref: string; serviceId: string; kind: Kind; status: "Confirmed" | "Cancelled";
  date: string; endDate?: string; qty: number; rooms?: number; people: Person[];
  contact: { email: string; phone: string }; total: number; cancelReason?: string; createdAt: string;
}
export interface Trip { id: string; name: string; destination: string; bookingIds: string[] }

const SEED_BOOKINGS: Booking[] = [
  { id: "b1", ref: "TDE-BUS-7Q2K", serviceId: "bus-001", kind: "travel", status: "Confirmed", date: "2026-11-10", endDate: "2026-11-11", qty: 1, people: [{ name: "Bapuji Dowluru", age: "24", gender: "Male" }], contact: { email: "bapuji@example.com", phone: "9876543210" }, total: 950, createdAt: "2026-11-05T09:10:00" },
  { id: "b2", ref: "TDE-STY-4M8P", serviceId: "sty-001", kind: "stay", status: "Confirmed", date: "2026-11-11", endDate: "2026-11-13", qty: 1, rooms: 1, people: [{ name: "Bapuji Dowluru", room: 1 }], contact: { email: "bapuji@example.com", phone: "9876543210" }, total: 5600, createdAt: "2026-11-05T09:14:00" },
  { id: "b3", ref: "TDE-EXP-9D1R", serviceId: "exp-001", kind: "experience", status: "Confirmed", date: "2026-11-11", qty: 1, people: [{ name: "Bapuji Dowluru", age: "24" }], contact: { email: "bapuji@example.com", phone: "9876543210" }, total: 1200, createdAt: "2026-11-05T09:18:00" },
];
const SEED_TRIPS: Trip[] = [{ id: "t1", name: "Hyderabad trip", destination: "Hyderabad", bookingIds: ["b1", "b2", "b3"] }];
const DEFAULT_SEARCH: SearchCtx = { from: "Vijayawada", to: "Hyderabad", date: "2026-11-10", travellers: 1, checkIn: "2026-11-11", checkOut: "2026-11-13", rooms: 1 };

interface State { search: SearchCtx; bookings: Booking[]; trips: Trip[]; drafts: Record<string, unknown>; user: string | null }
interface Api extends State {
  setSearch: (s: Partial<SearchCtx>) => void;
  addBooking: (b: Booking) => void;
  cancelBooking: (id: string, reason: string) => void;
  addToTrip: (bookingId: string, tripId?: string) => string;
  saveDraft: (key: string, v: unknown) => void;
  signIn: (name: string) => void;
}
const Ctx = createContext<Api | null>(null);
const KEY = "tde-state-v1";

export function TdeProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>({ search: DEFAULT_SEARCH, bookings: SEED_BOOKINGS, trips: SEED_TRIPS, drafts: {}, user: "Bapuji" });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) set({ ...JSON.parse(raw) }); } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(s)); }, [s, loaded]);

  const api: Api = {
    ...s,
    setSearch: (p) => set((x) => ({ ...x, search: { ...x.search, ...p } })),
    addBooking: (b) => set((x) => ({ ...x, bookings: [b, ...x.bookings] })),
    cancelBooking: (id, reason) => set((x) => ({ ...x, bookings: x.bookings.map((b) => (b.id === id ? { ...b, status: "Cancelled", cancelReason: reason } : b)) })),
    addToTrip: (bookingId, tripId) => {
      const target = tripId ?? s.trips[0]?.id ?? "t" + Date.now();
      set((x) => {
        const exists = x.trips.find((t) => t.id === target);
        const trips = exists
          ? x.trips.map((t) => (t.id === target && !t.bookingIds.includes(bookingId) ? { ...t, bookingIds: [...t.bookingIds, bookingId] } : t))
          : [...x.trips, { id: target, name: `${x.search.to} trip`, destination: x.search.to, bookingIds: [bookingId] }];
        return { ...x, trips };
      });
      return target;
    },
    saveDraft: (k, v) => set((x) => ({ ...x, drafts: { ...x.drafts, [k]: v } })),
    signIn: (name) => set((x) => ({ ...x, user: name })),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTde() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTde outside provider");
  return c;
}
