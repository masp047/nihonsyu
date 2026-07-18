/**
 * ============================================================================
 *  LINE WORKS Bot カルーセル自動投稿システム（Daily＝内容／Weekly＝スケジュール）
 * ============================================================================
 *
 *  ■ このスクリプトの役割
 *    Googleスプレッドシートの2つのシートをもとに、LINE WORKS Bot のカルーセルを
 *    自動投稿します。
 *      - 「Daily」シート  … カルーセルの内容（朝用・夕用のメッセージとリンク）
 *      - 「Weekly」シート … 1週間の投稿スケジュール（曜日ごとの朝／夕の時刻）
 *
 *    毎分、Weeklyシートの「今日の曜日」の時刻を見て、その時刻になったら
 *    Dailyシートの朝／夕の内容を投稿します。
 *
 *  ■ 投稿タイミング
 *    - Weeklyシートに書いた「曜日 × 時刻」に投稿します。
 *    - 時刻でない値（例：`:` や空欄）が入っている枠は「投稿しない」と判断してスキップします。
 *    - 時刻を変えたい・曜日を止めたいときは、Weeklyシートを編集するだけ（コード変更不要）。
 *
 *  ■ 1回の投稿
 *    - カルーセル1通・1カード（画像1枚 ＋ リンクボタン2つ）
 *
 * ----------------------------------------------------------------------------
 *  ■ 「Daily」シートの列構成（1行目=見出し、2行目=朝、3行目=夕）
 * ----------------------------------------------------------------------------
 *  ┌───┬────────────┬──────────────────────────────┐
 *  │ 列 │ 見出し      │ 内容                          │
 *  ├───┼────────────┼──────────────────────────────┤
 *  │ A │ 画像URL     │ カードに表示する画像の公開HTTPS直リンク │
 *  │ B │ リンク1テキスト │ ボタン1の表示名（20文字以内）  │
 *  │ C │ リンク1URL  │ ボタン1の遷移先URL              │
 *  │ D │ リンク2テキスト │ ボタン2の表示名（20文字以内）  │
 *  │ E │ リンク2URL  │ ボタン2の遷移先URL              │
 *  │ F │ 有効        │ ○ で投稿対象（空欄等は投稿しない）│
 *  └───┴────────────┴──────────────────────────────┘
 *  ※ 2行目＝朝用、3行目＝夕用（行の順番で判定します）。
 *
 * ----------------------------------------------------------------------------
 *  ■ 「Weekly」シートの列構成（1行目=見出し、2行目以降=各曜日）
 * ----------------------------------------------------------------------------
 *  ┌───┬──────┬──────┐
 *  │ A │ B    │ C    │
 *  │曜日│ 朝   │ 夕方 │
 *  ├───┼──────┼──────┤
 *  │ 月 │ 8:55 │ 15:55│
 *  │ … │ …    │ …    │
 *  │ 土 │ 8:55 │ :    │  ← 夕方は「:」＝投稿しない
 *  └───┴──────┴──────┘
 *  ※ 曜日は先頭1文字（月/火/水/木/金/土/日）で判定します（「月曜日」等でもOK）。
 *  ※ B/C が時刻（HH:mm）ならその時刻に投稿。時刻でなければ（`:`・空欄など）投稿しません。
 *
 * ----------------------------------------------------------------------------
 *  ■ スクリプトプロパティ（コード内ハードコード禁止）
 * ----------------------------------------------------------------------------
 *  CLIENT_ID / CLIENT_SECRET / SERVICE_ACCOUNT / PRIVATE_KEY / BOT_ID /
 *  TARGET_ID / SHEET_ID
 *  ＜任意＞ TARGET_TYPE：user=個人宛 / channel=トークルーム宛（未設定なら channel）
 *  ※ LASTRUN_* は二重投稿防止の自動フラグ（手動設定不要）。
 *
 * ----------------------------------------------------------------------------
 *  ■ 自動実行・動作確認
 * ----------------------------------------------------------------------------
 *    - setupTriggers()    : 毎分実行トリガーを作成（最初に1回）
 *    - tick()             : 毎分自動実行（Weeklyを見て該当時刻に投稿）
 *    - testAuthOnly()     : 認証だけ試す（送信なし）
 *    - testListTargets()  : Dailyの内容とWeeklyの予定を表示（送信なし）
 *    - testPostMorning()  : Dailyの朝の内容を今すぐ投稿（送信あり）
 *    - testPostEvening()  : Dailyの夕の内容を今すぐ投稿（送信あり）
 * ============================================================================
 */


