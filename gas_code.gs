/**
 * プロテイン在庫報告 GAS（v2）
 * ----------------------------------------------------
 * スプレッドシートの「拡張機能 → Apps Script」に貼り付けて、ウェブアプリとしてデプロイする。
 *   - 実行するユーザー: 自分
 *   - アクセスできるユーザー: 全員
 *
 * 最初に1回だけ: 関数「合言葉を作る」を実行し、実行ログに出た合言葉を
 * 現場アプリと拡張機能に入れる。合言葉はスクリプト プロパティ（TOKEN）にだけ保存され、
 * このコードや GitHub には書かれない。合言葉の無い呼び出しは全部断る。
 *
 * シート（無ければ自動で作る）
 *   最新在庫 : 店舗 | 商品 | 補充後 | 更新日時              … 店舗 x 商品で上書き（増え続けない）
 *   報告     : ID | 作業日 | 店舗 | 本文 | 補充前 | 補充後 | 送信日時 | 取込済
 *              … 作業日 x 店舗で上書き。本文は LINE と同じ形の報告文（拡張機能はこれを読む）
 *   発注依頼 : ID | 依頼日時 | 店舗 | 品目 | 数量 | メモ | 状態（未発注 / 発注済）
 *
 * 呼び出し（GET のパラメータ、または POST の JSON { action, token, payload, id, all }。token が必要）
 *   ?action=inventory                       → { ok, stores: { 店舗: { 商品: 値 } } }
 *   ?action=report&payload={...}            → 報告を保存し、最新在庫も更新 → { ok, id }
 *        payload = { workDay, store, text, before: {商品: 値}, after: {商品: 値} }
 *   ?action=reports[&all=1]                 → 取込済でない報告 → { ok, reports: [{ id, workDay, store, text }] }
 *   ?action=markImported&id=ID              → 取込済にする
 *   ?action=order&payload={...}             → 発注依頼を追加 → { ok, id }
 *        payload = { store, items: [{ name, qty, memo }] }
 *   ?action=orders[&all=1]                  → 未発注の依頼 → { ok, orders: [...] }
 *   ?action=markOrdered&id=ID               → 発注済にする
 *   action=photo  payload={ workDay, store, slot, name, mime, data(base64) } → ドライブに保存 → { ok, id }
 *   action=photos payload={ workDay, store } → [{ slot, id, name }]
 *   action=photoData id=ファイルID          → { ok, name, mime, data(base64) }
 *
 * 写真を使うには、最初に1回だけ関数「写真フォルダを作る」を実行して、ドライブの許可を出す。
 */

const TZ = "Asia/Tokyo";

function 合言葉を作る() {
  const token = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  PropertiesService.getScriptProperties().setProperty("TOKEN", token);
  Logger.log("合言葉: " + token);
}

