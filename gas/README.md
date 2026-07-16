# LINE WORKS Bot カルーセル 自動投稿システム（GAS）

GitHub 上に置いた投稿データ（JSON）と画像をもとに、LINE WORKS Bot の
**カルーセルテンプレート（type: carousel）** を、指定のトークルーム／チャンネルへ
自動投稿する Google Apps Script（GAS）です。

- ロジック層: `gas/LineWorksCarouselBot.gs`
- データソース: `carousel/data.json`（GitHub 上）
- 画像: `carousel/images/`（GitHub 上・公開HTTPS URLで参照）
- 投稿先: **トークルーム／チャンネル**（`channelId` 宛）

## この実装の前提（確定事項）

| 項目 | 決定内容 |
|---|---|
| 1回の送信 | カルーセル1通に **リンク2件（2カード）** を載せて送信 |
| データ | GitHub の `carousel/data.json`（`approved: true` の項目が対象） |
| 画像 | GitHub の `carousel/images/`（公開HTTPS URL） |
| 投稿済み管理 | GitHubは静的なため書き戻さず、**GASのスクリプトプロパティ `POSTED_IDS`** に記録 |
| 投稿先 | `POST .../bots/{botId}/channels/{channelId}/messages` |
| 認証 | JWT（Service Account 認証）／ Bot API v2.0 |

## セットアップ手順

1. **画像を用意**：`carousel/images/` にJPEG/PNG（1024px以内・1MB以内・比率1:1.51）を置く。
2. **公開URLを用意**：GitHub Pages を有効化（Settings → Pages → デフォルトブランチ/root）。
   - JSON: `https://masp047.github.io/sales_engineer/carousel/data.json`
   - 画像: `https://masp047.github.io/sales_engineer/carousel/images/xxx.jpg`
   - Pagesを使わない場合は `raw.githubusercontent.com` のURLでも可（ブランチ名にスラッシュがあるとURLが不安定なので注意）。
3. **`carousel/data.json` を編集**：投稿したいリンクを `items` に追加（`id` は一意、`approved: true`）。
4. **Apps Script を作成**：`gas/LineWorksCarouselBot.gs` を貼り付け。
5. **スクリプトプロパティを登録**：
   `CLIENT_ID` / `CLIENT_SECRET` / `SERVICE_ACCOUNT` / `PRIVATE_KEY` /
   `BOT_ID` / `TARGET_ID`（=channelId）/ `JSON_URL`（data.jsonの公開URL）
6. **動作確認**：`testAuthOnly()` → `testListTargets()` → `testRun()` の順。
7. **トリガー設定**：時間主導型で `main` を毎日実行。

## data.json のフォーマット

```json
{
  "imageAspectRatio": "rectangle",
  "imageSize": "cover",
  "items": [
    {
      "id": "2026-07-01-a",
      "approved": true,
      "title": "〇〇酒造 純米大吟醸",
      "text": "華やかな香りの一本",
      "imageUrl": "https://masp047.github.io/sales_engineer/carousel/images/sake01.jpg",
      "linkLabel": "詳しく見る",
      "linkUrl": "https://example.com/item01"
    }
  ]
}
```

| フィールド | 内容 | 制約 |
|---|---|---|
| `id` | 一意のID（投稿済み管理に使用） | ★必須・重複不可 |
| `approved` | 投稿対象フラグ | `true` のみ投稿 |
| `title` | タイトル | 40文字以内 |
| `text` | 説明文 | 60文字以内（任意） |
| `imageUrl` | 画像の公開HTTPS URL | ★必須・JPEG/PNG・1024px/1MB以内 |
| `linkLabel` | ボタン／タップ時のラベル | 20文字以内 |
| `linkUrl` | 遷移先URL | ★必須 |

- `items` は上から順に、**承認済み・未投稿**のものを **2件ずつ** 投稿します。
- `imageAspectRatio`（`rectangle`/`square`）と `imageSize`（`cover`/`contain`）は全カード共通設定です。

## 投稿件数と「2件ずつ」の進み方

毎回の実行で、`items` のうち「`approved: true` かつ `POSTED_IDS` に無い」ものを
先頭から **2件** 取り出して1通のカルーセルとして送信し、成功したらその2件の `id` を
`POSTED_IDS` に追記します。残りが1件だけのときは1カードのカルーセルになります。

## エラーハンドリングの挙動

- 投稿対象なし: ログのみ残して正常終了。
- JSON取得失敗 / 認証失敗 / 送信失敗: エラーログを残し、**`POSTED_IDS` は更新しない**
  （＝次回実行時に自動でリトライ対象になる）。

## テスト用関数

| 関数 | 内容 |
|---|---|
| `testRun()` | 本番と同じ処理を手動実行（実際に投稿する） |
| `testAuthOnly()` | 認証（アクセストークン取得）だけを試す |
| `testListTargets()` | 次に投稿される項目を一覧表示（送信しない） |
| `resetPostedIds()` | 投稿済み記録をリセット（テストのやり直し用） |
