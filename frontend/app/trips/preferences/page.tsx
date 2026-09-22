import ContentPage from "@/components/ContentPage";

export default function TripsPreferencesPage() {
  return <ContentPage eyebrow="Profile" title="Preferences" description="Shape the way TDE presents travel options to you." sections={[{ heading: "Travel style", body: "Choose whether you prefer the lowest price, shortest travel time, or a balance of both." }, { heading: "Communication", body: "Notification preferences will be available when account messaging is connected." }]} actions={[{ label: "My trips", href: "/trips", primary: true }]} />;
}