// 長い報告は URL に入りきらないので POST でも受ける。
// 本文は JSON 文字列（Content-Type: text/plain で送ると、ブラウザの事前確認なしで届く）
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  const p = { action: body.action, token: body.token, id: body.id, all: body.all };
  if (body.payload) p.payload = JSON.stringify(body.payload);
  return doGet({ parameter: p });
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token) return json_({ ok: false, error: "合言葉がまだ作られていません（Apps Script で「合言葉を作る」を実行）" });
    if (p.token !== token) return json_({ ok: false, error: "合言葉が違います" });

    const payload = p.payload ? JSON.parse(p.payload) : null;
    switch (p.action || "inventory") {
      case "inventory": return json_({ ok: true, stores: readInventory_() });
      case "report": return json_(saveReport_(payload));
      case "reports": return json_({ ok: true, reports: listReports_(p.all === "1") });
      case "markImported": return json_(setCell_("報告", p.id, 8, true));
      case "order": return json_(saveOrder_(payload));
      case "orders": return json_({ ok: true, orders: listOrders_(p.all === "1") });
      case "markOrdered": return json_(setCell_("発注依頼", p.id, 7, "発注済"));
      case "photo": return json_(savePhoto_(payload));
      case "photos": return json_({ ok: true, photos: listPhotos_(payload || {}) });
      case "photoData": return json_(photoData_(p.id));
      default: return json_({ ok: false, error: "知らない action: " + p.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight("bold").setBackground("#0d7c66").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < header.length) {
    // 列を足した版にしたとき、足りない見出しを付ける
    const from = sh.getLastColumn() + 1;
    sh.getRange(1, from, 1, header.length - from + 1).setValues([header.slice(from - 1)])
      .setFontWeight("bold").setBackground("#0d7c66").setFontColor("#ffffff");
  }
  return sh;
}
const now_ = () => Utilities.formatDate(new Date(), TZ, "yyyy/MM/dd HH:mm:ss");
const rows_ = (sh) => (sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : []);

// ---- 在庫 -------------------------------------------------------------
function invSheet_() { return sheet_("最新在庫", ["店舗", "商品", "補充後", "更新日時"]); }

function readInventory_() {
  const out = {};
  const sh = invSheet_();
  let rows = rows_(sh);
  // 初回だけ: 旧シート（「在庫」= 値を書き換える形、または「在庫データ」= 行を足していく形）の
  // 最後の値から作る。どちらも 店舗 | 商品 | 値 の3列
  if (!rows.length) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const old = ss.getSheetByName("在庫") || ss.getSheetByName("在庫データ");
    if (old && old.getLastRow() > 0) {
      const latest = {};
      old.getRange(1, 1, old.getLastRow(), 3).getValues().forEach((r) => {
        if (r[0] && r[1]) latest[r[0] + "\t" + r[1]] = r[2];
      });
      const seed = Object.keys(latest).map((k) => { const [s, i] = k.split("\t"); return [s, i, latest[k], now_()]; });
      if (seed.length) sh.getRange(2, 1, seed.length, 4).setValues(seed);
      rows = seed;
    }
  }
  rows.forEach((r) => { if (r[0] && r[1]) (out[r[0]] = out[r[0]] || {})[r[1]] = r[2]; });
  return out;
}

function writeInventory_(store, after) {
  const sh = invSheet_();
  const rows = rows_(sh);
  const at = {};
  rows.forEach((r, i) => { at[r[0] + "\t" + r[1]] = i + 2; });
  const stamp = now_();
  const add = [];
  Object.keys(after).forEach((item) => {
    const row = at[store + "\t" + item];
    if (row) sh.getRange(row, 3, 1, 2).setValues([[after[item], stamp]]);
    else add.push([store, item, after[item], stamp]);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 4).setValues(add);
}

// ---- 報告 -------------------------------------------------------------
// 入力開始・送信はスマホが記録した実際の時刻。入店目安 = 入力開始 −10分、退店目安 = 送信 +10分
function repSheet_() { return sheet_("報告", ["ID", "作業日", "店舗", "本文", "補充前", "補充後", "送信日時", "取込済", "入力開始", "送信", "入店目安", "退店目安"]); }
const hhmm_ = (ms) => (ms ? Utilities.formatDate(new Date(ms), TZ, "HH:mm") : "");

function saveReport_(p) {
  if (!p || !p.store || !p.workDay || !p.text) return { ok: false, error: "報告の中身が足りません" };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = repSheet_();
    const id = p.workDay.replace(/\//g, "") + "-" + p.store;
    const started = Number(p.startedAt) || 0, sent = Number(p.sentAt) || 0;
    const row = [id, p.workDay, p.store, p.text, JSON.stringify(p.before || {}), JSON.stringify(p.after || {}), now_(), false,
      hhmm_(started), hhmm_(sent), hhmm_(started && started - 10 * 60e3), hhmm_(sent && sent + 10 * 60e3)];
    const found = rows_(sh).findIndex((r) => r[0] === id);
    if (found >= 0) sh.getRange(found + 2, 1, 1, row.length).setValues([row]); // 同じ日・同じ店舗は上書き（送り直し）
    else sh.appendRow(row);
    sh.getRange(found >= 0 ? found + 2 : sh.getLastRow(), 4).setWrap(true);
    writeInventory_(p.store, p.after || {});
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function listReports_(all) {
  return rows_(repSheet_())
    .filter((r) => r[0] && (all || r[7] !== true))
    .map((r) => ({ id: r[0], workDay: fmtDay_(r[1]), store: r[2], text: r[3], sentAt: String(r[6]), imported: r[7] === true,
      enter: fmtTime_(r[10]), leave: fmtTime_(r[11]) }));
}
// シートが時刻に変えてしまった値も「HH:mm」に戻す
function fmtTime_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "HH:mm") : String(v || ""); }
// シートが日付に変えてしまった値も「yyyy/MM/dd」に戻す
function fmtDay_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy/MM/dd") : String(v); }

// ---- 発注依頼 -----------------------------------------------------------
function ordSheet_() { return sheet_("発注依頼", ["ID", "依頼日時", "店舗", "品目", "数量", "メモ", "状態"]); }

function saveOrder_(p) {
  if (!p || !p.items || !p.items.length) return { ok: false, error: "発注する品目がありません" };
  const sh = ordSheet_();
  const stamp = now_();
  const base = Utilities.formatDate(new Date(), TZ, "yyyyMMddHHmmss");
  const rows = p.items.map((it, i) => [base + "-" + (i + 1), stamp, p.store || "", it.name, it.qty, it.memo || "", "未発注"]);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, id: base, count: rows.length };
}

