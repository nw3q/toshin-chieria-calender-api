export interface CalendarEvent {
    /** イベントタイトル（HTMLから抽出したテキスト） */
    title: string;
    /** 該当月の日付（1始まり） */
    day: number;
    /** ISO 8601形式の日付（例: 2025-10-04） */
    date: string;
    /** イベント開始時刻（ISO 8601, タイムゾーン込み）。情報が無い場合はnull */
    start: string | null;
    /** イベント終了時刻（ISO 8601, タイムゾーン込み）。情報が無い場合はnull */
    end: string | null;
    /** data-event-start属性に含まれるUNIXタイムスタンプ（秒）。無ければnull */
    startTimestamp: number | null;
    /** data-event-end属性に含まれるUNIXタイムスタンプ（秒）。無ければnull */
    endTimestamp: number | null;
    /** イベントが終日かの推定フラグ（開始・終了時刻の分解から推測） */
    isAllDay: boolean;
    /** 開始日と終了日の差分から複数日に跨るかどうか */
    isMultiDay: boolean;
    /** 曜日（0=日曜日 ... 6=土曜日） */
    weekday: number;
    /** 元HTMLから抽出した補足情報 */
    raw: {
        startText?: string | null;
        endText?: string | null;
    };
    /** 出典情報 */
    source: {
        calendarId: string;
        href: string;
    };
}

export interface CalendarMeta {
    sourceUrl: string;
    calendarId: string;
    timezone: string;
    year: number;
    month: number;
    date?: string | null;
    fetchedAt: string;
}

export interface CalendarResponseBody {
    meta: CalendarMeta;
    events: CalendarEvent[];
}
