# toshin-chieria-calender-api

東進衛星予備校 宮の沢ちえりあ前校の WordPress ページから校舎スケジュールを抽出し、Cloudflare Workers 上で JSON API として公開するプロジェクトです。

## 🧱 アーキテクチャ概要

- **Cloudflare Workers (TypeScript)** でエッジ常駐の API を実装。
- 指定月のカレンダーページを取得し、`node-html-parser` で HTML を解析してイベント情報を抽出。
- 結果は Cloudflare の `caches.default` にキャッシュし、再取得を抑制。
- WordPress ページ取得に失敗した場合は REST API (`/wp-json/wp/v2/pages/:id`) をフォールバックとして利用。

## 🚀 環境構築

事前に Node.js (18 以上) と npm を用意してください。

```bash
npm install
```

ローカル開発サーバーを立ち上げる場合:

```bash
npm run dev
```

Cloudflare アカウントと wrangler の認証を済ませた上で、以下のコマンドでデプロイできます。

```bash
npm run deploy
```

## ⚙️ 環境変数

`wrangler.toml` の `[vars]` セクションで以下を設定できます。

| 変数名             | デフォルト値                                         | 説明 |
|--------------------|------------------------------------------------------|------|
| `SOURCE_BASE_URL`  | `https://toshin-sapporo.com/chieria/calendar/`       | カレンダーを表示している WordPress ページの URL |
| `SOURCE_PAGE_ID`   | `12`                                                 | WordPress REST API で参照する固定ページ ID (フォールバック用) |
| `CALENDAR_ID`      | `33`                                                 | Simple Calendar のカレンダー ID |
| `TIMEZONE`         | `Asia/Tokyo`                                         | デフォルトのタイムゾーン |

## 📡 API 仕様

### `GET /events`

- **クエリパラメータ**
  - `year` (任意): 取得する年。省略時は `TIMEZONE` での現在年。
  - `month` (任意): 取得する月 (1-12)。省略時は現在月。
  - `format` (任意): `json` (既定) または `html`。`html` を指定すると生のカレンダー HTML を返却。
  - `skipCache` (任意): `1` または `true` を指定するとキャッシュをバイパス。

- **レスポンス (format=json)**
  ```json
  {
    "meta": {
      "sourceUrl": "https://toshin-sapporo.com/chieria/calendar/?simcal_month=2025-10",
      "calendarId": "33",
      "timezone": "Asia/Tokyo",
      "year": 2025,
      "month": 10,
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

- **レスポンス (format=html)**: 取得したカレンダー HTML をそのまま返します。

### `GET /healthz`

ヘルスチェック用。`{ "status": "ok" }` を返します。

## 🧪 テスト

`vitest` を使用したユニットテストを用意しています。

```bash
npm test
```

## 🛠️ 実装メモ

- HTML 解析には `node-html-parser` を利用。Simple Calendar プラグインの DOM 構造に依存しています。
- イベントの終日判定はタイトル・時刻文字列からのヒューリスティック推定です。将来的に REST/JSON エンドポイントが判明した場合はそちらに置換できます。
- 取得元サイトが HTTP のみの場合に備えて HTTPS→HTTP のプロトコルフォールバックを実装しています。

## 🔮 今後の拡張案

- ICS (iCalendar) 形式でのエクスポート対応
- Cloudflare KV/D1 への永続キャッシュ
- 取得元変更時のメトリクス／アラート連携
