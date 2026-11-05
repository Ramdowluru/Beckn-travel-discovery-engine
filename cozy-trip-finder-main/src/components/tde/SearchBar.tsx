import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useTde } from "@/lib/tde/store";
import { addDays } from "@/lib/tde/data";

export function SearchBar({ onDone }: { onDone?: () => void }) {
  const { search, setSearch } = useTde();
  const nav = useNavigate();
  const [f, setF] = useState(search);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch({ ...f, checkIn: addDays(f.date, 1), checkOut: addDays(f.date, 3) });
    onDone?.();
    nav({ to: "/results", search: { tab: "travel" } });
  };
  const cell = "flex flex-col justify-center border-b bg-card px-5 py-3 md:border-b-0 md:border-r";
  return (
    <form onSubmit={submit} className="grid border md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <label className={`${cell} relative`}>
        <span className="eyebrow">From</span>
        <input className="mt-1 bg-transparent text-lg outline-none" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <button type="button" aria-label="Swap" onClick={() => setF({ ...f, from: f.to, to: f.from })} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center border bg-card">
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
      </label>
      <label className={cell}>
        <span className="eyebrow">To</span>
        <input className="mt-1 bg-transparent text-lg outline-none" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </label>
      <label className={cell}>
        <span className="eyebrow">Travel date</span>
        <input type="date" className="mt-1 bg-transparent text-lg outline-none" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </label>
      <div className={cell}>
        <span className="eyebrow">Travellers</span>
        <div className="mt-1 flex items-center gap-3">
          <button type="button" aria-label="Fewer" className="flex h-8 w-8 items-center justify-center border" onClick={() => setF({ ...f, travellers: Math.max(1, f.travellers - 1) })}><Minus className="h-3.5 w-3.5" /></button>
          <span className="text-lg">{f.travellers} Traveller{f.travellers > 1 ? "s" : ""}</span>
          <button type="button" aria-label="More" className="flex h-8 w-8 items-center justify-center border" onClick={() => setF({ ...f, travellers: Math.min(9, f.travellers + 1) })}><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <button className="btn btn-primary min-h-16 px-10 text-base">Search</button>
    </form>
  );
}
