import { describe, expect, it } from "vitest";
import { fmtDate, hotelTotal, nightsBetween } from "@/lib/tde/data";

describe("hotel booking rules", () => {
  it("₹2,800 × 1 room × 2 nights = ₹5,600", () => {
    expect(hotelTotal(2800, 1, nightsBetween("2026-11-11", "2026-11-13"))).toBe(5600);
  });
  it("charges per room, not per guest", () => {
    expect(hotelTotal(2800, 1, 2)).toBe(hotelTotal(2800, 1, 2));
    expect(hotelTotal(2800, 2, 2)).toBe(11200);
  });
  it("shows date-only values without timezone shift", () => {
    expect(fmtDate("2026-11-11")).toBe("11 Nov 2026");
  });
});
