/**
 * ============================================================================
 *  LINE WORKS Bot「カルーセルテンプレート（type: carousel）」自動投稿システム
 * ============================================================================
 *
 *  ■ このスクリプトの役割
 *    GitHub 上に置いた投稿データ（JSON）と画像を読み取り、
 *    LINE WORKS Bot の「カルーセルメッセージ」として、指定のトークルーム
 *    （チャンネル）へ自動投稿します。
 *
 *    - ロジック層  : このGoogle Apps Script（GAS）
 *    - データソース: GitHub 上の JSON ファイル（carousel/data.json）
 *    - 画像        : GitHub 上の画像（carousel/images/ …公開HTTPS URLで参照）
 *    - 投稿先      : LINE WORKS のトークルーム／チャンネル
 *
 *  ■ 投稿の仕様（本プロジェクトでの確定事項）
 *    - 1回の送信 = カルーセル1通に「リンク2件（2カード）」を載せて送信します。
 *    - 対象は JSON 内で「承認済み（approved: true）」かつ「まだ投稿していない」項目。
 *    - GitHub は静的なため投稿済みフラグを書き戻せません。代わりに
 *      「投稿済みID」を GAS のスクリプトプロパティ(POSTED_IDS)に記録して管理します。
 *    - 投稿先はトークルーム／チャンネル（channelId）宛。
 *
 * ----------------------------------------------------------------------------
 *  ■ 事前準備 その1：GitHub 側（データと画像の置き場所）
 * ----------------------------------------------------------------------------
 *  このリポジトリ内に以下を用意します（本コミットで雛形を同梱しています）。
 *    - carousel/data.json      … 投稿データ（下記フォーマット）
 *    - carousel/images/*.jpg   … カルーセルに表示する画像（JPEG/PNG）
 *
 *  ● 画像とJSONを「公開HTTPS URL」で読めるようにする方法（どちらか）
 *    (A) GitHub Pages を有効化する（おすすめ・URLがきれい）
 *        Settings → Pages → Source をデフォルトブランチ / (root) に設定。
 *        すると次のURLで公開されます：
 *          https://masp047.github.io/sales_engineer/carousel/data.json
 *          https://masp047.github.io/sales_engineer/carousel/images/sake01.jpg
 *    (B) raw.githubusercontent.com を使う（Pages不要）
 *          https://raw.githubusercontent.com/masp047/sales_engineer/<ブランチ名>/carousel/data.json
 *        ※ ブランチ名に「/」が含まれるとURLが不安定なので、(A) か、
 *          スラッシュを含まないブランチ／タグ／コミットSHA の利用を推奨します。
 *
 *  ● data.json のフォーマット（items は上から順に投稿されます）
 *    {
 *      "imageAspectRatio": "rectangle",   // 全カード共通: rectangle(横長1.51:1) / square(1:1)
 *      "imageSize": "cover",              // 全カード共通: cover(切り抜き) / contain(全体表示)
 *      "items": [
 *        {
 *          "id": "2026-07-01-a",          // ★必須・重複しない一意ID（投稿済み管理に使用）
 *          "approved": true,              // ★true の項目だけが投稿対象
 *          "title": "〇〇酒造 純米大吟醸",   // タイトル（40文字以内）
 *          "text": "華やかな香りの一本",     // 説明文（60文字以内・任意）
 *          "imageUrl": "https://masp047.github.io/sales_engineer/carousel/images/sake01.jpg",
 *          "linkLabel": "詳しく見る",        // ボタンのラベル（20文字以内）
 *          "linkUrl": "https://example.com/item01"  // ボタンの遷移先URL
 *        }
 *      ]
 *    }
 *
 * ----------------------------------------------------------------------------
 *  ■ 事前準備 その2：スクリプトプロパティの設定（コード内ハードコード禁止）
 * ----------------------------------------------------------------------------
 *  Apps Script エディタ →「プロジェクトの設定(歯車)」→「スクリプト プロパティ」で登録。
 *
 *  ┌─────────────────┬──────────────────────────────────────────────────────┐
 *  │ プロパティ名     │ 内容                                                   │
 *  ├─────────────────┼──────────────────────────────────────────────────────┤
 *  │ CLIENT_ID       │ Developer Console の Client ID                         │
 *  │ CLIENT_SECRET   │ Developer Console の Client Secret                     │
 *  │ SERVICE_ACCOUNT │ Service Account のメールアドレス                        │
 *  │ PRIVATE_KEY     │ 秘密鍵（PEM形式。BEGIN〜END を丸ごと貼り付け）            │
 *  │ BOT_ID          │ Bot の ID                                              │
 *  │ TARGET_ID       │ 投稿先のチャンネルID（channelId）                       │
 *  │ JSON_URL        │ data.json の公開URL（上記(A)または(B)のURL）            │
 *  └─────────────────┴──────────────────────────────────────────────────────┘
 *  ※ POSTED_IDS は本スクリプトが自動で作成・更新します（手動設定は不要）。
 *
 * ----------------------------------------------------------------------------
 *  ■ 自動実行（トリガー）の設定
 * ----------------------------------------------------------------------------
 *    トリガー(時計アイコン) → 追加 → 関数:main / 時間主導型 / 日タイマー で希望時間帯に。
 *
 * ----------------------------------------------------------------------------
 *  ■ 動作確認の関数（エディタの関数選択から実行）
 * ----------------------------------------------------------------------------
 *    - testRun()          : 本番と同じ処理を手動実行（実際に投稿する）
 *    - testAuthOnly()     : 認証（アクセストークン取得）だけ試す
 *    - testListTargets()  : 次に投稿される項目を確認（送信しない）
 *    - resetPostedIds()   : 投稿済み記録をリセット（テストのやり直し用）
 * ============================================================================
 */


