# LINE WORKS Bot カルーセル自動投稿システム（スプレッドシート駆動）

Googleスプレッドシートに書いた「投稿時刻・画像URL・リンク」をもとに、LINE WORKS Bot の
カルーセルメッセージを、指定のトークルーム／チャンネルへ **毎日 朝・夕の2回** 自動投稿する
Google Apps Script（GAS）です。

- ロジック層: `gas/LineWorksCarouselBot.gs`
- データソース: **Googleスプレッドシート**
- 画像: GitHub Pages 等に置いた公開画像（URLをシートに記載）
- 投稿先: **トークルーム／チャンネル**（`channelId` 宛）

## この実装の前提（確定事項）

| 項目 | 決定内容 |
|---|---|
| 投稿タイミング | 毎日 **朝 08:50** と **夕方 15:50** の2回 |
| 1回の投稿 | カルーセル1通・**1カード（画像1枚 ＋ リンクボタン2つ）** |
| 朝と夕 | 画像・リンクは別（シートに時刻ごとの行を用意） |
| データ | Googleスプレッドシート（`SHEET_ID`） |
| 投稿先 | `POST .../bots/{botId}/channels/{channelId}/messages` |
| 認証 | JWT（Service Account 認証）／ Bot API v2.0 |

## スプレッドシートの列構成

1行目は見出し、2行目からデータ。**1行 = 1回分の投稿内容**です。

| 列 | 見出し | 内容 |
|---|---|---|
| A | 投稿時刻 | `08:50` または `15:50` |
| B | 画像URL | カードに表示する画像の公開HTTPS URL |
| C | リンク1テキスト | ボタン1の表示名（20文字以内） |
| D | リンク1URL | ボタン1の遷移先URL |
| E | リンク2テキスト | ボタン2の表示名（20文字以内） |
| F | リンク2URL | ボタン2の遷移先URL |
| G | 有効 | `○` を入れた行だけ投稿対象（空欄・その他は除外） |

- 同じ時刻の行が複数あるときは「一番上の有効な行」が使われます。
- `gas/spreadsheet_template.csv` をスプレッドシートにインポートすると、この形の雛形ができます。
- 画像は「幅1024px以内・1MB以内・JPEG/PNG・公開HTTPS」を推奨。

### スプレッドシートの用意手順
1. Googleドライブで新規スプレッドシートを作成。
2. `ファイル → インポート → アップロード` で `gas/spreadsheet_template.csv` を選択。
   - インポート場所は「現在のシートを置換」でOK。
3. B列の画像URL、C〜F列のリンクを、実際の内容に書き換える。
4. ブラウザのURL `https://docs.google.com/spreadsheets/d/●●●●●/edit` の
   `●●●●●` 部分が **スプレッドシートID**（`SHEET_ID` に設定）。

## セットアップ手順

1. **画像を用意**：`sales_engineer/carousel/images/` に朝用・夕用の画像を置き、
   公開URL（`https://masp047.github.io/sales_engineer/carousel/images/xxx.jpg`）を控える。
2. **スプレッドシートを用意**：上記の手順でCSVを取り込み、画像URL・リンクを記入。
3. **Apps Script を作成**：`gas/LineWorksCarouselBot.gs` を貼り付け。
4. **スクリプトプロパティを登録**：
   `CLIENT_ID` / `CLIENT_SECRET` / `SERVICE_ACCOUNT` / `PRIVATE_KEY` /
   `BOT_ID` / `TARGET_ID`（=channelId）/ `SHEET_ID`
5. **動作確認**：`testAuthOnly()` → `testListTargets()` → `testPostMorning()` / `testPostEvening()`。
6. **トリガー設定**：`setupTriggers()` を1回だけ実行 → 朝夕のトリガーが自動作成されます。

## 自動実行のしくみ

`setupTriggers()` を実行すると、次の2つの時間主導型トリガーが作られます。

| 時刻 | 呼ばれる関数 | 内容 |
|---|---|---|
| 毎日 08:50 ごろ | `postMorning()` | A列が `08:50` の有効行を投稿 |
| 毎日 15:50 ごろ | `postEvening()` | A列が `15:50` の有効行を投稿 |

> ⚠️ GASの時間トリガーは各時刻の **前後 約15分の範囲** で実行されます（分単位ピッタリの
> 保証はありません）。運用上ほぼ問題ありませんが、GASの仕様上の制約です。
>
> 投稿時刻を変えたい場合は、コード先頭 `CONFIG.SLOTS` の値とスプレッドシートA列を
> 合わせて変更し、再度 `setupTriggers()` を実行してください。

## エラーハンドリングの挙動

- 対象行なし: ログのみ残して正常終了。
- シート読込失敗 / 認証失敗 / 送信失敗: エラーログを残して終了（次回のトリガーで再試行）。

## 関数一覧

| 関数 | 内容 |
|---|---|
| `setupTriggers()` | 朝夕のトリガーを作成（最初に1回実行） |
| `postMorning()` / `postEvening()` | 朝／夕の投稿（トリガーから自動実行） |
| `testAuthOnly()` | 認証だけ試す（送信なし） |
| `testListTargets()` | 朝・夕の投稿内容を確認（送信なし） |
| `testPostMorning()` / `testPostEvening()` | 朝／夕の内容を今すぐ投稿（送信あり） |
