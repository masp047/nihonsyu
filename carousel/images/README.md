# カルーセル用 画像フォルダ

LINE WORKS カルーセルに表示する画像をこのフォルダに置きます。

## 画像の要件（LINE WORKS カルーセル）

- 形式: **JPEG / PNG**
- 通信: **HTTPS**（公開されていること）
- 推奨アスペクト比: **1 : 1.51**（`imageAspectRatio: "rectangle"` の場合）／ **1 : 1**（`"square"` の場合）
- 最大幅: **1024px**
- ファイルサイズ: **1MB 以内**

## 公開URLの例

GitHub Pages を有効化している場合（Settings → Pages → デフォルトブランチ / root）:

```
https://masp047.github.io/sales_engineer/carousel/images/sample-a.jpg
```

Pages を使わない場合（raw）:

```
https://raw.githubusercontent.com/masp047/sales_engineer/<ブランチ名>/carousel/images/sample-a.jpg
```

`carousel/data.json` の各項目の `imageUrl` に、この公開URLを指定してください。

> このフォルダには実画像がまだありません。`sample-a.jpg` などを追加し、
> `data.json` の `imageUrl` を実際のファイル名に合わせてください。