/* ============================================================================
 *  0. 設定値
 * ==========================================================================*/
var CONFIG = {
  CARDS_PER_SEND: 2,             // 1回の送信に載せるカード数（＝リンク件数）
  DEFAULT_ASPECT_RATIO: 'rectangle', // data.json に指定が無い場合の既定値
  DEFAULT_IMAGE_SIZE: 'cover',       // 同上
  POSTED_IDS_PROP: 'POSTED_IDS'  // 投稿済みIDを保存するスクリプトプロパティ名
};

// LINE WORKS の各種エンドポイント（Bot API v2.0）
var ENDPOINT = {
  TOKEN: 'https://auth.worksmobile.com/oauth2/v2.0/token',
  // 投稿先はトークルーム／チャンネル宛
  MESSAGE: 'https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages'
};


/* ============================================================================
 *  1. メイン関数（トリガーから毎日呼ばれる入口）
 * ----------------------------------------------------------------------------
 *  1) GitHub の JSON を読み込む
 *  2) 承認済み かつ 未投稿 の項目を、上から CARDS_PER_SEND 件（=2件）取り出す
 *  3) アクセストークンを取得する
 *  4) 2件を1通のカルーセルにまとめて送信する
 *  5) 送信に成功したら、その項目のIDを「投稿済み」として記録する
 * ==========================================================================*/
