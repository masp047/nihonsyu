/**
 * ============================================================================
 *  LINE WORKS Bot「リンクメッセージ（type: link）」自動投稿システム
 * ============================================================================
 *
 *  ■ このスクリプトの役割
 *    Googleスプレッドシートに並んだ「リンク投稿データ」を読み取り、
 *    LINE WORKS Bot の「リンクメッセージ」として、指定のトークルーム
 *    （チャンネル）へ自動投稿します。
 *
 *    - ロジック層 : このGoogle Apps Script（GAS）
 *    - データソース: Googleスプレッドシート
 *    - 投稿先      : LINE WORKS のトークルーム／チャンネル
 *
 *  ■ 投稿の仕様（本プロジェクトでの確定事項）
 *    - 投稿件数: 「承認フラグが立っている」かつ「未投稿」の行を “すべて” 投稿します。
 *                （リンクメッセージは 1リクエストにつき1件のみ 送信できる制約があるため、
 *                　行ごとに API を個別に呼び出すループ処理で実装しています）
 *    - 投稿先  : トークルーム／チャンネル（channelId）宛に送信します。
 *
 * ----------------------------------------------------------------------------
 *  ■ 事前準備：スクリプトプロパティの設定手順（コード内ハードコード禁止）
 * ----------------------------------------------------------------------------
 *  Apps Script エディタの上部メニューから
 *    「プロジェクトの設定（歯車アイコン）」→「スクリプト プロパティ」→「プロパティを追加」
 *  で、以下の 7 つを登録してください。（値は Developer Console 等から取得）
 *
 *  ┌───────────────────┬───────────────────────────────────────────────────┐
 *  │ プロパティ名       │ 内容                                               │
 *  ├───────────────────┼───────────────────────────────────────────────────┤
 *  │ CLIENT_ID         │ Developer Console の Client ID                     │
 *  │ CLIENT_SECRET     │ Developer Console の Client Secret                 │
 *  │ SERVICE_ACCOUNT   │ Service Account のメールアドレス                    │
 *  │ PRIVATE_KEY       │ 秘密鍵（PEM形式。-----BEGIN PRIVATE KEY----- から  │
 *  │                   │ -----END PRIVATE KEY----- まで丸ごと貼り付け）      │
 *  │ BOT_ID            │ Bot の ID                                          │
 *  │ TARGET_ID         │ 投稿先のチャンネルID（channelId）                   │
 *  │ SHEET_ID          │ GoogleスプレッドシートのID                          │
 *  └───────────────────┴───────────────────────────────────────────────────┘
 *
 *  ※ PRIVATE_KEY は改行を含みます。スクリプトプロパティに貼るときは、
 *    ダウンロードした .key / .pem ファイルの中身を “そのまま” 貼り付けてください。
 *    （改行がスペースに化けてしまった場合でも動くよう、コード側で補正しています）
 *
 * ----------------------------------------------------------------------------
 *  ■ 自動実行（トリガー）の設定手順
 * ----------------------------------------------------------------------------
 *  Apps Script エディタ左メニューの「トリガー（時計アイコン）」→「トリガーを追加」で、
 *    - 実行する関数        : main
 *    - イベントのソース     : 時間主導型
 *    - 時間ベースのトリガー  : 日タイマー → 希望の時間帯（例：午前9〜10時）
 *  を設定すると、毎日その時間帯に自動実行されます。
 *
 * ----------------------------------------------------------------------------
 *  ■ まず動作確認したいとき
 * ----------------------------------------------------------------------------
 *    - testRun()          : 実際に投稿まで行う手動実行（本番と同じ動作）
 *    - testAuthOnly()     : 認証（アクセストークン取得）だけを試す
 *  を、エディタ上部の関数選択から選んで「実行」してください。
 *  初回実行時は Google の承認ダイアログが出るので許可してください。
 * ============================================================================
 */


/* ============================================================================
 *  0. 設定値（列の位置・判定文字・エンドポイント）
 * ----------------------------------------------------------------------------
 *  スプレッドシートの列構成に合わせてここを調整してください。
 *  列番号は 1 始まり（A列=1, B列=2 ...）です。
 * ==========================================================================*/
var CONFIG = {
  // データは何行目から始まるか（1行目は見出しの想定）
  DATA_START_ROW: 2,

  // 各データの列位置（現物のシートに合わせて数字を変更してください）
  COL: {
    LINK: 1,        // A列: リンクURL          → link に入る値
    LINK_TEXT: 2,   // B列: リンク表示テキスト   → linkText に入る値
    CONTENT_TEXT: 3,// C列: 本文／説明文        → contentText に入る値
    APPROVED: 4,    // D列: 承認フラグ          → 「○」等で承認済みを判定
    STATUS: 5,      // E列: ステータス          → 未投稿／投稿済み
    POSTED_DATE: 6  // F列: 投稿日              → 投稿実行日を書き込む
  },

  // 判定に使う文字
  APPROVED_MARK: '○',       // 承認済みとみなす記号（○ / 〇 のどちらでもOKにしています）
  STATUS_UNPOSTED: '未投稿', // この文字（または空欄）を「未投稿」とみなす
  STATUS_POSTED: '投稿済み',  // 投稿完了時に書き込む文字

  // タイムゾーン（投稿日の表記に使用）
  TIMEZONE: 'Asia/Tokyo',
  DATE_FORMAT: 'yyyy/MM/dd'
};

