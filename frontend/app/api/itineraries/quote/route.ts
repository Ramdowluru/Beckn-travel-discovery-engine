/* ─── /api/itineraries/quote ──────────────────────────────────────
   Stub — returns an empty quote.
   Wire to the real pricing engine when ready.
───────────────────────────────────────────────────────────────── */
export async function POST() {
  return Response.json({
    items: [],
    total: 0,
    displayTotal: "₹0",
  });
}
