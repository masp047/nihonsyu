/**
 * ============================================================================
 *  LINE WORKS Bot カルーセル自動投稿システム（スプレッドシート駆動）
 * ============================================================================
 *
 *  ■ このスクリプトの役割
 *    Googleスプレッドシートに書いた「投稿時刻・画像URL・リンク」をもとに、
 *    LINE WORKS Bot のカルーセルメッセージを、指定のトークルーム（チャンネル）へ
 *    毎日 自動投稿します。
 *
 *    - ロジック層  : このGoogle Apps Script（GAS）
 *    - データソース: Googleスプレッドシート
 *    - 画像        : GitHub Pages などに置いた公開画像（URLをシートに記載）
 *    - 投稿先      : LINE WORKS のトークルーム／チャンネル
 *
 *  ■ 投稿の仕様（確定事項）
 *    - 投稿タイミング : 毎日 朝 08:50 と 夕方 15:50 の2回
 *    - 1回の投稿      : カルーセル1通・1カード（画像1枚 ＋ リンクボタン2つ）
 *    - 朝と夕で画像・リンクは別（スプレッドシートに時刻ごとの行を用意）
 *    - 投稿先はトークルーム／チャンネル（channelId）宛
 *
 * ----------------------------------------------------------------------------
 *  ■ スプレッドシートの列構成（1行 ＝ 1回分の投稿内容）
 * ----------------------------------------------------------------------------
 *  1行目は見出し、2行目からデータ。列は以下の並びにしてください。
 *
 *  ┌───┬────────────┬──────────────────────────────────────────────┐
 *  │ 列 │ 見出し      │ 内容                                          │
 *  ├───┼────────────┼──────────────────────────────────────────────┤
 *  │ A │ 投稿時刻    │ 08:50 または 15:50（この時刻の回に使われる）   │
 *  │ B │ 画像URL     │ カードに表示する画像の公開HTTPS URL           │
 *  │ C │ リンク1テキスト │ ボタン1の表示名（20文字以内）              │
 *  │ D │ リンク1URL  │ ボタン1の遷移先URL                            │
 *  │ E │ リンク2テキスト │ ボタン2の表示名（20文字以内）              │
 *  │ F │ リンク2URL  │ ボタン2の遷移先URL                            │
 *  │ G │ 有効        │ ○ を入れた行だけが投稿対象（空欄・その他は除外）│
 *  └───┴────────────┴──────────────────────────────────────────────┘
 *
 *  例）
 *    A=08:50  B=https://.../morning.jpg  C=詳細  D=https://example.com/a
 *             E=お問い合わせ  F=https://example.com/b  G=○
 *    A=15:50  B=https://.../evening.jpg  C=詳細  D=https://example.com/c
 *             E=お問い合わせ  F=https://example.com/d  G=○
 *
 *  ※ 同じ時刻の行が複数あるときは「一番上の有効な行」が使われます（1カード）。
 *  ※ 画像は「幅1024px以内・1MB以内・JPEG/PNG・公開HTTPS」を推奨。
 *
 * ----------------------------------------------------------------------------
 *  ■ 事前準備：スクリプトプロパティ（コード内ハードコード禁止）
 * ----------------------------------------------------------------------------
 *  Apps Script →「プロジェクトの設定(歯車)」→「スクリプト プロパティ」で登録。
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
 *  │ SHEET_ID        │ GoogleスプレッドシートのID                              │
 *  └─────────────────┴──────────────────────────────────────────────────────┘
 *
 * ----------------------------------------------------------------------------
 *  ■ 自動実行（トリガー）の設定
 * ----------------------------------------------------------------------------
 *  関数 setupTriggers を1回だけ手動実行すると、
 *    - 毎日 08:50 ごろ … postMorning（朝の投稿）
 *    - 毎日 15:50 ごろ … postEvening（夕方の投稿）
 *  のトリガーが自動で作成されます。
 *  ※ GASの時間トリガーは「その時刻の前後 約15分の範囲」で実行されます
 *    （分単位ピッタリの保証はありません）。運用上ほぼ問題ありませんが、
 *     厳密な時刻が必要な場合はGASの仕様上の制約となります。
 *
 * ----------------------------------------------------------------------------
 *  ■ 動作確認の関数（エディタの関数選択から実行）
 * ----------------------------------------------------------------------------
 *    - testAuthOnly()     : 認証（トークン取得）だけ試す（送信なし）
 *    - testListTargets()  : 朝・夕それぞれの投稿内容を確認（送信なし）
 *    - testPostMorning()  : 朝の内容を今すぐ投稿（送信あり）
 *    - testPostEvening()  : 夕方の内容を今すぐ投稿（送信あり）
 * ============================================================================
 */


