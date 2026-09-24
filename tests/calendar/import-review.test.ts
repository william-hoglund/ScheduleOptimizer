import { describe, expect, it } from "vitest";

import { isSelectedByDefault, reviewImport } from "@/lib/calendar/detect-duplicates";
import { toImportCandidates } from "@/lib/calendar/normalize-event";
import { parseIcs } from "@/lib/calendar/ics-parse";
import {
  classifyEventType,
  cleanImportedTitle,
  extractCourseCode,
} from "@/lib/calendar/subject-heuristics";

const STOCKHOLM = "Europe/Stockholm";

describe("subject heuristics", () => {
  it("finds a course code in the shapes Swedish universities use", () => {
    expect(extractCourseCode("Föreläsning TDDD86")).toBe("TDDD86");
    expect(extractCourseCode("Databaser (TDDD37) sal A")).toBe("TDDD37");
    expect(extractCourseCode("1DV610 Introduktion")).toBe("1DV610");
    expect(extractCourseCode("Lunch with Anna")).toBeNull();
  });

  it("classifies in Swedish and English", () => {
    expect(classifyEventType("Föreläsning i databaser")).toBe("lecture");
    expect(classifyEventType("Laboration 2")).toBe("lab");
    expect(classifyEventType("Seminarium: uppsats")).toBe("seminar");
    expect(classifyEventType("Omtentamen TDDD86")).toBe("exam");
    expect(classifyEventType("Inlämning av rapport")).toBe("deadline");
    expect(classifyEventType("Lunch")).toBe("other");
  });

  it("prefers the exam reading when a title contains both words", () => {
    // "Laborationstentamen" is an exam, not a lab.
    expect(classifyEventType("Laborationstentamen")).toBe("exam");
  });

  it("strips TimeEdit's field labels but keeps the values", () => {
    expect(cleanImportedTitle("Kurs: TDDD86, Aktivitet: Föreläsning, Lokal: SU00")).toBe(
      "TDDD86 – Föreläsning – SU00",
    );
  });
});

describe("toImportCandidates", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:one@timeedit",
    "SUMMARY:Kurs: TDDD86, Aktivitet: Föreläsning",
    "DTSTART;TZID=Europe/Stockholm:20260803T100000",
    "DTEND;TZID=Europe/Stockholm:20260803T120000",
    "RRULE:FREQ=WEEKLY;COUNT=2",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("carries the guessed type and course code through", () => {
    const [first] = toImportCandidates(
      parseIcs(feed, { fallbackTimeZone: STOCKHOLM }).events,
    );

    expect(first?.title).toBe("TDDD86 – Föreläsning");
    expect(first?.eventType).toBe("lecture");
    expect(first?.courseCode).toBe("TDDD86");
  });

  it("gives each occurrence of a recurring event its own external id", () => {
    const candidates = toImportCandidates(parseIcs(feed, { fallbackTimeZone: STOCKHOLM }).events);
    const ids = new Set(candidates.map((c) => c.externalId));

    // The database index is unique on (user, source, external_event_id), so a
    // shared UID across occurrences would make the second insert fail.
    expect(candidates).toHaveLength(2);
    expect(ids.size).toBe(2);
  });
});

describe("reviewImport", () => {
  const candidate = {
    externalId: "one@timeedit",
    title: "Databases lecture",
    startIso: "2026-08-03T08:00:00.000Z",
    endIso: "2026-08-03T10:00:00.000Z",
    isAllDay: false,
    location: null,
    description: null,
    eventType: "lecture" as const,
    courseCode: "TDDD37",
  };

  it("marks an untouched event as new", () => {
    const [result] = reviewImport([candidate], []);

    expect(result?.status).toBe("new");
    expect(isSelectedByDefault(result!.status)).toBe(true);
  });

  it("recognises an event this feed has already imported", () => {
    const [result] = reviewImport([candidate], [
      {
        id: "row-1",
        sourceId: null,
        externalEventId: "one@timeedit",
        title: "Anything at all",
        startIso: "2026-08-03T08:00:00.000Z",
      },
    ]);

    expect(result?.status).toBe("alreadyImported");
    expect(result?.existingEventId).toBe("row-1");
    expect(isSelectedByDefault(result!.status)).toBe(false);
  });

  it("recognises the same event added by hand, despite a different id", () => {
    const [result] = reviewImport([candidate], [
      {
        id: "row-2",
        sourceId: null,
        externalEventId: null,
        // Punctuation and case differ; it is still the same lecture.
        title: "databases  Lecture",
        startIso: "2026-08-03T08:00:00.000Z",
      },
    ]);

    expect(result?.status).toBe("matchesExisting");
    expect(result?.existingEventId).toBe("row-2");
  });

  it("does not match an event at a different time", () => {
    const [result] = reviewImport([candidate], [
      {
        id: "row-3",
        sourceId: null,
        externalEventId: null,
        title: "Databases lecture",
        startIso: "2026-08-04T08:00:00.000Z",
      },
    ]);

    expect(result?.status).toBe("new");
  });

  it("flags a file that lists the same event twice", () => {
    const results = reviewImport([candidate, { ...candidate, externalId: "two@timeedit" }], []);

    expect(results.map((r) => r.status)).toEqual(["new", "repeatedInFile"]);
    expect(isSelectedByDefault("repeatedInFile")).toBe(false);
  });
});