// LINE WORKS の各種エンドポイント（Bot API v2.0）
var ENDPOINT = {
  TOKEN: 'https://auth.worksmobile.com/oauth2/v2.0/token',
  // 投稿先はトークルーム／チャンネル宛。{botId} と {channelId} は実行時に差し込みます。
  MESSAGE: 'https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages'
};


/* ============================================================================
 *  1. メイン関数（トリガーから毎日呼ばれる入口）
 * ----------------------------------------------------------------------------
 *  1) スプレッドシートを走査して投稿対象行を集める
 *  2) アクセストークンを取得する
 *  3) 対象行を 1件ずつ ループで投稿する
 *  4) 成功した行だけステータス・投稿日を更新する
 * ==========================================================================*/
function main() {
  Logger.log('=== LINE WORKS リンク投稿バッチ 開始 ===');

  var props = getProperties_(); // 設定値（スクリプトプロパティ）を読み込む

  // --- (1) 投稿対象行を集める ------------------------------------------------
  var sheet = openSheet_(props.SHEET_ID);
  var targets = collectTargetRows_(sheet);

  // 対象行が無ければ、ログだけ残して正常終了（エラーにはしない）
  if (targets.length === 0) {
    Logger.log('投稿対象の行はありませんでした。正常終了します。');
    Logger.log('=== 終了 ===');
    return;
  }
  Logger.log('投稿対象: ' + targets.length + ' 件');

  // --- (2) アクセストークンを取得 -------------------------------------------
  var accessToken;
  try {
    accessToken = getAccessToken_(props);
  } catch (e) {
    // 認証に失敗した場合、この実行では1件も投稿できないので中断（ステータスは触らない）
    Logger.log('【認証エラー】アクセストークンの取得に失敗しました: ' + e.message);
    Logger.log('=== 異常終了 ===');
    return;
  }

  // --- (3)(4) 1件ずつループで投稿し、成功した行だけ更新 ----------------------
  var successCount = 0;
  var failCount = 0;

  targets.forEach(function (row) {
    try {
      postLinkMessage_(props, accessToken, row.data); // ← リンクメッセージを1件送信
      updateRowAsPosted_(sheet, row.rowIndex);        // ← 成功時のみステータス更新
      successCount++;
      Logger.log('投稿成功（' + row.rowIndex + '行目）: ' + row.data.linkText);
    } catch (e) {
      // API失敗時はエラーログのみ記録し、ステータスは更新しない
      // → 更新しないことで、次回実行時に自動的にリトライ対象になる
      failCount++;
      Logger.log('【投稿失敗】' + row.rowIndex + '行目: ' + e.message + '（次回リトライ対象）');
    }
  });

  Logger.log('投稿結果: 成功 ' + successCount + ' 件 / 失敗 ' + failCount + ' 件');
  Logger.log('=== 終了 ===');
}


/* ============================================================================
 *  2. スプレッドシート関連
 * ==========================================================================*/

/**
 * スプレッドシートを開いて、対象のシート（最初のシート）を返します。
 */
function openSheet_(sheetId) {
  var ss = SpreadsheetApp.openById(sheetId);
  return ss.getSheets()[0]; // 先頭シートを使用。特定シート名にしたい場合は getSheetByName('シート名') に変更
}

/**
 * シートを2行目から走査し、
 *   「承認フラグが立っている」かつ「未投稿」の行だけを対象として集めます。
 * 返り値: [{ rowIndex: 実際の行番号, data: {link, linkText, contentText} }, ...]
 */
