import TripPage from "@/components/TripPage";

export default function GoaBeachTripPage() {
  return <TripPage title="Goa Beach Trip" status="COMPLETED" route="Visakhapatnam → Goa" dates="22 – 25 Oct" included="Flight, hotel and 1 experience" total="₹18,400" description="Your completed Goa trip, with the booking summary and receipt available below." actions={[{ label: "View receipt", href: "/trips/goa-beach/receipt", primary: true }, { label: "Back to my trips", href: "/trips" }]} />;
}