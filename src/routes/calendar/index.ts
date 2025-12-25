import type { Env } from "../../types.js";
import { pad } from "../../utils.js";
import { obtainMarkup } from "./fetcher.js";
import { parseCalendar } from "./parser.js";
import { parseRequest } from "./request.js";
import type { CalendarResponseBody } from "./types.js";

function buildCacheKey(request: Request, options: ReturnType<typeof parseRequest>): Request {
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

export async function handleCalendarRequest(request: Request, env: Env): Promise<Response> {
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
            "Access-Control-Allow-Origin": "*",
        },
    });

    if (!options.bypassCache) {
        await cache.put(cacheKey, response.clone());
    }

    return response;
}
