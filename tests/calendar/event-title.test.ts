import { describe, expect, it } from "vitest";

import { splitEventTitle } from "@/lib/calendar/event-title";

describe("splitEventTitle", () => {
  it("drops a code the title already starts with", () => {
    expect(splitEventTitle("INFS2702", "INFS2702 - TUT")).toEqual({ code: "INFS2702", title: "TUT" });
    expect(splitEventTitle("GSOE9445", "GSOE9445 — Final Examination")).toEqual({
      code: "GSOE9445",
      title: "Final Examination",
    });
    expect(splitEventTitle("COMP 9414", "comp9414: Lecture 3")).toEqual({ code: "COMP 9414", title: "Lecture 3" });
  });

  it("keeps titles that don't start with the code, or are only the code", () => {
    expect(splitEventTitle("INFS2702", "Group Project 1")).toEqual({ code: "INFS2702", title: "Group Project 1" });
    expect(splitEventTitle("INFS2702", "INFS2702")).toEqual({ code: "INFS2702", title: "INFS2702" });
    expect(splitEventTitle(null, "Gym")).toEqual({ code: null, title: "Gym" });
  });

  it("doesn't strip a longer code that merely starts with this one", () => {
    expect(splitEventTitle("INFS27", "INFS2702 Lecture").title).toBe("INFS2702 Lecture");
  });
});
