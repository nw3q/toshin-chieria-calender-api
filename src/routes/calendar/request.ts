import { DEFAULT_CALENDAR_ID, DEFAULT_TIMEZONE } from "../../constants.js";
import type { Env } from "../../types.js";
import { extractCurrentYearMonth, pad } from "../../utils.js";

export interface RequestOptions {
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

export class RequestError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

export function parseRequest(request: Request, env: Env): RequestOptions {
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
            throw new RequestError("Invalid date parameter", 400);
        }
        dateSelection = {
            iso: `${parsedDate.year}-${pad(parsedDate.month)}-${pad(parsedDate.day)}`,
            day: parsedDate.day,
        };
    }

    const effectiveYear = dateSelection ? Number.parseInt(dateSelection.iso.slice(0, 4), 10) : yearCandidate;
    const effectiveMonth = dateSelection ? Number.parseInt(dateSelection.iso.slice(5, 7), 10) : monthCandidate;

    if (!Number.isFinite(effectiveYear) || effectiveYear < 2000 || effectiveYear > 2100) {
        throw new RequestError("Invalid year parameter", 400);
    }

    if (!Number.isFinite(effectiveMonth) || effectiveMonth < 1 || effectiveMonth > 12) {
        throw new RequestError("Invalid month parameter", 400);
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
