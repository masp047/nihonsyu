# LINE WORKS Bot カルーセル自動投稿システム（Daily／Weekly の2シート駆動）

Googleスプレッドシートの2つのシート（内容＝Daily／スケジュール＝Weekly）をもとに、
LINE WORKS Bot のカルーセルメッセージを自動投稿する Google Apps Script（GAS）です。

- ロジック層: `gas/LineWorksCarouselBot.gs`
- データソース: Googleスプレッドシート（`Daily` / `Weekly` の2タブ）
- 画像: GitHub Pages 等に置いた公開画像（直リンクURLをDailyに記載）
- 投稿先: 個人宛（`TARGET_TYPE=user`）／トークルーム宛（`channel`）

## 仕様

| 項目 | 内容 |
|---|---|
| 投稿タイミング | **Weeklyシート**の「曜日 × 朝/夕の時刻」に投稿 |
| 投稿しない枠 | Weeklyの時刻欄が `:` や空欄など、時刻でない値ならその枠はスキップ |
| 1回の投稿 | カルーセル1通・1カード（画像1枚 ＋ リンクボタン2つ） |
| 投稿内容 | **Dailyシート**の朝(2行目)・夕(3行目) |
| 認証 | JWT（Service Account 認証）／ Bot API v2.0 |

## シート構成

### Daily（内容）— 1行目=見出し、2行目=朝、3行目=夕
| A 画像URL | B リンク1テキスト | C リンク1URL | D リンク2テキスト | E リンク2URL | F 有効 |
|---|---|---|---|---|---|
| …/morning.jpg | ☀️Zoom… | https://… | 今日の予定… | https://… | ○ |
| …/evening.jpg | Zoom… | https://… | 結果の記入… | https://… | ○ |

### Weekly（スケジュール）— 1行目=見出し、2行目以降=各曜日
| A 曜日 | B 朝 | C 夕方 |
|---|---|---|
| 月 | 8:55 | 15:55 |
| … | … | … |
| 土 | 8:55 | `:`（＝夕は投稿しない） |

- 曜日は先頭1文字（月/火/水/木/金/土/日）で判定（「月曜日」等でもOK）。
- 時刻（`HH:mm`）が入っていればその時刻に投稿。`:`・空欄など時刻でない値は投稿しません。
- 時刻や曜日ごとのON/OFFは、**Weeklyシートを編集するだけ**で変更できます（コード変更不要）。

## スクリプトプロパティ

`CLIENT_ID` / `CLIENT_SECRET` / `SERVICE_ACCOUNT` / `PRIVATE_KEY` / `BOT_ID` /
`TARGET_ID` / `SHEET_ID`
- 任意 **`TARGET_TYPE`**：`user`（個人宛）/ `channel`（トークルーム宛）。未設定なら `channel`。
- `LASTRUN_*` は二重投稿防止の自動フラグ（手動設定不要）。

## 自動実行

`setupTriggers()` を1回実行すると「毎分実行」トリガーが作られ、毎分 `tick()` が動きます。
`tick()` は毎分、Weeklyの「今日の曜日」の時刻を見て、一致した時刻に Daily の朝/夕を投稿します。
- 二重投稿防止：実行ロック＋当日フラグ（`LASTRUN_*`）。
- 取りこぼし防止：`CONFIG.CATCHUP_MINUTES`（既定2分）の猶予内なら投稿（それでも1日1回）。

## 動作確認の関数

| 関数 | 内容 |
|---|---|
| `setupTriggers()` | 毎分トリガーを作成（最初に1回） |
| `tick()` | 毎分自動実行（Weeklyを見て該当時刻に投稿） |
| `testAuthOnly()` | 認証だけ試す（送信なし） |
| `testListTargets()` | Dailyの内容とWeeklyの予定を表示（送信なし） |
| `testPostMorning()` / `testPostEvening()` | Dailyの朝／夕を今すぐ投稿（送信あり） |

## タブ名について

コードは `Daily` / `Weekly` というタブ名を探します。見つからない場合は左から1番目を Daily、
2番目を Weekly として扱います。確実に動かすため、タブ名は `Daily` / `Weekly` に揃えるのがおすすめです。
