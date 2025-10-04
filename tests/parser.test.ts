import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseCalendar, type ParseContext } from "../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

describe("parseCalendar", () => {
  const context: ParseContext = {
    year: 2025,
    month: 10,
    calendarId: "33",
    sourceUrl: "http://toshin-sapporo.com/chieria/calendar/?simcal_month=2025-10",
    timezone: "Asia/Tokyo",
  };

  it("extracts all events with basic fields", () => {
    const html = loadFixture("oct-2025.html");

    const events = parseCalendar(html, context);

    expect(events).toHaveLength(12);

    const first = events.at(0);
    expect(first).toMatchObject({
      title: "開校日14：00-21：45",
      day: 1,
      date: "2025-10-01",
      start: "2025-09-29T00:00:59+09:00",
      end: "2025-10-03T23:59:01+09:00",
      isMultiDay: true,
      weekday: 3,
    });
  });

  it("detects timed versus all-day events", () => {
    const html = loadFixture("oct-2025.html");
    const events = parseCalendar(html, context);

    const timedEvent = events.find((event) => event.title.includes("12：00-21：45"));
    expect(timedEvent?.isAllDay).toBe(false);

    const allDayEvent = events.find((event) => event.title === "休校日" && event.day === 12);
    expect(allDayEvent?.isAllDay).toBe(true);
  });
});