/* ============================================================================
 *  0. 設定値
 * ==========================================================================*/
var CONFIG = {
  DAILY_SHEET_NAME: 'Daily',    // 内容シートのタブ名（見つからなければ左から1番目を使用）
  WEEKLY_SHEET_NAME: 'Weekly',  // スケジュールシートのタブ名（見つからなければ左から2番目）

  CATCHUP_MINUTES: 2,           // 実行が数分遅れても取りこぼさない猶予（二重投稿はしない）

  IMAGE_ASPECT_RATIO: 'rectangle',
  IMAGE_SIZE: 'cover',

  // Dailyシートの列（A=1 ...）
  DAILY_START_ROW: 2,
  DAILY_COL: {
    IMAGE_URL: 1, LINK1_TEXT: 2, LINK1_URL: 3, LINK2_TEXT: 4, LINK2_URL: 5, ENABLED: 6
  },

  // Weeklyシートの列（A=曜日, B=朝, C=夕）
  WEEKLY_COL: { DAY: 1, MORNING: 2, EVENING: 3 },

  // 曜日番号(1=月〜7=日) → 曜日ラベル
  WEEKDAY_JP: { '1': '月', '2': '火', '3': '水', '4': '木', '5': '金', '6': '土', '7': '日' },

  // 投稿スロット定義（Weeklyのどの列を見て、Dailyの何行目を使うか）
  SLOTS: [
    { key: 'morning', label: '朝', weeklyCol: 2, dailyIndex: 0 },
    { key: 'evening', label: '夕', weeklyCol: 3, dailyIndex: 1 }
  ],

  ENABLED_MARKS: ['○', '〇', '有効', 'TRUE', 'true', '1'],
  DEFAULT_LINK_TEXT: 'リンク',
  TIMEZONE: 'Asia/Tokyo'
};

// LINE WORKS の各種エンドポイント（Bot API v2.0）
var ENDPOINT = {
  TOKEN: 'https://auth.worksmobile.com/oauth2/v2.0/token',
  MESSAGE_USER: 'https://www.worksapis.com/v1.0/bots/{botId}/users/{userId}/messages',
  MESSAGE_CHANNEL: 'https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages'
};


/* ============================================================================
 *  1. 毎分実行の入口
 * ----------------------------------------------------------------------------
 *  今日の曜日の予定（Weekly）を見て、朝/夕の時刻に一致したら Daily の内容を投稿。
 * ==========================================================================*/
function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return; // 別のtickが実行中なら何もしない（二重投稿防止）

  try {
    var now = new Date();
    var nowMin = minutesOfDay_(now);
    var weekday = CONFIG.WEEKDAY_JP[Utilities.formatDate(now, CONFIG.TIMEZONE, 'u')]; // 月〜日
    var today = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyyMMdd');

    var props;
    try { props = getProperties_(); } catch (e) { Logger.log(e.message); return; }

    var ss;
    try { ss = SpreadsheetApp.openById(props.SHEET_ID); } catch (e) {
      Logger.log('スプレッドシートを開けません: ' + e.message); return;
    }

    // 今日の曜日のスケジュール（{morning:'HH:mm'|不正, evening:...}）
    var schedule = readWeeklyForDay_(ss, weekday);
    if (!schedule) return; // 今日の曜日がWeeklyに無い

    for (var i = 0; i < CONFIG.SLOTS.length; i++) {
      var slot = CONFIG.SLOTS[i];
      var timeStr = schedule[slot.key];
      if (!isValidTime_(timeStr)) continue; // 「:」や空欄などはスキップ

      var diff = nowMin - hhmmToMinutes_(timeStr);
      if (diff >= 0 && diff <= CONFIG.CATCHUP_MINUTES) {
        if (isAlreadyPostedToday_(slot.key, today)) return; // 今日この枠は投稿済み
        var content = readDaily_(ss)[slot.dailyIndex];      // 朝=0行目 / 夕=1行目
        var ok = postSlotContent_(props, content, slot.label + '（' + timeStr + '）');
        if (ok) markPostedToday_(slot.key, today);
        return;
      }
    }
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================================
 *  2. シート読み込み
 * ==========================================================================*/

/** タブ名で取得。無ければ左から fallbackIndex 番目のシートを使う。 */
function getSheet_(ss, name, fallbackIndex) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var all = ss.getSheets();
  if (all.length > fallbackIndex) return all[fallbackIndex];
  throw new Error('シート「' + name + '」が見つかりません');
}