function collectTargetRows_(sheet) {
  var lastRow = sheet.getLastRow();
  var targets = [];

  // データが無い（見出しだけ）なら空配列を返す
  if (lastRow < CONFIG.DATA_START_ROW) {
    return targets;
  }

  // 使う範囲をまとめて一括取得（1行ずつ読むより高速）
  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var values = sheet.getRange(CONFIG.DATA_START_ROW, 1, numRows, sheet.getLastColumn()).getValues();

  values.forEach(function (rowValues, i) {
    var rowIndex = CONFIG.DATA_START_ROW + i; // 実際のシート上の行番号

    // 各列の値を取り出す（getValues の配列は 0 始まりなので列番号 -1）
    var link        = String(rowValues[CONFIG.COL.LINK - 1] || '').trim();
    var linkText    = String(rowValues[CONFIG.COL.LINK_TEXT - 1] || '').trim();
    var contentText = String(rowValues[CONFIG.COL.CONTENT_TEXT - 1] || '').trim();
    var approved    = String(rowValues[CONFIG.COL.APPROVED - 1] || '').trim();
    var status      = String(rowValues[CONFIG.COL.STATUS - 1] || '').trim();

    // 承認済み判定（○ / 〇 のどちらでも承認とみなす）
    var isApproved = (approved === CONFIG.APPROVED_MARK || approved === '〇');
    // 未投稿判定（明示的に「未投稿」または 空欄 を未投稿とみなす。「投稿済み」は除外）
    var isUnposted = (status === CONFIG.STATUS_UNPOSTED || status === '') &&
                     (status !== CONFIG.STATUS_POSTED);

    // リンクURLが空の行はスキップ（投稿できないため）
    if (isApproved && isUnposted && link !== '') {
      targets.push({
        rowIndex: rowIndex,
        data: { link: link, linkText: linkText, contentText: contentText }
      });
    }
  });

  return targets;
}

/**
 * 投稿に成功した行の「ステータス」を投稿済みに、「投稿日」を実行日(yyyy/MM/dd)に更新します。
 */
function updateRowAsPosted_(sheet, rowIndex) {
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  sheet.getRange(rowIndex, CONFIG.COL.STATUS).setValue(CONFIG.STATUS_POSTED);
  sheet.getRange(rowIndex, CONFIG.COL.POSTED_DATE).setValue(today);
}


/* ============================================================================
 *  3. 認証関連（JWT → アクセストークン取得）
 * ----------------------------------------------------------------------------
 *  LINE WORKS の Service Account 認証（JWT）の流れ:
 *    1) ヘッダ + クレーム を作り、秘密鍵で署名して JWT を作る
 *    2) その JWT を使って OAuth トークンエンドポイントに問い合わせる
 *    3) アクセストークンを受け取る
 * ==========================================================================*/

/**
 * アクセストークンを取得して返します。
 */
function getAccessToken_(props) {
  var jwt = createJwt_(props); // (1) JWT を生成

  // (2) トークンエンドポイントへ POST
  var payload = {
    assertion: jwt,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: props.CLIENT_ID,
    client_secret: props.CLIENT_SECRET,
    scope: 'bot' // Bot でメッセージ送信するためのスコープ
  };

  var response = UrlFetchApp.fetch(ENDPOINT.TOKEN, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true // 失敗レスポンスも例外にせず自分で判定する
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    throw new Error('トークン取得に失敗しました (HTTP ' + code + '): ' + body);
  }

  var json = JSON.parse(body);
  if (!json.access_token) {
    throw new Error('レスポンスに access_token が含まれていません: ' + body);
  }

  Logger.log('アクセストークンの取得に成功しました。');
  return json.access_token;
}

/**
 * JWT（JSON Web Token）を生成して返します。
 * ヘッダとクレームを Base64URL で連結し、秘密鍵(RS256)で署名します。
 */
function createJwt_(props) {
  // JWT ヘッダ
  var header = { alg: 'RS256', typ: 'JWT' };

  // 現在時刻（秒）。有効期限は 60 分後に設定
  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: props.CLIENT_ID,       // 発行者 = Client ID
    sub: props.SERVICE_ACCOUNT, // 対象  = Service Account のメールアドレス
    iat: now,                   // 発行時刻
    exp: now + 60 * 60          // 有効期限（発行から60分）
  };

  // 各部を Base64URL エンコードして「ヘッダ.クレーム」を作る
  var encodedHeader = base64UrlEncode_(JSON.stringify(header));
  var encodedClaim  = base64UrlEncode_(JSON.stringify(claim));
  var signingInput  = encodedHeader + '.' + encodedClaim;

  // 秘密鍵で署名（RS256 = RSA-SHA256）
  var privateKey = normalizePrivateKey_(props.PRIVATE_KEY);
  var signatureBytes = Utilities.computeRsaSha256Signature(signingInput, privateKey);
  var encodedSignature = base64UrlEncodeBytes_(signatureBytes);

  // 「ヘッダ.クレーム.署名」が完成した JWT
  return signingInput + '.' + encodedSignature;
}

/**
 * 秘密鍵(PEM)の体裁を整えます。
 * スクリプトプロパティに貼る際に改行がスペースへ化けてしまっても動くよう補正します。
 */
