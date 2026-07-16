# LINE WORKS Bot リンクメッセージ 自動投稿システム（GAS）

Googleスプレッドシートに並べた「リンク投稿データ」を、LINE WORKS Bot の
**リンクメッセージ（type: link）** として、指定のトークルーム／チャンネルへ
毎日自動投稿する Google Apps Script（GAS）です。

- ロジック層: `gas/LineWorksLinkBot.gs`
- データソース: Googleスプレッドシート
- 投稿先: **トークルーム／チャンネル**（`channelId` 宛）

## この実装の前提（確定事項）

| 項目 | 決定内容 |
|---|---|
| 投稿件数 | 「承認フラグ○」かつ「未投稿」の行を **すべて** 投稿 |
| 投稿方式 | リンクメッセージは1リクエスト1件のみのため、**行ごとにAPIを個別呼び出し**（ループ送信） |
| 投稿先 | トークルーム／チャンネル（`POST .../bots/{botId}/channels/{channelId}/messages`） |
| 認証 | JWT（Service Account 認証）／ Bot API v2.0 |

## 導入手順

1. Apps Script プロジェクトを新規作成し、`LineWorksLinkBot.gs` の内容を貼り付ける。
2. **スクリプトプロパティ**に以下 7 つを登録（コードにハードコードしない）。
   - `CLIENT_ID` / `CLIENT_SECRET` / `SERVICE_ACCOUNT` / `PRIVATE_KEY` /
     `BOT_ID` / `TARGET_ID`（=channelId）/ `SHEET_ID`
3. スプレッドシートの列構成に合わせて、コード先頭の `CONFIG.COL`（列番号）と
   `APPROVED_MARK` / `STATUS_*`（判定文字）を調整。
4. `testAuthOnly()` を実行して認証が通ることを確認。
5. `testListTargets()` を実行して投稿対象行を確認（送信なし）。
6. `testRun()` を実行して実際の投稿を確認。
7. **時間主導型トリガー**で `main` を毎日希望の時間帯に実行するよう設定。

詳細な手順はコード冒頭のコメントにも日本語で記載しています。

## スプレッドシート構成（初期値）

| 列 | 内容 | コード上の設定 |
|---|---|---|
| A | リンクURL（`link`） | `COL.LINK = 1` |
| B | リンク表示テキスト（`linkText`） | `COL.LINK_TEXT = 2` |
| C | 本文／説明文（`contentText`） | `COL.CONTENT_TEXT = 3` |
| D | 承認フラグ（`○`） | `COL.APPROVED = 4` |
| E | ステータス（未投稿／投稿済み） | `COL.STATUS = 5` |
| F | 投稿日（`yyyy/MM/dd`、Asia/Tokyo） | `COL.POSTED_DATE = 6` |

> 1行目は見出し、データは2行目から（`DATA_START_ROW = 2`）を想定しています。
> 実際のシートに合わせて列番号を変更してください。

## エラーハンドリングの挙動

- 投稿対象行なし: ログのみ残して正常終了。
- API送信失敗: エラーログを記録し、**その行のステータスは更新しない**
  （＝次回実行時に自動でリトライ対象になる）。
- 認証（JWT／トークン取得）失敗: エラー内容をログに残し、その回は投稿せず終了。

## テスト用関数

| 関数 | 内容 |
|---|---|
| `testRun()` | 本番と同じ処理を手動実行（実際に投稿する） |
| `testAuthOnly()` | 認証（アクセストークン取得）だけを試す |
| `testListTargets()` | 投稿対象になる行の一覧をログ表示（送信しない） |
