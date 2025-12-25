import type { Env } from "../../types.js";
import { pad } from "../../utils.js";
import type { RequestOptions } from "./request.js";

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

export async function obtainMarkup(env: Env, options: RequestOptions): Promise<{ markup: string; sourceUrl: string }> {
    if (!env.SOURCE_BASE_URL) {
        throw new Error("Configuration error: SOURCE_BASE_URL is missing");
    }
    const base = env.SOURCE_BASE_URL;
    const calendarUrl = new URL(base);
    calendarUrl.searchParams.set("simcal_month", `${options.year}-${pad(options.month)}`);

    if (!env.USER_AGENT) {
        throw new Error("Configuration error: USER_AGENT is missing");
    }

    const requestInit: RequestInit = {
        headers: {
            "User-Agent": env.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
        cf: {
            cacheEverything: true,
            cacheTtl: 900,
        },
    } as RequestInit; // Cast is necessary because Cloudflare's RequestInit types might not strictly match DOM's if not configured identically

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
                "User-Agent": env.USER_AGENT,
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