function normalizePrivateKey_(rawKey) {
  var key = String(rawKey).trim();

  // すでに正しく改行が入っていればそのまま使う
  if (key.indexOf('\n') !== -1) {
    return key;
  }

  // 改行が失われて1行になっている場合、ヘッダ/フッタと本文を復元する
  var begin = '-----BEGIN PRIVATE KEY-----';
  var end = '-----END PRIVATE KEY-----';
  var body = key.replace(begin, '').replace(end, '').replace(/\s+/g, '');

  var lines = [];
  for (var i = 0; i < body.length; i += 64) {
    lines.push(body.substring(i, i + 64)); // PEM本文は64文字ごとに改行
  }
  return begin + '\n' + lines.join('\n') + '\n' + end;
}


/* ============================================================================
 *  4. 投稿関連（リンクメッセージを1件送信）
 * ==========================================================================*/

/**
 * リンクメッセージ（type: link）を1件、チャンネル宛に送信します。
 *
 *  ★重要★ リンクメッセージは 1リクエストにつき1件のみ 送信可能です。
 *          content に配列を渡す一括送信はできません（Bad Request になります）。
 *          そのため、この関数は必ず「1件だけ」を送る作りにしています。
 *          複数件はメイン関数側でループして、この関数を繰り返し呼びます。
 */
function postLinkMessage_(props, accessToken, data) {
  // エンドポイントに botId / channelId を差し込む
  var url = ENDPOINT.MESSAGE
    .replace('{botId}', props.BOT_ID)
    .replace('{channelId}', props.TARGET_ID);

  // リンクメッセージの本体（1件分）
  var messageBody = {
    content: {
      type: 'link',
      contentText: data.contentText, // 本文（リンクの説明文）
      linkText: data.linkText,       // リンク表示テキスト
      link: data.link                // 遷移先URL
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

  // 200 / 201 以外は失敗として例外を投げる（呼び出し元でキャッチしてリトライ対象にする）
  if (code !== 200 && code !== 201) {
    throw new Error('メッセージ送信に失敗しました (HTTP ' + code + '): ' + body);
  }
}


/* ============================================================================
 *  5. 共通ユーティリティ
 * ==========================================================================*/

/**
 * 必要なスクリプトプロパティをまとめて読み込みます。
 * 1つでも欠けていれば、分かりやすいエラーで停止します。
 */
function getProperties_() {
  var sp = PropertiesService.getScriptProperties();
  var required = ['CLIENT_ID', 'CLIENT_SECRET', 'SERVICE_ACCOUNT', 'PRIVATE_KEY', 'BOT_ID', 'TARGET_ID', 'SHEET_ID'];
  var props = {};
  var missing = [];

  required.forEach(function (name) {
    var value = sp.getProperty(name);
    if (!value) {
      missing.push(name);
    }
    props[name] = value;
  });

  if (missing.length > 0) {
    throw new Error('スクリプトプロパティが未設定です: ' + missing.join(', ') +
      '（プロジェクトの設定 → スクリプト プロパティ から登録してください）');
  }
  return props;
}

/** 文字列を Base64URL 形式にエンコードします。 */
function base64UrlEncode_(str) {
  var bytes = Utilities.newBlob(str).getBytes();
  return base64UrlEncodeBytes_(bytes);
}

/** バイト配列を Base64URL 形式にエンコードします（+ / = を URL 安全な形へ変換）。 */
function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


/* ============================================================================
 *  6. テスト用（手動実行）関数
 * ----------------------------------------------------------------------------
 *  エディタ上部の関数選択から選んで「実行」できます。
 * ==========================================================================*/

/**
 * 【手動テスト】本番と同じ処理を今すぐ実行します。
 * 条件を満たす行があれば、実際に LINE WORKS へ投稿されます。
 */
function testRun() {
  Logger.log('※ testRun: 本番と同じ処理を手動実行します。');
  main();
}

/**
 * 【手動テスト】認証（アクセストークン取得）だけを試します。
 * トークンが取得できれば、CLIENT_ID / SECRET / SERVICE_ACCOUNT / PRIVATE_KEY の
 * 設定が正しいことを確認できます（メッセージは送信しません）。
 */
function testAuthOnly() {
  try {
    var props = getProperties_();
    var token = getAccessToken_(props);
    Logger.log('認証OK。アクセストークン（先頭20文字）: ' + token.substring(0, 20) + '...');
  } catch (e) {
    Logger.log('認証NG: ' + e.message);
  }
}

/**
 * 【手動テスト】投稿対象になる行だけを一覧表示します（送信はしません）。
 * 「どの行が投稿されるか」を、実際に送る前に確認したいときに使います。
 */
function testListTargets() {
  try {
    var props = getProperties_();
    var sheet = openSheet_(props.SHEET_ID);
    var targets = collectTargetRows_(sheet);
    Logger.log('投稿対象: ' + targets.length + ' 件');
    targets.forEach(function (t) {
      Logger.log('  ' + t.rowIndex + '行目: [' + t.data.linkText + '] ' + t.data.link);
    });
  } catch (e) {
    Logger.log('確認NG: ' + e.message);
  }
}
