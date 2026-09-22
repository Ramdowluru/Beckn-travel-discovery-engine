import ContentPage from "@/components/ContentPage";

export default function GoaBeachReceiptPage() {
  return <ContentPage eyebrow="Booking receipt" title="Goa Beach Trip" description="Your receipt for the completed Goa booking is ready to review." sections={[{ heading: "Payment summary", body: "Transport, accommodation and one local experience were included in this trip for a total of ₹18,400." }, { heading: "Provider payments", body: "Each provider was paid directly. TDE added no booking markup to this journey." }, { heading: "Booking status", body: "Completed. Keep this page with your travel records." }]} actions={[{ label: "Back to trip", href: "/trips/goa-beach", primary: true }, { label: "My trips", href: "/trips" }]} />;
}