/**
 * Daily（内容）シートを読み、[{imageUrl,link1Text,link1Url,link2Text,link2Url,enabled}] を返す。
 * 0番目=朝、1番目=夕（行の順番）。
 */
function readDaily_(ss) {
  var sh = getSheet_(ss, CONFIG.DAILY_SHEET_NAME, 0);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DAILY_START_ROW) return [];
  var n = lastRow - CONFIG.DAILY_START_ROW + 1;
  var v = sh.getRange(CONFIG.DAILY_START_ROW, 1, n, CONFIG.DAILY_COL.ENABLED).getValues();
  return v.map(function (r) {
    return {
      imageUrl:  String(r[CONFIG.DAILY_COL.IMAGE_URL - 1] || '').trim(),
      link1Text: String(r[CONFIG.DAILY_COL.LINK1_TEXT - 1] || '').trim(),
      link1Url:  String(r[CONFIG.DAILY_COL.LINK1_URL - 1] || '').trim(),
      link2Text: String(r[CONFIG.DAILY_COL.LINK2_TEXT - 1] || '').trim(),
      link2Url:  String(r[CONFIG.DAILY_COL.LINK2_URL - 1] || '').trim(),
      enabled:   isEnabled_(r[CONFIG.DAILY_COL.ENABLED - 1])
    };
  });
}

/**
 * Weekly（スケジュール）シートから、指定曜日の朝／夕の時刻を返す。
 * 返り値: { morning: 'HH:mm'|生の値, evening: 'HH:mm'|生の値 } または null
 */
function readWeeklyForDay_(ss, weekday) {
  var sh = getSheet_(ss, CONFIG.WEEKLY_SHEET_NAME, 1);
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return null;
  var v = sh.getRange(1, 1, lastRow, CONFIG.WEEKLY_COL.EVENING).getValues();
  for (var i = 0; i < v.length; i++) {
    var day = String(v[i][CONFIG.WEEKLY_COL.DAY - 1] || '').trim();
    if (day && day.charAt(0) === weekday) { // 「月」でも「月曜日」でも先頭1文字で一致
      return {
        morning: normalizeTime_(v[i][CONFIG.WEEKLY_COL.MORNING - 1]),
        evening: normalizeTime_(v[i][CONFIG.WEEKLY_COL.EVENING - 1])
      };
    }
  }
  return null;
}

/** 値が "HH:mm" 形式の有効な時刻か。 */
function isValidTime_(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ''));
}

/**
 * 時刻の値を "HH:mm" に整える（Date型／"8:55"などに対応）。
 * 時刻でない値（"："や空欄）はそのまま返す→isValidTime_で弾かれてスキップされる。
 */
function normalizeTime_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'HH:mm');
  }
  var s = String(value == null ? '' : value).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
  return s;
}

/** 「有効」列が投稿対象を表すか。 */
function isEnabled_(value) {
  if (value === true) return true;
  var s = String(value == null ? '' : value).trim();
  return CONFIG.ENABLED_MARKS.indexOf(s) !== -1;
}


/* ============================================================================
 *  3. 投稿
 * ==========================================================================*/

/**
 * Dailyの1件分（朝または夕）をカルーセルとして送信。戻り値: 成功=true。
 */
function postSlotContent_(props, content, label) {
  if (!content)            { Logger.log(label + '：Dailyに内容がありません'); return false; }
  if (!content.enabled)    { Logger.log(label + '：有効(○)でないため送信しません'); return false; }
  if (!content.imageUrl)   { Logger.log(label + '：画像URLがありません'); return false; }
  if (!content.link1Url && !content.link2Url) { Logger.log(label + '：リンクがありません'); return false; }

  var token;
  try { token = getAccessToken_(props); }
  catch (e) { Logger.log(label + '：認証エラー: ' + e.message); return false; }

  try { postCarousel_(props, token, content); }
  catch (e) { Logger.log(label + '：送信失敗: ' + e.message); return false; }

  Logger.log('投稿成功（' + label + '）: ' + content.imageUrl);
  return true;
}