function listOrders_(all) {
  return rows_(ordSheet_())
    .filter((r) => r[0] && (all || r[6] !== "発注済"))
    .map((r) => ({ id: r[0], at: String(r[1]), store: r[2], name: r[3], qty: r[4], memo: r[5], state: r[6] }));
}

// ---- 写真（現場でスマホから上げる → 家で拡張機能が巡回報告に入れる） ------------
// Google ドライブの「在庫報告_写真 / 作業日 / 店舗」に元のファイルのまま保存（撮影日時なども残る）
const PHOTO_ROOT = "在庫報告_写真";

// 最初に1回だけ実行: ドライブを使う許可を出し、写真のフォルダを作る
function 写真フォルダを作る() {
  Logger.log("写真フォルダ: " + folder_(DriveApp.getRootFolder(), PHOTO_ROOT).getUrl());
}
function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function photoSheet_() { return sheet_("写真", ["キー", "作業日", "店舗", "枠", "ファイルID", "ファイル名", "アップ日時"]); }

function savePhoto_(p) {
  if (!p || !p.workDay || !p.store || !p.slot || !p.data) return { ok: false, error: "写真の中身が足りません" };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const dir = folder_(folder_(folder_(DriveApp.getRootFolder(), PHOTO_ROOT), p.workDay.replace(/\//g, "-")), p.store);
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || "image/jpeg", `${p.slot}_${p.name || "photo.jpg"}`);
    const file = dir.createFile(blob);
    const sh = photoSheet_();
    const key = `${p.workDay}|${p.store}|${p.slot}`;
    const row = [key, p.workDay, p.store, p.slot, file.getId(), file.getName(), now_()];
    const i = rows_(sh).findIndex((r) => r[0] === key);
    if (i >= 0) {
      // 撮り直し: 前の写真はゴミ箱へ
      try { DriveApp.getFileById(sh.getRange(i + 2, 5).getValue()).setTrashed(true); } catch (err) {}
      sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
    } else sh.appendRow(row);
    return { ok: true, id: file.getId() };
  } finally {
    lock.releaseLock();
  }
}

function listPhotos_(p) {
  return rows_(photoSheet_())
    .filter((r) => r[0] && (!p.workDay || fmtDay_(r[1]) === p.workDay) && (!p.store || r[2] === p.store))
    .map((r) => ({ workDay: fmtDay_(r[1]), store: r[2], slot: r[3], id: r[4], name: r[5] }));
}

function photoData_(id) {
  const blob = DriveApp.getFileById(id).getBlob();
  return { ok: true, name: blob.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// ---- 共通: ID の行の列を書き換える ----------------------------------------
function setCell_(sheetName, id, col, value) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return { ok: false, error: sheetName + " シートがありません" };
  const i = rows_(sh).findIndex((r) => String(r[0]) === String(id));
  if (i < 0) return { ok: false, error: "見つかりません: " + id };
  sh.getRange(i + 2, col).setValue(value);
  return { ok: true };
}
