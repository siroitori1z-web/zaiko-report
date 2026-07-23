/**
 * プロテイン在庫報告 ＆ 報告ログ書き込み GAS Backend Script
 * ----------------------------------------------------
 * Google スプレッドシートの 拡張機能 -> Apps Script に貼り付けてデプロイしてください。
 * Web アプリの設定:
 *   - 実行機能: 自分 (Me)
 *   - アクセスできるユーザー: 全員 (Anyone)
 */

function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : null;
    const payloadStr = e.parameter ? e.parameter.payload : null;

    if (action === 'saveReport' && payloadStr) {
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      return handleSaveReport(payload.storeName, payload.reportText);
    }

    if (action === 'save' && payloadStr) {
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      return handleSaveInventory(payload.storeName, payload.data);
    }

    // デフォルト: クラウドデータの一覧取得
    return handleGetInventory();

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    if (json.action === 'saveReport') {
      return handleSaveReport(json.storeName, json.reportText);
    }
    if (json.action === 'save') {
      return handleSaveInventory(json.storeName, json.data);
    }
    return handleGetInventory();
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 報告ログの書き込み処理
 * 「報告ログ」シートに [日時, 店舗名, 報告本文] をそのまま追記
 */
function handleSaveReport(storeName, reportText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("報告ログ");
  
  if (!sheet) {
    sheet = ss.insertSheet("報告ログ");
    // ヘッダー追加
    sheet.getRange(1, 1, 1, 3).setValues([["日時", "店舗名", "報告本文"]])
      .setFontWeight("bold")
      .setBackground("#0d7c66")
      .setFontColor("#ffffff");
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 600);
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
  const nextRow = sheet.getLastRow() + 1;
  
  const range = sheet.getRange(nextRow, 1, 1, 3);
  range.setValues([[nowStr, storeName, reportText]]);
  
  // テキストの折返し設定
  sheet.getRange(nextRow, 3).setWrap(true);

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "報告ログ保存完了" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 在庫データの保存処理
 */
function handleSaveInventory(storeName, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("在庫データ") || ss.getSheets()[0];
  
  const items = Object.keys(data);
  items.forEach(item => {
    const val = data[item];
    sheet.appendRow([storeName, item, val]);
  });

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "在庫データ保存完了" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 在庫データの取得処理
 */
function handleGetInventory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("在庫データ") || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();

  const raw = [];
  if (lastRow > 0) {
    const values = sheet.getRange(1, 1, lastRow, 3).getValues();
    values.forEach(row => {
      if (row[0] && row[1]) {
        raw.push({ store: row[0], item: row[1], value: row[2] });
      }
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ raw: raw }))
    .setMimeType(ContentService.MimeType.JSON);
}
