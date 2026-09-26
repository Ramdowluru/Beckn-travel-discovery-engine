import ContentPage from "@/components/ContentPage";

export default function CareersPage() {
  return <ContentPage eyebrow="TDE" title="Build the open travel layer" description="TDE is a final-year engineering project exploring better discovery across India's travel ecosystem." sections={[{ heading: "Current openings", body: "There are no formal openings at the moment, but we welcome thoughtful conversations about Beckn, travel infrastructure and product design." }, { heading: "Get in touch", body: "Send a note through our contact page with the area you would like to contribute to." }]} actions={[{ label: "Contact us", href: "/help/contact", primary: true }, { label: "About TDE", href: "/about" }]} />;
}