const trips = [
  { id: "hyd-weekend", title: "Hyderabad Weekend", status: "SAVED", route: "Visakhapatnam → Hyderabad", dates: "15 – 17 Sep", included: "Flight, hotel and 1 experience", total: "₹10,600", primaryCta: "Manage booking", primaryHref: "/itinerary", secondaryCta: "View trip", secondaryHref: "/booking/confirm" },
  { id: "goa-beach", title: "Goa Beach Trip", status: "COMPLETED", route: "Visakhapatnam → Goa", dates: "22 – 25 Oct", included: "Flight, hotel and 1 experience", total: "₹18,400", primaryCta: "View receipt", primaryHref: "/trips/goa-beach/receipt", secondaryCta: "View trip", secondaryHref: "/trips/goa-beach" },
  { id: "mumbai-business", title: "Mumbai Business", status: "UPCOMING", route: "Visakhapatnam → Mumbai", dates: "5 – 6 Nov", included: "Flight and hotel", total: "₹12,200", primaryCta: "Manage booking", primaryHref: "/trips/mumbai-business/manage", secondaryCta: "View trip", secondaryHref: "/trips/mumbai-business" },
] as const;

export async function GET() {
  return Response.json(trips);
}