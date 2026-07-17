# カルーセル用 画像フォルダ

LINE WORKS カルーセルに表示する画像をこのフォルダに置きます。
ここに置いた画像の**公開URL**を、投稿データのスプレッドシート（B列「画像URL」）に貼り付けて使います。

## 画像の要件（LINE WORKS カルーセル）

- 形式: **JPEG / PNG**
- 通信: **HTTPS**（公開されていること）
- 推奨アスペクト比: **1 : 1.51**（`imageAspectRatio: "rectangle"` の場合）／ **1 : 1**（`"square"` の場合）
- 最大幅: **1024px**
- ファイルサイズ: **1MB 以内**

## 公開URLの例（GitHub Pages 有効時）

```
https://masp047.github.io/sales_engineer/carousel/images/morning.jpg
https://masp047.github.io/sales_engineer/carousel/images/evening.jpg
```

## 使い方

1. 朝用・夕方用の画像をこのフォルダにアップロード（例: `morning.jpg` / `evening.jpg`）。
2. 上記の公開URLを、スプレッドシートの該当行（`08:50` / `15:50`）の **B列「画像URL」** に貼る。
3. 画像を差し替えたいときは、同じファイル名で上書きアップロードするか、
   新しいファイルを置いてスプレッドシートのURLを更新します。

> ※ 以前使っていた `carousel/data.json` は、スプレッドシート駆動に変更したため**現在は使用しません**。
>   （残っていても投稿には影響しません。不要なら削除して構いません。）
