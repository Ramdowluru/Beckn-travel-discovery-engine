import ContentPage from "@/components/ContentPage";

export default function MumbaiBusinessManagePage() {
  return <ContentPage eyebrow="Manage booking" title="Mumbai Business" description="Manage the details of your upcoming trip. Provider changes are handled directly with the relevant transport or stay partner." sections={[{ heading: "Change dates", body: "Date changes depend on the fare and room rules selected with each provider." }, { heading: "Cancellation", body: "Review each provider's cancellation policy before requesting a change." }, { heading: "Need help?", body: "Our support team can help you find the right provider contact details." }]} actions={[{ label: "View trip", href: "/trips/mumbai-business", primary: true }, { label: "Contact support", href: "/help/contact" }]} />;
}