function main() {
  Logger.log('=== LINE WORKS カルーセル投稿バッチ 開始 ===');

  var props = getProperties_();

  // --- (1) データ取得 --------------------------------------------------------
  var dataset;
  try {
    dataset = fetchDataset_(props.JSON_URL);
  } catch (e) {
    Logger.log('【データ取得エラー】JSONの読み込みに失敗しました: ' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  // --- (2) 投稿対象を選ぶ（承認済み・未投稿を上から2件） ----------------------
  var postedIds = getPostedIds_();
  var targets = selectTargets_(dataset.items, postedIds, CONFIG.CARDS_PER_SEND);

  if (targets.length === 0) {
    Logger.log('投稿対象（承認済み・未投稿）はありませんでした。正常終了します。');
    Logger.log('=== 終了 ===');
    return;
  }
  Logger.log('今回の投稿対象: ' + targets.length + ' 件（' +
    targets.map(function (t) { return t.id; }).join(', ') + '）');

  // --- (3) 認証 --------------------------------------------------------------
  var accessToken;
  try {
    accessToken = getAccessToken_(props);
  } catch (e) {
    Logger.log('【認証エラー】アクセストークンの取得に失敗しました: ' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  // --- (4) カルーセルを1通にまとめて送信 -------------------------------------
  try {
    postCarousel_(props, accessToken, dataset, targets);
  } catch (e) {
    // 送信失敗時は投稿済み記録を更新しない → 次回実行時に自動でリトライされる
    Logger.log('【投稿失敗】カルーセル送信に失敗しました: ' + e.message + '（次回リトライ対象）');
    Logger.log('=== 異常終了 ===');
    return;
  }

  // --- (5) 投稿済みとして記録 -------------------------------------------------
  var newlyPosted = targets.map(function (t) { return t.id; });
  addPostedIds_(newlyPosted);
  Logger.log('投稿成功。投稿済みに記録: ' + newlyPosted.join(', '));
  Logger.log('=== 終了 ===');
}


/* ============================================================================
 *  2. データ取得・対象選定
 * ==========================================================================*/

/**
 * GitHub 上の data.json を取得してオブジェクトに変換します。
 */
function fetchDataset_(jsonUrl) {
  var response = UrlFetchApp.fetch(jsonUrl, {
    method: 'get',
    muteHttpExceptions: true,
    // GitHub のキャッシュに古い内容が残らないよう毎回取得
    headers: { 'Cache-Control': 'no-cache' }
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('JSON取得に失敗 (HTTP ' + code + '): ' + response.getContentText().substring(0, 200));
  }

  var dataset = JSON.parse(response.getContentText());
  if (!dataset || !Array.isArray(dataset.items)) {
    throw new Error('JSONの形式が不正です（items 配列が見つかりません）');
  }
  return dataset;
}

/**
 * 「承認済み(approved) かつ 未投稿(IDがpostedIdsに無い)」の項目を、
 * JSONの並び順のまま先頭から limit 件だけ取り出します。
 * 併せて、必須項目(id / imageUrl / linkUrl)が欠けた項目はスキップします。
 */
function selectTargets_(items, postedIds, limit) {
  var targets = [];

  for (var i = 0; i < items.length; i++) {
    if (targets.length >= limit) break; // 必要数（2件）に達したら終了

    var item = items[i];
    var id = String(item.id || '').trim();

    // 承認されていない／未投稿でない／IDが無い ものは対象外
    if (item.approved !== true) continue;
    if (id === '') continue;
    if (postedIds.indexOf(id) !== -1) continue;

    // カルーセル表示に最低限必要な素材が欠けている項目はスキップ（ログを残す）
    if (!item.imageUrl || !item.linkUrl) {
      Logger.log('項目 ' + id + ' は imageUrl または linkUrl が無いためスキップしました。');
      continue;
    }

    targets.push(item);
  }
  return targets;
}


/* ============================================================================
 *  3. 投稿済みID管理（スクリプトプロパティに保存）
 * ==========================================================================*/

/** 投稿済みIDの配列を取得します。 */
function getPostedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG.POSTED_IDS_PROP);
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/** 新たに投稿したIDを、投稿済みリストに追記して保存します。 */
function addPostedIds_(ids) {
  var current = getPostedIds_();
  ids.forEach(function (id) {
    if (current.indexOf(id) === -1) current.push(id);
  });
  PropertiesService.getScriptProperties().setProperty(CONFIG.POSTED_IDS_PROP, JSON.stringify(current));
}


/* ============================================================================
 *  4. 認証関連（JWT → アクセストークン取得）
 * ==========================================================================*/

/** アクセストークンを取得して返します。 */
function getAccessToken_(props) {
  var jwt = createJwt_(props);

  var payload = {
    assertion: jwt,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: props.CLIENT_ID,
    client_secret: props.CLIENT_SECRET,
    scope: 'bot'
  };

  var response = UrlFetchApp.fetch(ENDPOINT.TOKEN, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code !== 200) {
    throw new Error('トークン取得に失敗 (HTTP ' + code + '): ' + body);
  }

  var json = JSON.parse(body);
  if (!json.access_token) {
    throw new Error('レスポンスに access_token がありません: ' + body);
  }
  Logger.log('アクセストークンの取得に成功しました。');
  return json.access_token;
}

/** JWT を生成します（ヘッダ.クレームを秘密鍵RS256で署名）。 */
function createJwt_(props) {
  var header = { alg: 'RS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: props.CLIENT_ID,
    sub: props.SERVICE_ACCOUNT,
    iat: now,
    exp: now + 60 * 60
  };

  var signingInput = base64UrlEncode_(JSON.stringify(header)) + '.' +
                     base64UrlEncode_(JSON.stringify(claim));
  var privateKey = normalizePrivateKey_(props.PRIVATE_KEY);
  var signature = base64UrlEncodeBytes_(Utilities.computeRsaSha256Signature(signingInput, privateKey));
  return signingInput + '.' + signature;
}

/** 秘密鍵(PEM)の改行がスペース化していても動くよう体裁を整えます。 */
function normalizePrivateKey_(rawKey) {
  var key = String(rawKey).trim();
  if (key.indexOf('\n') !== -1) return key;

  var begin = '-----BEGIN PRIVATE KEY-----';
  var end = '-----END PRIVATE KEY-----';
  var body = key.replace(begin, '').replace(end, '').replace(/\s+/g, '');
  var lines = [];
  for (var i = 0; i < body.length; i += 64) {
    lines.push(body.substring(i, i + 64));
  }
  return begin + '\n' + lines.join('\n') + '\n' + end;
}


/* ============================================================================
 *  5. 投稿関連（カルーセルを1通にまとめて送信）
 * ==========================================================================*/

/**
 * 対象項目（2件）を1つのカルーセルにまとめてチャンネルへ送信します。
 *
 *  カルーセルは columns（カード）の配列を1リクエストで送れるため、
 *  リンクメッセージと違い「2件を1通」で送信できます。
 *  ただしボタン(actions)の数は全カードで揃える必要があります。
 */
function postCarousel_(props, accessToken, dataset, targets) {
  var url = ENDPOINT.MESSAGE
    .replace('{botId}', props.BOT_ID)
    .replace('{channelId}', props.TARGET_ID);

  // 各項目を「カルーセルのカード(column)」に変換
  var columns = targets.map(function (item) {
    return {
      thumbnailImageUrl: item.imageUrl,                 // カード上部の画像
      title: truncate_(item.title, 40),                 // タイトル（40文字以内に丸め）
      text: truncate_(item.text || ' ', 60),            // 説明文（60文字以内。空だと不可なので半角空白）
      defaultAction: {                                  // カード全体タップ時の遷移先
        type: 'uri', label: truncate_(item.linkLabel || 'ひらく', 20), uri: item.linkUrl
      },
      actions: [                                        // ボタン（全カード1個で統一）
        { type: 'uri', label: truncate_(item.linkLabel || 'ひらく', 20), uri: item.linkUrl }
      ]
    };
  });

  // カルーセルメッセージ本体
  var messageBody = {
    content: {
      type: 'carousel',
      imageAspectRatio: dataset.imageAspectRatio || CONFIG.DEFAULT_ASPECT_RATIO,
      imageSize: dataset.imageSize || CONFIG.DEFAULT_IMAGE_SIZE,
      columns: columns
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify(messageBody),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code !== 200 && code !== 201) {
    throw new Error('カルーセル送信に失敗 (HTTP ' + code + '): ' + body);
  }
}


/* ============================================================================
 *  6. 共通ユーティリティ
 * ==========================================================================*/

/** 必要なスクリプトプロパティをまとめて読み込みます（1つでも欠ければエラー）。 */
function getProperties_() {
  var sp = PropertiesService.getScriptProperties();
  var required = ['CLIENT_ID', 'CLIENT_SECRET', 'SERVICE_ACCOUNT', 'PRIVATE_KEY', 'BOT_ID', 'TARGET_ID', 'JSON_URL'];
  var props = {};
  var missing = [];
  required.forEach(function (name) {
    var value = sp.getProperty(name);
    if (!value) missing.push(name);
    props[name] = value;
  });
  if (missing.length > 0) {
    throw new Error('スクリプトプロパティが未設定です: ' + missing.join(', '));
  }
  return props;
}

/** 文字列を最大文字数で丸めます（超過分は … に置き換え）。 */
function truncate_(str, max) {
  var s = String(str == null ? '' : str);
  if (s.length <= max) return s;
  return s.substring(0, max - 1) + '…';
}

/** 文字列を Base64URL 形式にエンコードします。 */
function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}

/** バイト配列を Base64URL 形式にエンコードします。 */
function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


/* ============================================================================
 *  7. テスト用（手動実行）関数
 * ==========================================================================*/

/** 【手動テスト】本番と同じ処理を実行（実際に投稿します）。 */
function testRun() {
  Logger.log('※ testRun: 本番と同じ処理を手動実行します。');
  main();
}

/** 【手動テスト】認証だけを試します（送信なし）。 */
function testAuthOnly() {
  try {
    var props = getProperties_();
    var token = getAccessToken_(props);
    Logger.log('認証OK。アクセストークン(先頭20文字): ' + token.substring(0, 20) + '...');
  } catch (e) {
    Logger.log('認証NG: ' + e.message);
  }
}

/** 【手動テスト】次に投稿される項目を一覧表示します（送信なし）。 */
function testListTargets() {
  try {
    var props = getProperties_();
    var dataset = fetchDataset_(props.JSON_URL);
    var targets = selectTargets_(dataset.items, getPostedIds_(), CONFIG.CARDS_PER_SEND);
    Logger.log('次回の投稿対象: ' + targets.length + ' 件');
    targets.forEach(function (t) {
      Logger.log('  [' + t.id + '] ' + t.title + ' → ' + t.linkUrl);
    });
  } catch (e) {
    Logger.log('確認NG: ' + e.message);
  }
}

/** 【手動テスト】投稿済み記録をすべて消去します（テストのやり直し用）。 */
function resetPostedIds() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.POSTED_IDS_PROP);
  Logger.log('投稿済み記録(POSTED_IDS)をリセットしました。');
}
