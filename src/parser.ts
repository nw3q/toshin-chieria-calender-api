import { parse } from "node-html-parser";
import type { CalendarEvent } from "./types.js";

export interface ParseContext {
  year: number;
  month: number;
  calendarId: string;
  sourceUrl: string;
  timezone: string;
}

const FULLWIDTH_COLON_REGEX = /：/g;
const TIME_FRAGMENT_REGEX = /\b([01]?\d|2[0-3]):[0-5]\d\b/;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function buildIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function calcWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function estimateAllDay(title: string, startIso: string | null, endIso: string | null): boolean {
  const normalisedTitle = title.replace(FULLWIDTH_COLON_REGEX, ":");
  const titleHasTime = TIME_FRAGMENT_REGEX.test(normalisedTitle);
  if (titleHasTime) {
    return false;
  }
  if (startIso) {
    const startHasTime = !/T00:00(:\d\d)?([+-]\d\d:\d\d|Z)$/.test(startIso);
    if (startHasTime) {
      return false;
    }
  }
  if (endIso) {
    const endHasTime = !/T(00:00|23:59)(:\d\d)?([+-]\d\d:\d\d|Z)$/.test(endIso);
    if (endHasTime) {
      return false;
    }
  }
  return true;
}

function isMultiDay(startIso: string | null, endIso: string | null): boolean {
  if (!startIso || !endIso) {
    return false;
  }
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }
  const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 1 - Number.EPSILON;
}

export function parseCalendar(html: string, context: ParseContext): CalendarEvent[] {
  const root = parse(html);

  const calendar = root.querySelector(".simcal-calendar");
  if (!calendar) {
    return [];
  }

  const detectedYear = Number.parseInt(calendar.querySelector(".simcal-current-year")?.text ?? "", 10);
  const detectedMonthText = calendar.querySelector(".simcal-current-month")?.text?.trim();
  const detectedMonth = (() => {
    if (!detectedMonthText) {
      return Number.NaN;
    }
    const normalised = detectedMonthText.replace(/\s+/g, "").replace(/[^0-9]/g, "");
    return Number.parseInt(normalised, 10);
  })();

  const year = Number.isFinite(detectedYear) ? detectedYear : context.year;
  const month = Number.isFinite(detectedMonth) ? detectedMonth : context.month;

  const events: CalendarEvent[] = [];

  const dayNodes = calendar.querySelectorAll(".simcal-day");
  for (const dayNode of dayNodes) {
    if (dayNode.classNames.includes("simcal-day-void")) {
      continue;
    }
    const dayNumberText = dayNode.querySelector(".simcal-day-number")?.text?.trim();
    if (!dayNumberText) {
      continue;
    }
    const dayNumber = Number.parseInt(dayNumberText, 10);
    if (!Number.isFinite(dayNumber)) {
      continue;
    }
    const date = buildIsoDate(year, month, dayNumber);
    const weekday = calcWeekday(year, month, dayNumber);

    for (const eventNode of dayNode.querySelectorAll(".simcal-event")) {
      const titleText = eventNode.querySelector(".simcal-event-title")?.text?.trim();
      if (!titleText) {
        continue;
      }

      const details = eventNode.querySelector(".simcal-event-details");
      const startSpan = details?.querySelector('[itemprop="startDate"]') ?? details?.querySelector(".simcal-event-start-date");
      const endSpan = details?.querySelector('[itemprop="endDate"]') ?? details?.querySelector(".simcal-event-end-date");

      const startIso = normaliseIso(startSpan?.getAttribute("content"));
      const endIso = normaliseIso(endSpan?.getAttribute("content"));
      const startTimestamp = parseTimestamp(startSpan?.getAttribute("data-event-start"));
      const endTimestamp = parseTimestamp(endSpan?.getAttribute("data-event-end") ?? endSpan?.getAttribute("data-event-start"));

      const startText = startSpan?.text?.trim() ?? null;
      const endText = endSpan?.text?.trim() ?? null;

      const allDay = estimateAllDay(titleText, startIso, endIso);
      const multiDay = isMultiDay(startIso, endIso);

      events.push({
        title: titleText,
        day: dayNumber,
        date,
        start: startIso,
        end: endIso,
        startTimestamp,
        endTimestamp,
        isAllDay: allDay,
        isMultiDay: multiDay,
        weekday,
        raw: {
          startText,
          endText,
        },
        source: {
          calendarId: context.calendarId,
          href: context.sourceUrl,
        },
      });
    }
  }

  return events;
}
