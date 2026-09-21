import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ResultsClient from "./ResultsClient";

export default function ResultsPage() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <Suspense fallback={<div style={{ padding: "2rem" }}>Loading...</div>}>
          <ResultsClient />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
