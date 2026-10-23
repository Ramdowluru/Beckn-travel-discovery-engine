/* ─── /api/bookings ───────────────────────────────────────────────
   Stub — returns a minimal booking shell.
   Wire to the real Beckn confirm flow when ready.
───────────────────────────────────────────────────────────────── */
export async function POST(request: Request) {
  const body = await request.json() as {
    from?: string;
    to?: string;
    date?: string;
    transportId?: string;
    stayId?: string;
    experienceId?: string;
  };

  const dest = (body.to ?? "TRIP").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "TRI";
  const datePart = (body.date ?? "").replace(/-/g, "").slice(-6).toUpperCase() || "000000";
  const reference = `TDE-${dest}-${datePart}`;

  return Response.json({
    id: `booking-${reference.toLowerCase()}`,
    reference,
    status: "PENDING",
    from: body.from ?? "",
    to: body.to ?? "",
    date: body.date ?? "",
    total: 0,
    items: [],
  });
}
