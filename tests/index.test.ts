import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.js";
import type { CalendarResponseBody } from "../src/routes/calendar/types.js";
import type { Env } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const calendarHtml = readFileSync(join(__dirname, "fixtures", "oct-2025.html"), "utf8");

describe("worker.fetch", () => {
  const env: Env = {
    SOURCE_BASE_URL: "https://example.com/chieria/calendar/",
    SOURCE_PAGE_ID: "12",
    CALENDAR_ID: "33",
    TIMEZONE: "Asia/Tokyo",
    USER_AGENT: "test/0.1",
  };

  beforeEach(() => {
    const fetchMock = vi.fn(async (input: Request | URL | string) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input;
      if (url.includes("calendar")) {
        const response = new Response(calendarHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
        Object.defineProperty(response, "url", { value: url });
        return response;
      }
      const response = new Response("Not Found", { status: 404 });
      Object.defineProperty(response, "url", { value: url });
      return response;
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters events when a date query is provided", async () => {
    const request = new Request("https://toshin.local/events?date=2025-10-12", { method: "GET" });
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);

    const body = (await response.json()) as CalendarResponseBody;
    expect(body.meta.date).toBe("2025-10-12");
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((event) => event.date === "2025-10-12")).toBe(true);
  });
});
