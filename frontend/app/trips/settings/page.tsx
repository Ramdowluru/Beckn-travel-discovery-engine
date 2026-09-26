import ContentPage from "@/components/ContentPage";

export default function TripsSettingsPage() {
  return <ContentPage eyebrow="Profile" title="Saved settings" description="Manage the travel details you use most often." sections={[{ heading: "Passenger details", body: "Your traveler details will be available here when account persistence is connected to the booking service." }, { heading: "Default search", body: "Your most recently used cities and traveler count are remembered by the search flow." }]} actions={[{ label: "My trips", href: "/trips", primary: true }]} />;
}