/* ============================================================================
 *  0. 設定値
 * ==========================================================================*/
var CONFIG = {
  // 投稿する2つの時刻（HH:mm）。スプレッドシートA列の「投稿時刻」もこの値に合わせます。
  SLOTS: {
    MORNING: '08:50',
    EVENING: '15:50'
  },

  IMAGE_ASPECT_RATIO: 'rectangle', // 画像の比率: rectangle(横長1.51:1) / square(1:1)
  IMAGE_SIZE: 'cover',             // 画像の収め方: cover(切り抜き) / contain(全体表示)

  DATA_START_ROW: 2,               // データ開始行（1行目は見出し）
  COL: {                           // 列番号（A=1, B=2 ...）
    TIME: 1,        // A 投稿時刻
    IMAGE_URL: 2,   // B 画像URL
    LINK1_TEXT: 3,  // C リンク1テキスト
    LINK1_URL: 4,   // D リンク1URL
    LINK2_TEXT: 5,  // E リンク2テキスト
    LINK2_URL: 6,   // F リンク2URL
    ENABLED: 7      // G 有効（○で投稿対象）
  },

  ENABLED_MARKS: ['○', '〇', '有効', 'TRUE', 'true', '1'], // 有効とみなす値
  DEFAULT_LINK_TEXT: 'リンク',  // リンクテキスト未入力時の既定ボタン名
  TIMEZONE: 'Asia/Tokyo'
};

// LINE WORKS の各種エンドポイント（Bot API v2.0）
var ENDPOINT = {
  TOKEN: 'https://auth.worksmobile.com/oauth2/v2.0/token',
  // 投稿先はトークルーム／チャンネル宛
  MESSAGE: 'https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages'
};


/* ============================================================================
 *  1. エントリ関数（トリガーから呼ばれる入口）
 * ==========================================================================*/

/** 朝の投稿（08:50 のトリガーから呼ばれる） */
function postMorning() {
  postSlot_(CONFIG.SLOTS.MORNING);
}

/** 夕方の投稿（15:50 のトリガーから呼ばれる） */
function postEvening() {
  postSlot_(CONFIG.SLOTS.EVENING);
}


/* ============================================================================
 *  2. 投稿の本体処理（時刻を指定して、その時刻の内容を投稿）
 * ----------------------------------------------------------------------------
 *  1) スプレッドシートを読み、指定時刻の「有効な行」を1件取り出す
 *  2) アクセストークンを取得する
 *  3) 画像1枚＋リンクボタン2つのカルーセルを送信する
 * ==========================================================================*/
