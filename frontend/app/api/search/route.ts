/* ─── /api/search ─────────────────────────────────────────────────
   Stub — returns empty result sets.
   Wire to the real Beckn backend when ready.
───────────────────────────────────────────────────────────────── */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const travellers = Number(url.searchParams.get("travellers") || "1");

  return Response.json(
    {
      query: {
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        date: url.searchParams.get("date") || "",
        travellers: Number.isFinite(travellers) && travellers > 0 ? travellers : 1,
      },
      counts: { transport: 0, stays: 0, experiences: 0 },
      transport: [],
      stays: [],
      experiences: [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
