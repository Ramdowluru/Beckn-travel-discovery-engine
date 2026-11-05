import ContentPage from "@/components/ContentPage";

export default function GoaBeachReceiptPage() {
  return <ContentPage eyebrow="Sample trip" title="Goa Beach Trip" description="Illustrative legacy sample content; this page is not a real booking receipt." sections={[{ heading: "Sample itinerary", body: "This static example is separate from bookings created through the mock provider flow." }, { heading: "Payment status", body: "No payment was collected. The sample amounts and booking status are not provider-confirmed." }, { heading: "Prototype notice", body: "This page and any example reference are not valid for travel." }]} actions={[{ label: "Back to trip", href: "/trips/goa-beach", primary: true }, { label: "My trips", href: "/trips" }]} />;
}