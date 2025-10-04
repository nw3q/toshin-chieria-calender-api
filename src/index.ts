import { parseCalendar } from "./parser.js";
import type { CalendarResponseBody, Env } from "./types.js";

const DEFAULT_BASE_URL = "https://toshin-sapporo.com/chieria/calendar/";
const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_CALENDAR_ID = "33";

interface RequestOptions {
  year: number;
  month: number;
  calendarId: string;
  timezone: string;
  format: "json" | "html";
  bypassCache: boolean;
  date?: {
    iso: string;
    day: number;
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseDateParam(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  const day = Number.parseInt(dayPart, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function extractCurrentYearMonth(timezone: string): { year: number; month: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);

  const year = Number.parseInt(parts.find((part) => part.type === "year")?.value ?? "", 10);
  const month = Number.parseInt(parts.find((part) => part.type === "month")?.value ?? "", 10);

  return {
    year: Number.isFinite(year) ? year : now.getUTCFullYear(),
    month: Number.isFinite(month) ? month : now.getUTCMonth() + 1,
  };
}

function parseRequest(request: Request, env: Env): RequestOptions {
  const url = new URL(request.url);
  const timezone = env.TIMEZONE ?? DEFAULT_TIMEZONE;
  const current = extractCurrentYearMonth(timezone);

  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");
  const formatParam = url.searchParams.get("format");
  const bypassCacheParam = url.searchParams.get("skipCache");
  const dateParam = url.searchParams.get("date");

  const yearCandidate = yearParam ? Number.parseInt(yearParam, 10) : current.year;
  const monthCandidate = monthParam ? Number.parseInt(monthParam, 10) : current.month;
  let dateSelection: RequestOptions["date"]; // undefined by default

  if (dateParam) {
    const parsedDate = parseDateParam(dateParam);
    if (!parsedDate) {
      throw new Response(
        JSON.stringify({ error: "Invalid date parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }
    dateSelection = {
      iso: `${parsedDate.year}-${pad(parsedDate.month)}-${pad(parsedDate.day)}`,
      day: parsedDate.day,
    };
  }

  const effectiveYear = dateSelection ? Number.parseInt(dateSelection.iso.slice(0, 4), 10) : yearCandidate;
  const effectiveMonth = dateSelection ? Number.parseInt(dateSelection.iso.slice(5, 7), 10) : monthCandidate;

  if (!Number.isFinite(effectiveYear) || effectiveYear < 2000 || effectiveYear > 2100) {
    throw new Response(
      JSON.stringify({ error: "Invalid year parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  if (!Number.isFinite(effectiveMonth) || effectiveMonth < 1 || effectiveMonth > 12) {
    throw new Response(
      JSON.stringify({ error: "Invalid month parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  const format: "json" | "html" = formatParam === "html" ? "html" : "json";
  const bypassCache = bypassCacheParam === "1" || bypassCacheParam === "true";

  return {
    year: effectiveYear,
    month: effectiveMonth,
    calendarId: env.CALENDAR_ID ?? DEFAULT_CALENDAR_ID,
    timezone,
    format,
    bypassCache,
    date: dateSelection,
  };
}

async function fetchWithProtocolFallback(url: URL, init?: RequestInit): Promise<Response> {
  let primaryResponse: Response | null = null;
  let primaryError: unknown;
  try {
    primaryResponse = await fetch(url, init);
    if (primaryResponse.ok) {
      return primaryResponse;
    }
  } catch (error) {
    primaryError = error;
  }

  const alternateProtocol = url.protocol === "https:" ? "http:" : url.protocol === "http:" ? "https:" : null;
  if (alternateProtocol) {
    const alternateUrl = new URL(url.toString());
    alternateUrl.protocol = alternateProtocol;
    try {
      const alternateResponse = await fetch(alternateUrl, init);
      if (alternateResponse.ok) {
        return alternateResponse;
      }
      if (!primaryResponse) {
        return alternateResponse;
      }
    } catch (alternateError) {
      if (!primaryResponse) {
        throw alternateError;
      }
    }
  }

  if (primaryResponse) {
    return primaryResponse;
  }

  if (primaryError) {
    throw primaryError;
  }

  throw new Error(`Failed to fetch ${url.toString()}`);
}

function deriveRestEndpoint(baseUrl: URL, pageId: string): URL {
  const pathSegments = baseUrl.pathname.split("/").filter(Boolean);
  if (pathSegments.length === 0) {
    return new URL(`/wp-json/wp/v2/pages/${pageId}`, baseUrl.origin);
  }
  const withoutLast = pathSegments.slice(0, -1);
  const restBasePath = withoutLast.length > 0 ? `/${withoutLast.join("/")}` : "";
  return new URL(`${restBasePath}/wp-json/wp/v2/pages/${pageId}`, baseUrl.origin);
}

async function obtainMarkup(env: Env, options: RequestOptions): Promise<{ markup: string; sourceUrl: string }> {
  const base = env.SOURCE_BASE_URL ?? DEFAULT_BASE_URL;
  const calendarUrl = new URL(base);
  calendarUrl.searchParams.set("simcal_month", `${options.year}-${pad(options.month)}`);

  const requestInit: RequestInit = {
    headers: {
      "User-Agent": "toshin-chieria-calender-api/0.1 (+https://github.com/Lasxle/toshin-chieria-calender-api)",
      "Accept": "text/html,application/xhtml+xml",
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 900,
    },
  } as RequestInit;

  const calendarResponse = await fetchWithProtocolFallback(calendarUrl, requestInit);
  if (calendarResponse.ok) {
    const resolvedUrl = calendarResponse.url || calendarUrl.toString();
    return { markup: await calendarResponse.text(), sourceUrl: resolvedUrl };
  }

  if (env.SOURCE_PAGE_ID) {
    const restUrl = deriveRestEndpoint(calendarUrl, env.SOURCE_PAGE_ID);
    restUrl.searchParams.set("_fields", "content.rendered,link");
    const restResponse = await fetchWithProtocolFallback(restUrl, {
      headers: {
        "User-Agent": "toshin-chieria-calender-api/0.1 (+https://github.com/Lasxle/toshin-chieria-calender-api)",
        Accept: "application/json",
      },
    });
    if (restResponse.ok) {
      const payload = await restResponse.json<{
        content?: { rendered?: string };
        link?: string;
      }>();
      if (payload.content?.rendered) {
        return {
          markup: payload.content.rendered,
          sourceUrl: payload.link ?? calendarUrl.toString(),
        };
      }
    }
  }

  throw new Error(`Failed to fetch calendar markup. status=${calendarResponse.status}`);
}

function buildCacheKey(request: Request, options: RequestOptions): Request {
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("year", options.year.toString());
  cacheUrl.searchParams.set("month", pad(options.month));
  cacheUrl.searchParams.set("format", options.format);
  cacheUrl.searchParams.delete("skipCache");
  if (options.date) {
    cacheUrl.searchParams.set("date", options.date.iso);
  } else {
    cacheUrl.searchParams.delete("date");
  }
  return new Request(cacheUrl.toString(), request);
}

async function handleCalendarRequest(request: Request, env: Env): Promise<Response> {
  const options = parseRequest(request, env);

  const cache = (caches as CacheStorage & { default: Cache }).default;
  const cacheKey = buildCacheKey(request, options);

  if (!options.bypassCache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const { markup, sourceUrl } = await obtainMarkup(env, options);

  if (options.format === "html") {
    const response = new Response(markup, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
    if (!options.bypassCache) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  }

  let events = parseCalendar(markup, {
    year: options.year,
    month: options.month,
    calendarId: options.calendarId,
    sourceUrl,
    timezone: options.timezone,
  });

  if (options.date) {
    events = events.filter((event) => event.date === options.date?.iso);
  }

  const body: CalendarResponseBody = {
    meta: {
      sourceUrl,
      calendarId: options.calendarId,
      timezone: options.timezone,
      year: options.year,
      month: options.month,
      date: options.date?.iso ?? null,
      fetchedAt: new Date().toISOString(),
    },
    events,
  };

  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });

  if (!options.bypassCache) {
    await cache.put(cacheKey, response.clone());
  }

  return response;
}

async function handleHealthCheck(): Promise<Response> {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed", { status: 405 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return handleHealthCheck();
    }

    if (url.pathname === "/" || url.pathname === "/events") {
      try {
        return await handleCalendarRequest(request, env);
      } catch (error) {
        if (error instanceof Response) {
          return error;
        }
        console.error("Failed to process calendar request", error);
        return Response.json(
          {
            error: "Failed to fetch calendar data",
          },
          { status: 502 },
        );
      }
    }

    return notFound();
  },
};