function postSlot_(slotTime) {
  Logger.log('=== カルーセル投稿（' + slotTime + '）開始 ===');

  var props = getProperties_();

  // --- (1) 対象行を取得 ------------------------------------------------------
  var target;
  try {
    var rows = readSheetRows_(props.SHEET_ID);
    // 指定時刻・有効・画像URLあり の最初の1行を対象にする
    target = rows.filter(function (r) {
      return r.enabled && r.time === slotTime && r.imageUrl;
    })[0];
  } catch (e) {
    Logger.log('【シート読込エラー】' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  if (!target) {
    Logger.log('投稿対象がありません（時刻 ' + slotTime + ' の有効な行なし）。正常終了します。');
    Logger.log('=== 終了 ===');
    return;
  }
  // リンクが1つも無ければ送れないので中止
  if (!target.link1Url && !target.link2Url) {
    Logger.log('リンクURLが1つも入っていないため送信しません（時刻 ' + slotTime + '）。');
    Logger.log('=== 終了 ===');
    return;
  }

  // --- (2) 認証 --------------------------------------------------------------
  var accessToken;
  try {
    accessToken = getAccessToken_(props);
  } catch (e) {
    Logger.log('【認証エラー】アクセストークンの取得に失敗しました: ' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  // --- (3) 送信 --------------------------------------------------------------
  try {
    postCarousel_(props, accessToken, target);
  } catch (e) {
    Logger.log('【投稿失敗】カルーセル送信に失敗しました: ' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  Logger.log('投稿成功（時刻 ' + slotTime + '）: ' + target.imageUrl);
  Logger.log('=== 終了 ===');
}


/* ============================================================================
 *  3. スプレッドシート読み込み
 * ==========================================================================*/

/**
 * スプレッドシートを2行目から読み、行オブジェクトの配列にして返します。
 * 返り値: [{ time, imageUrl, link1Text, link1Url, link2Text, link2Url, enabled }]
 */
function readSheetRows_(sheetId) {
  var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0]; // 先頭シートを使用
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var values = sheet.getRange(CONFIG.DATA_START_ROW, 1, numRows, CONFIG.COL.ENABLED).getValues();

  return values.map(function (v) {
    return {
      time:      normalizeTime_(v[CONFIG.COL.TIME - 1]),
      imageUrl:  String(v[CONFIG.COL.IMAGE_URL - 1] || '').trim(),
      link1Text: String(v[CONFIG.COL.LINK1_TEXT - 1] || '').trim(),
      link1Url:  String(v[CONFIG.COL.LINK1_URL - 1] || '').trim(),
      link2Text: String(v[CONFIG.COL.LINK2_TEXT - 1] || '').trim(),
      link2Url:  String(v[CONFIG.COL.LINK2_URL - 1] || '').trim(),
      enabled:   isEnabled_(v[CONFIG.COL.ENABLED - 1])
    };
  });
}

/**
 * 投稿時刻の値を "HH:mm" 形式の文字列に整えます。
 * （セルが時刻型(Date)でも、"8:50" のような文字列でも同じ形に揃えます）
 */
function normalizeTime_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'HH:mm');
  }
  var s = String(value == null ? '' : value).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/); // 例 "8:50" / "08:50"
  if (m) {
    return ('0' + m[1]).slice(-2) + ':' + m[2]; // 先頭を0埋めして "08:50" に
  }
  return s;
}

/** 「有効」列の値が、投稿対象を表すかどうかを判定します。 */
function isEnabled_(value) {
  if (value === true) return true; // チェックボックス(TRUE)対応
  var s = String(value == null ? '' : value).trim();
  return CONFIG.ENABLED_MARKS.indexOf(s) !== -1;
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
 *  5. 投稿（画像1枚＋リンクボタン2つのカルーセルを送信）
 * ==========================================================================*/

/**
 * 1件分の内容を、1カード（画像＋ボタン最大2つ）のカルーセルとして送信します。
 */
function postCarousel_(props, accessToken, item) {
  var url = ENDPOINT.MESSAGE
    .replace('{botId}', props.BOT_ID)
    .replace('{channelId}', props.TARGET_ID);

  // リンク（ボタン）を組み立てる。URLが入っているものだけボタン化（最大2つ）。
  var actions = [];
  if (item.link1Url) {
    actions.push({
      type: 'uri',
      label: truncate_(item.link1Text || CONFIG.DEFAULT_LINK_TEXT + '1', 20),
      uri: item.link1Url
    });
  }
  if (item.link2Url) {
    actions.push({
      type: 'uri',
      label: truncate_(item.link2Text || CONFIG.DEFAULT_LINK_TEXT + '2', 20),
      uri: item.link2Url
    });
  }

  // カード（column）を1枚だけ作る
  var column = {
    thumbnailImageUrl: item.imageUrl, // 画像
    text: ' ',                        // 本文は使わないため空白1文字（必須項目対策）
    defaultAction: actions[0],        // 画像タップ時は1つ目のリンク先へ
    actions: actions                  // ボタン（1〜2個）
  };

  var messageBody = {
    content: {
      type: 'carousel',
      imageAspectRatio: CONFIG.IMAGE_ASPECT_RATIO,
      imageSize: CONFIG.IMAGE_SIZE,
      columns: [column] // 1カードのみ
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
 *  6. トリガー設定（1回だけ手動実行すればOK）
 * ==========================================================================*/

/**
 * 朝(08:50)・夕(15:50)の毎日トリガーを作成します。
 * 何度実行しても重複しないよう、既存の同名トリガーを消してから作り直します。
 */
function setupTriggers() {
  // 既存の postMorning / postEvening トリガーを削除
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'postMorning' || fn === 'postEvening') {
      ScriptApp.deleteTrigger(t);
    }
  });

  var m = CONFIG.SLOTS.MORNING.split(':'); // ["08","50"]
  var e = CONFIG.SLOTS.EVENING.split(':'); // ["15","50"]

  ScriptApp.newTrigger('postMorning').timeBased()
    .everyDays(1).atHour(parseInt(m[0], 10)).nearMinute(parseInt(m[1], 10))
    .inTimezone(CONFIG.TIMEZONE).create();

  ScriptApp.newTrigger('postEvening').timeBased()
    .everyDays(1).atHour(parseInt(e[0], 10)).nearMinute(parseInt(e[1], 10))
    .inTimezone(CONFIG.TIMEZONE).create();

  Logger.log('トリガーを設定しました: 朝 ' + CONFIG.SLOTS.MORNING + ' / 夕 ' + CONFIG.SLOTS.EVENING);
  Logger.log('※ 実行時刻は各時刻の前後 約15分の範囲になります（GASの仕様）。');
}


/* ============================================================================
 *  7. 共通ユーティリティ
 * ==========================================================================*/

/** 必要なスクリプトプロパティをまとめて読み込みます（1つでも欠ければエラー）。 */
function getProperties_() {
  var sp = PropertiesService.getScriptProperties();
  var required = ['CLIENT_ID', 'CLIENT_SECRET', 'SERVICE_ACCOUNT', 'PRIVATE_KEY', 'BOT_ID', 'TARGET_ID', 'SHEET_ID'];
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
 *  8. テスト用（手動実行）関数
 * ==========================================================================*/

/** 【テスト】認証だけを試します（送信なし）。 */
function testAuthOnly() {
  try {
    var props = getProperties_();
    var token = getAccessToken_(props);
    Logger.log('認証OK。アクセストークン(先頭20文字): ' + token.substring(0, 20) + '...');
  } catch (e) {
    Logger.log('認証NG: ' + e.message);
  }
}

/** 【テスト】朝・夕それぞれの投稿内容を表示します（送信なし）。 */
function testListTargets() {
  try {
    var props = getProperties_();
    var rows = readSheetRows_(props.SHEET_ID);
    [CONFIG.SLOTS.MORNING, CONFIG.SLOTS.EVENING].forEach(function (slot) {
      var t = rows.filter(function (r) { return r.enabled && r.time === slot && r.imageUrl; })[0];
      if (!t) {
        Logger.log(slot + '：対象なし');
      } else {
        Logger.log(slot + '：画像=' + t.imageUrl);
        Logger.log('   リンク1[' + t.link1Text + '] ' + t.link1Url);
        Logger.log('   リンク2[' + t.link2Text + '] ' + t.link2Url);
      }
    });
  } catch (e) {
    Logger.log('確認NG: ' + e.message);
  }
}

/** 【テスト】朝の内容を今すぐ投稿します（実際に送信します）。 */
function testPostMorning() {
  postSlot_(CONFIG.SLOTS.MORNING);
}

/** 【テスト】夕方の内容を今すぐ投稿します（実際に送信します）。 */
function testPostEvening() {
  postSlot_(CONFIG.SLOTS.EVENING);
}
