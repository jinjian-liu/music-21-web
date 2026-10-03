// @vitest-environment node
import { describe, it, expect } from "vitest";
import { assertTransition } from "./pieces";
const ready = {
  parse_status: "ready",
  publication_status: "private",
  rights_confirmed: true,
  rights_source: "原创",
};
describe("publication rules", () => {
  it("requires parsed files and valid rights", () => {
    expect(() =>
      assertTransition("submit", { ...ready, parse_status: "queued" }),
    ).toThrow("INVALID_STATE");
    expect(() =>
      assertTransition("submit", { ...ready, rights_confirmed: false }),
    ).toThrow("RIGHTS_REQUIRED");
    expect(() =>
      assertTransition("submit", { ...ready, rights_expires_at: "2000-01-01" }),
    ).toThrow("RIGHTS_REQUIRED");
  });
  it("permits rejected resubmission, disallows approval or removal from unrelated states", () => {
    expect(() =>
      assertTransition("submit", { ...ready, publication_status: "rejected" }),
    ).not.toThrow();
    expect(() => assertTransition("approve", ready)).toThrow("INVALID_STATE");
    expect(() =>
      assertTransition("remove", { ...ready, publication_status: "rejected" }),
    ).toThrow("INVALID_STATE");
    expect(() =>
      assertTransition("approve", {
        ...ready,
        publication_status: "pending_review",
      }),
    ).not.toThrow();
  });
});
