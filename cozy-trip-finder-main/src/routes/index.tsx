import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/tde/Shell";
import { SearchBar } from "@/components/tde/SearchBar";
import { SERVICES } from "@/lib/tde/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plan your trip — TDE Travel Discovery Engine" },
      { name: "description", content: "Compare flights, trains, buses, hotels and local experiences across India in one search." },
      { property: "og:title", content: "Plan your trip — TDE" },
      { property: "og:description", content: "One search. Every way to go." },
    ],
  }),
  component: Home,
});

function Home() {
  const stats = [
    [SERVICES.filter((s) => s.kind === "travel").length, "Transport options", "travel"],
    [SERVICES.filter((s) => s.kind === "stay").length, "Hotels & stays", "stays"],
    [SERVICES.filter((s) => s.kind === "experience").length, "Local experiences", "experiences"],
  ] as const;
  return (
    <Page className="py-16 md:py-24">
      <p className="eyebrow text-primary">Plan your trip</p>
      <h1 className="mt-6 text-5xl leading-[0.95] md:text-8xl">One search.<br />Every way to go.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">Compare flights, trains, buses, hotels and local experiences across India — then book directly with the provider.</p>
      <div className="mt-12"><SearchBar /></div>
      <div className="mt-10 grid grid-cols-1 border bg-card sm:grid-cols-3">
        {stats.map(([n, l, tab]) => (
          <Link key={l} to="/results" search={{ tab }} className="border-b px-6 py-8 text-center hover:bg-muted sm:border-b-0 sm:border-r last:border-0">
            <span className="block font-serif text-4xl">{n}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{l}</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