/** 画像1枚＋ボタン最大2つのカルーセルを、個人／チャンネルへ送信。 */
function postCarousel_(props, accessToken, item) {
  var url;
  if (props.TARGET_TYPE === 'user') {
    url = ENDPOINT.MESSAGE_USER.replace('{botId}', props.BOT_ID).replace('{userId}', props.TARGET_ID);
  } else {
    url = ENDPOINT.MESSAGE_CHANNEL.replace('{botId}', props.BOT_ID).replace('{channelId}', props.TARGET_ID);
  }

  var actions = [];
  if (item.link1Url) {
    actions.push({ type: 'uri', label: truncate_(item.link1Text || (CONFIG.DEFAULT_LINK_TEXT + '1'), 20), uri: item.link1Url });
  }
  if (item.link2Url) {
    actions.push({ type: 'uri', label: truncate_(item.link2Text || (CONFIG.DEFAULT_LINK_TEXT + '2'), 20), uri: item.link2Url });
  }

  var column = {
    thumbnailImageUrl: item.imageUrl,
    text: ' ',
    defaultAction: actions[0],
    actions: actions
  };

  var messageBody = {
    content: {
      type: 'carousel',
      imageAspectRatio: CONFIG.IMAGE_ASPECT_RATIO,
      imageSize: CONFIG.IMAGE_SIZE,
      columns: [column]
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
 *  4. 認証関連（JWT → アクセストークン取得）
 * ==========================================================================*/

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
  if (code !== 200) throw new Error('トークン取得に失敗 (HTTP ' + code + '): ' + body);
  var json = JSON.parse(body);
  if (!json.access_token) throw new Error('レスポンスに access_token がありません: ' + body);
  Logger.log('アクセストークンの取得に成功しました。');
  return json.access_token;
}

function createJwt_(props) {
  var header = { alg: 'RS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var claim = { iss: props.CLIENT_ID, sub: props.SERVICE_ACCOUNT, iat: now, exp: now + 60 * 60 };
  var signingInput = base64UrlEncode_(JSON.stringify(header)) + '.' + base64UrlEncode_(JSON.stringify(claim));
  var privateKey = normalizePrivateKey_(props.PRIVATE_KEY);
  var signature = base64UrlEncodeBytes_(Utilities.computeRsaSha256Signature(signingInput, privateKey));
  return signingInput + '.' + signature;
}

function normalizePrivateKey_(rawKey) {
  var key = String(rawKey).trim();
  if (key.indexOf('\n') !== -1) return key;
  var begin = '-----BEGIN PRIVATE KEY-----';
  var end = '-----END PRIVATE KEY-----';
  var body = key.replace(begin, '').replace(end, '').replace(/\s+/g, '');
  var lines = [];
  for (var i = 0; i < body.length; i += 64) lines.push(body.substring(i, i + 64));
  return begin + '\n' + lines.join('\n') + '\n' + end;
}


/* ============================================================================
 *  5. トリガー設定
 * ==========================================================================*/

/** 毎分実行トリガーを作成（既存の同名トリガーは作り直し）。 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  Logger.log('毎分トリガーを設定しました。投稿スケジュールはWeeklyシートで管理します。');
}


/* ============================================================================
 *  6. 二重投稿防止
 * ==========================================================================*/

function isAlreadyPostedToday_(slotKey, today) {
  return PropertiesService.getScriptProperties().getProperty('LASTRUN_' + slotKey) === today;
}
function markPostedToday_(slotKey, today) {
  PropertiesService.getScriptProperties().setProperty('LASTRUN_' + slotKey, today);
}


/* ============================================================================
 *  7. 共通ユーティリティ
 * ==========================================================================*/

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
  if (missing.length > 0) throw new Error('スクリプトプロパティが未設定です: ' + missing.join(', '));
  var targetType = String(sp.getProperty('TARGET_TYPE') || 'channel').trim().toLowerCase();
  props.TARGET_TYPE = (targetType === 'user') ? 'user' : 'channel';
  return props;
}

function minutesOfDay_(date) {
  var hh = parseInt(Utilities.formatDate(date, CONFIG.TIMEZONE, 'HH'), 10);
  var mm = parseInt(Utilities.formatDate(date, CONFIG.TIMEZONE, 'mm'), 10);
  return hh * 60 + mm;
}
function hhmmToMinutes_(hhmm) {
  var p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
function truncate_(str, max) {
  var s = String(str == null ? '' : str);
  return s.length <= max ? s : s.substring(0, max - 1) + '…';
}
function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}
function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


/* ============================================================================
 *  8. テスト用（手動実行）関数
 * ==========================================================================*/

/** 【テスト】認証だけ試す（送信なし）。 */
function testAuthOnly() {
  try {
    var props = getProperties_();
    var token = getAccessToken_(props);
    Logger.log('認証OK。アクセストークン(先頭20文字): ' + token.substring(0, 20) + '...');
  } catch (e) {
    Logger.log('認証NG: ' + e.message);
  }
}

/** 【テスト】Dailyの内容とWeeklyの予定を表示（送信なし）。 */
function testListTargets() {
  try {
    var props = getProperties_();
    var ss = SpreadsheetApp.openById(props.SHEET_ID);

    var daily = readDaily_(ss);
    ['朝', '夕'].forEach(function (label, i) {
      var c = daily[i];
      if (!c) { Logger.log('【Daily】' + label + '：内容なし'); return; }
      Logger.log('【Daily】' + label + '：画像=' + c.imageUrl + '（有効=' + c.enabled + '）');
      Logger.log('   リンク1[' + c.link1Text + '] ' + c.link1Url);
      Logger.log('   リンク2[' + c.link2Text + '] ' + c.link2Url);
    });

    var sh = getSheet_(ss, CONFIG.WEEKLY_SHEET_NAME, 1);
    var v = sh.getRange(1, 1, sh.getLastRow(), CONFIG.WEEKLY_COL.EVENING).getValues();
    Logger.log('【Weekly】曜日 / 朝 / 夕（時刻でない値は投稿しない）');
    v.forEach(function (r) { Logger.log('   ' + r[0] + ' / ' + r[1] + ' / ' + r[2]); });
  } catch (e) {
    Logger.log('確認NG: ' + e.message);
  }
}

/** 【テスト】Dailyの朝の内容を今すぐ投稿（時刻に関係なく送信）。 */
function testPostMorning() {
  var props = getProperties_();
  var daily = readDaily_(SpreadsheetApp.openById(props.SHEET_ID));
  postSlotContent_(props, daily[0], '朝（テスト）');
}

/** 【テスト】Dailyの夕の内容を今すぐ投稿（時刻に関係なく送信）。 */
function testPostEvening() {
  var props = getProperties_();
  var daily = readDaily_(SpreadsheetApp.openById(props.SHEET_ID));
  postSlotContent_(props, daily[1], '夕（テスト）');
}


/* ============================================================================
 *  9. トークルームの channelId 取得（初期セットアップ用）
 * ----------------------------------------------------------------------------
 *  既存のトークルームに配信するには、そのルームの channelId が必要です。
 *  以下の手順で取得します（1回だけの作業）。
 *   1. このスクリプトを「ウェブアプリ」としてデプロイし、URLを取得
 *      （デプロイ → 新しいデプロイ → 種類:ウェブアプリ →
 *        次のユーザーとして実行:自分 / アクセスできるユーザー:全員）
 *   2. LINE WORKS Developer Console の Bot 設定で、Callback URL に上記URLを設定し、
 *      「メッセージ」イベントを ON にして保存
 *   3. 投稿したいトークルームに Bot を招待する
 *   4. そのトークルームで「テスト」など何かメッセージを送る
 *      → 下の doPost がイベントを受け取り、channelId を保存します
 *   5. 関数 showCapturedChannelId() を実行し、ログに出た channelId を控える
 *   6. スクリプトプロパティ TARGET_ID にその channelId を、TARGET_TYPE に channel を設定
 *  ※ channelId を取得できたら、Callback は無効に戻しても構いません。
 * ==========================================================================*/

/** LINE WORKS からのイベント受信。ルームのメッセージ等から channelId を保存します。 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var channelId = body && body.source && body.source.channelId;
    if (channelId) {
      PropertiesService.getScriptProperties().setProperty('CAPTURED_CHANNEL_ID', channelId);
      Logger.log('channelId を取得・保存しました: ' + channelId);
    } else {
      Logger.log('channelId が含まれていませんでした（個人トークの可能性）: ' + e.postData.contents);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }
  return ContentService.createTextOutput('OK');
}

/** 【セットアップ】取得済みの channelId をログに表示します。 */
function showCapturedChannelId() {
  var id = PropertiesService.getScriptProperties().getProperty('CAPTURED_CHANNEL_ID');
  if (id) {
    Logger.log('取得済み channelId: ' + id);
    Logger.log('→ スクリプトプロパティ TARGET_ID にこの値、TARGET_TYPE に channel を設定してください。');
  } else {
    Logger.log('まだ取得できていません。ウェブアプリのデプロイ→Callback設定→Botをルームに招待→ルームでメッセージ送信、を確認してください。');
  }
}
