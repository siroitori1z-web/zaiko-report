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
  // 初回だけ: 旧「在庫データ」（行を足していく形）の最後の値から作る
  if (!rows.length) {
    const old = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("在庫データ");
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
function repSheet_() { return sheet_("報告", ["ID", "作業日", "店舗", "本文", "補充前", "補充後", "送信日時", "取込済"]); }

function saveReport_(p) {
  if (!p || !p.store || !p.workDay || !p.text) return { ok: false, error: "報告の中身が足りません" };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = repSheet_();
    const id = p.workDay.replace(/\//g, "") + "-" + p.store;
    const row = [id, p.workDay, p.store, p.text, JSON.stringify(p.before || {}), JSON.stringify(p.after || {}), now_(), false];
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
    .map((r) => ({ id: r[0], workDay: fmtDay_(r[1]), store: r[2], text: r[3], sentAt: String(r[6]), imported: r[7] === true }));
}
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

// ---- 共通: ID の行の列を書き換える ----------------------------------------
function setCell_(sheetName, id, col, value) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return { ok: false, error: sheetName + " シートがありません" };
  const i = rows_(sh).findIndex((r) => String(r[0]) === String(id));
  if (i < 0) return { ok: false, error: "見つかりません: " + id };
  sh.getRange(i + 2, col).setValue(value);
  return { ok: true };
}
