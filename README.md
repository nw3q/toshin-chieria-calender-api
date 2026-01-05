# toshin-chieria-calender-api

[東進衛星予備校 宮の沢ちえりあ前校の校舎スケジュール](http://toshin-sapporo.com/chieria/calendar/ "校舎スケジュール | 東進衛星予備校 - 宮の沢ちえりあ前校")よりスケジュールを取得するREST API

## Development

```bash
pnpm install
```
```bash
pnpm dev
```

## Deploy

```bash
pnpm deploy
```

## API Reference

### `GET /events`

- **Query Params**
  - `year` (任意): 取得する年。省略時は `TIMEZONE` での現在年。
  - `month` (任意): 取得する月 (1-12)。省略時は現在月。
  - `date` (任意): `YYYY-MM-DD` 形式の日付。指定すると該当日付のイベントのみを返却し、`year` と `month` はこの日付から自動算出される。
  - `format` (任意): `json` (既定) または `html`。`html` を指定するとページHTMLを返却。
  - `skipCache` (任意): `1` または `true` を指定するとキャッシュをバイパス。

- **Response Example**
  ```json
  {
    "meta": {
      "sourceUrl": "https://toshin-sapporo.com/chieria/calendar/?simcal_month=2025-10",
      "calendarId": "33",
      "timezone": "Asia/Tokyo",
      "year": 2025,
      "month": 10,
      "date": "2025-10-04",
      "fetchedAt": "2025-10-04T03:12:45.123Z"
    },
    "events": [
      {
        "title": "開校日12：00-21：45",
        "day": 4,
        "date": "2025-10-04",
        "start": "2025-10-04T00:00:59+09:00",
        "end": null,
        "startTimestamp": 1759503659,
        "endTimestamp": null,
        "isAllDay": false,
        "isMultiDay": false,
        "weekday": 6,
        "raw": {
          "startText": "2025年10月4日",
          "endText": null
        },
        "source": {
          "calendarId": "33",
          "href": "https://toshin-sapporo.com/chieria/calendar/?simcal_month=2025-10"
        }
      }
    ]
  }
  ```

### `GET /healthz`

サーバーのヘルスチェック用。`{ "status": "ok", "timestamp": "Date().toISOString()" }` を返す。
なんちゃってヘルスチェック。