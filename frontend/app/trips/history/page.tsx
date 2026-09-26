import ContentPage from "@/components/ContentPage";

export default function TripsHistoryPage() {
  return <ContentPage eyebrow="Profile" title="Travel history" description="A record of journeys completed through your TDE account." sections={[{ heading: "Completed journeys", body: "Your completed bookings will appear here once trip history is connected to the booking service." }, { heading: "Receipts", body: "Receipts can be opened from each completed trip." }]} actions={[{ label: "My trips", href: "/trips", primary: true }]} />;
}