import ContentPage from "@/components/ContentPage";

export default function PartnerJoinPage() {
  return <ContentPage eyebrow="Partner network" title="Become a partner" description="Bring your transport, stay or local experience to travelers planning their next journey." sections={[{ heading: "Direct relationships", body: "TDE helps providers reach travelers without platform markup on the booking." }, { heading: "What you can offer", body: "Transport options, stays and local experiences can all be discovered through the network." }, { heading: "Start a conversation", body: "Share your provider details with our partnerships team to discuss onboarding." }]} actions={[{ label: "Contact partnerships", href: "/help/contact", primary: true }, { label: "Our partners", href: "/partners" }]} />;
}