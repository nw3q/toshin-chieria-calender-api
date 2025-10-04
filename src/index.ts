import { parseCalendar } from "./parser.js";
import type { CalendarResponseBody, Env } from "./types.js";

const DEFAULT_BASE_URL = "http://toshin-sapporo.com/chieria/calendar/";
const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_CALENDAR_ID = "33";

interface RequestOptions {
  year: number;
  month: number;
  calendarId: string;
  timezone: string;
  format: "json" | "html";
  bypassCache: boolean;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
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

  const yearCandidate = yearParam ? Number.parseInt(yearParam, 10) : current.year;
  const monthCandidate = monthParam ? Number.parseInt(monthParam, 10) : current.month;

  if (!Number.isFinite(yearCandidate) || yearCandidate < 2000 || yearCandidate > 2100) {
    throw new Response(
      JSON.stringify({ error: "Invalid year parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  if (!Number.isFinite(monthCandidate) || monthCandidate < 1 || monthCandidate > 12) {
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
    year: yearCandidate,
    month: monthCandidate,
    calendarId: env.CALENDAR_ID ?? DEFAULT_CALENDAR_ID,
    timezone,
    format,
    bypassCache,
  };
}

async function fetchWithProtocolFallback(url: URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, init);
    if (response.ok || url.protocol === "http:") {
      return response;
    }
  } catch (error) {
    if (url.protocol === "http:") {
      throw error;
    }
  }

  if (url.protocol === "https:") {
    const downgraded = new URL(url.toString());
    downgraded.protocol = "http:";
    return fetch(downgraded, init);
  }

  return fetch(url, init);
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
    return { markup: await calendarResponse.text(), sourceUrl: calendarUrl.toString() };
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

  const events = parseCalendar(markup, {
    year: options.year,
    month: options.month,
    calendarId: options.calendarId,
    sourceUrl,
    timezone: options.timezone,
  });

  const body: CalendarResponseBody = {
    meta: {
      sourceUrl,
      calendarId: options.calendarId,
      timezone: options.timezone,
      year: options.year,
      month: options.month,
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
