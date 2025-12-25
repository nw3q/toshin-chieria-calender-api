export function pad(value: number): string {
    return value.toString().padStart(2, "0");
}

export function extractCurrentYearMonth(timezone: string): { year: number; month: number } {
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
