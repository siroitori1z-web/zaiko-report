const GAS_URL = "https://script.google.com/macros/s/AKfycbyAfnCDD7fOHScKvK4PyAiFTaosfDgFhix_P5azEtCJh5vcy3QmkH4JML0f8t3pfhErZg/exec";

const stores = [{ "店舗名": "ドン・キホーテ松原店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンクッキー", "VALXチョコ", "VALXベリー", "グロングチョコ", "グロングヨーグルト", "ザバスココア", "ザバスストロベリー", "ザバスリッチショコラ", "ザバスバナナ", "ザバスキャラメル", "ザバスヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテりんくう店", "商品リスト": ["VALXチョコ", "アルプロチョコ", "グロングチョコ", "VALXピーチ", "アルプロストロベリー", "ウルトラココナッツ", "マイプロココア", "マイプロ抹茶", "マイプロレモン", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ京都伏見店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンイチゴ", "VALXチョコ", "VALXピーチ", "ホエイチョコ", "ホエイヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ西大和店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー", "VALXチョコ", "VALXピーチ", "ウルトラココナッツ", "ウルトラクッキー", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ箕面店", "商品リスト": ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ茨木店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー＆クリーム", "バルクスチョコ", "バルクスベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ枚方店", "商品リスト": ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "ウルトラココナッツ", "ウルトラパイン", "コップ小", "ウエットティッシュ"] }];

// 画面が読み込まれたら実行
window.addEventListener('DOMContentLoaded', () => {
    const storeSelect = document.getElementById('storeSelect');
    const fieldsDiv = document.getElementById('inventoryFields');
    const output = document.getElementById('output');
    const saveBtn = document.getElementById('saveBtn');
    const reportBtn = document.getElementById('reportBtn');

    let cloudData = {};
    const BUFFER_MS = 15 * 60 * 1000; // 15分間の保護ウィンドウ

    // --- 1. ギガファイル便エリア & 復元通知エリア ---
    const noticeDiv = document.createElement('div');
    noticeDiv.id = 'snapshotNotice';
    noticeDiv.style = 'display:none; margin:10px 0; padding:10px; background:#e8f0fe; border-left:4px solid #1a73e8; border-radius:4px; font-size:13px; color:#174ea6;';
    fieldsDiv.parentNode.insertBefore(noticeDiv, fieldsDiv);

    const gigaContainer = document.createElement('div');
    gigaContainer.style = 'margin:20px 0; padding:15px; background:#f0f0f0; border-radius:8px;';
    gigaContainer.innerHTML = `
        <button type="button" style="background:#0056b3; color:white; padding:10px; border:none; border-radius:4px; margin-bottom:10px;" onclick="window.open('https://gigafile.nu/')">📸 ギガファイル便を開く</button>
        <input type="text" id="gigafileUrl" placeholder="URLを貼り付け" style="width:100%; padding:10px; box-sizing:border-box;">
    `;
    saveBtn.parentNode.insertBefore(gigaContainer, saveBtn);

    // --- 2. 報告ボタン (スプレッドシート直接保存 & コピー) ---
    const reportActionContainer = document.createElement('div');
    reportActionContainer.style = 'margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;';

    const saveReportSheetBtn = document.createElement('button');
    saveReportSheetBtn.textContent = '📊 スプレッドシートに報告保存';
    saveReportSheetBtn.style = 'background:#0d7c66; color:white; padding:12px; border:none; border-radius:4px; flex:2; cursor:pointer; font-weight:bold; font-size:14px;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 報告文をコピー';
    copyBtn.style = 'background:#4a5568; color:white; padding:12px; border:none; border-radius:4px; flex:1; cursor:pointer; font-weight:bold; font-size:14px;';

    reportActionContainer.appendChild(saveReportSheetBtn);
    reportActionContainer.appendChild(copyBtn);
    document.body.insertBefore(reportActionContainer, output);

    const reportStatusNotice = document.createElement('div');
    reportStatusNotice.id = 'reportStatusNotice';
    reportStatusNotice.style = 'display:none; margin:10px 0; padding:10px; background:#e6fffa; border-left:4px solid #0d7c66; border-radius:4px; font-size:13px; color:#234e52;';
    document.body.insertBefore(reportStatusNotice, output);

    // --- 履歴・スナップショット補助関数 ---
    const getSnapshot = (storeName) => {
        try {
            const raw = localStorage.getItem(`protein_snapshot_${storeName}`);
            if (!raw) return null;
            const snapshot = JSON.parse(raw);
            if (Date.now() - snapshot.timestamp <= BUFFER_MS) {
                return snapshot;
            }
        } catch (e) { console.error("スナップショット読み込みエラー:", e); }
        return null;
    };

    const getItemHistory = (storeName, item) => {
        try {
            const raw = localStorage.getItem(`protein_history_${storeName}_${item}`);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    };

    const addHistoryLog = (storeName, item, val) => {
        try {
            const history = getItemHistory(storeName, item);
            const nowStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            if (history.length === 0 || history[history.length - 1].value !== val) {
                history.push({ value: val, time: nowStr, timestamp: Date.now() });
                if (history.length > 5) history.shift(); // 直近5件を保持
                localStorage.setItem(`protein_history_${storeName}_${item}`, JSON.stringify(history));
            }
        } catch (e) { console.error("履歴書き込みエラー:", e); }
    };

    // --- 3. データ処理 ---
    const loadCloudData = async () => {
        try {
            const res = await fetch(GAS_URL);
            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
            }
            const json = await res.json();
            cloudData = {};
            if (json.raw) {
                json.raw.forEach(d => {
                    if (!cloudData[d.store]) cloudData[d.store] = {};
                    cloudData[d.store][d.item] = d.value;
                });
            }
            // LocalStorageにも最新データをバックアップ
            localStorage.setItem('protein_inventory_cloud_cache', JSON.stringify(cloudData));
            console.log("クラウドデータ取得成功:", cloudData);
        } catch (e) {
            console.warn("クラウド接続エラー。ローカルキャッシュ/LocalStorageを使用します:", e);
            const localCache = localStorage.getItem('protein_inventory_cloud_cache') || localStorage.getItem('protein_inventory_local');
            if (localCache) {
                try {
                    cloudData = JSON.parse(localCache);
                } catch (err) {
                    cloudData = {};
                }
            }
        }
        if (storeSelect.value) renderFields(storeSelect.value);
    };

    const renderFields = (storeName) => {
        const store = stores.find(s => s.店舗名 === storeName);
        if (!store) {
            fieldsDiv.innerHTML = "";
            noticeDiv.style.display = 'none';
            return;
        }

        fieldsDiv.innerHTML = "";
        const savedData = cloudData[storeName] || {};
        const activeSnapshot = getSnapshot(storeName);

        if (activeSnapshot) {
            const elapsedMin = Math.floor((Date.now() - activeSnapshot.timestamp) / (1000 * 60));
            const remainMin = Math.max(1, 15 - elapsedMin);
            noticeDiv.style.display = 'block';
            noticeDiv.innerHTML = `🛡️ <strong>再読み込み保護が有効です</strong>（${elapsedMin}分前に保存された一時入力データを自動復元中 / 残り有効時間: 約${remainMin}分）`;
        } else {
            noticeDiv.style.display = 'none';
        }

        store.商品リスト.forEach(item => {
            const cloudVal = savedData[item] ?? 0;
            const prevVal = activeSnapshot && activeSnapshot.prevData && activeSnapshot.prevData[item] !== undefined
                ? activeSnapshot.prevData[item]
                : cloudVal;
            const currVal = activeSnapshot && activeSnapshot.currData && activeSnapshot.currData[item] !== undefined
                ? activeSnapshot.currData[item]
                : cloudVal;

            const history = getItemHistory(storeName, item);
            let historyHtml = "";
            if (history.length > 0) {
                const historyList = history.map(h => `${h.value}(${h.time})`).join(" → ");
                historyHtml = `<span style="display:inline-block; margin-left:10px; font-size:11px; color:#666;" title="直前の入力履歴">📜 履歴: ${historyList}</span>`;
            }

            const row = document.createElement('div');
            row.className = 'item-row';
            row.style.marginBottom = '8px';
            row.innerHTML = `
                <strong>${item}</strong>
                補充前: <input type="number" class="prev" data-item="${item}" value="${prevVal}">
                補充後: <input type="number" class="curr" data-item="${item}" value="${currVal}">
                ${historyHtml}
            `;
            fieldsDiv.appendChild(row);
        });
    };

    // --- 4. 初期設定 ---
    storeSelect.innerHTML = '<option value="">店舗を選択してください</option>';
    stores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.店舗名; opt.textContent = s.店舗名;
        storeSelect.appendChild(opt);
    });

    loadCloudData();
    storeSelect.onchange = () => renderFields(storeSelect.value);

    // --- 5. ボタン動作 ---
    saveBtn.onclick = async () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert("店舗を選択してください");
        const currData = {};
        const prevData = {};

        document.querySelectorAll('.prev').forEach(el => { prevData[el.dataset.item] = el.value; });
        document.querySelectorAll('.curr').forEach(el => {
            currData[el.dataset.item] = el.value;
            addHistoryLog(storeName, el.dataset.item, el.value);
        });

        saveBtn.textContent = "保存中...";

        // 1. LocalStorageクラウドキャッシュ更新
        if (!cloudData[storeName]) cloudData[storeName] = {};
        Object.assign(cloudData[storeName], currData);
        localStorage.setItem('protein_inventory_cloud_cache', JSON.stringify(cloudData));

        // 2. 15分間有効なタイムスタンプ付きスナップショット保存 (再読み込み保護)
        const snapshot = {
            timestamp: Date.now(),
            storeName,
            currData,
            prevData
        };
        localStorage.setItem(`protein_snapshot_${storeName}`, JSON.stringify(snapshot));

        try {
            // GETで保存（POSTはGASのリダイレクトでCORSエラーになるため）
            const payload = encodeURIComponent(JSON.stringify({ storeName, data: currData }));
            const saveUrl = `${GAS_URL}?action=save&payload=${payload}`;
            await fetch(saveUrl, { mode: 'no-cors' });
            alert("保存完了！（15分間の自動保護スナップショットを作成しました。ページを再読み込みしても入力データは保持されます）");
        } catch (e) {
            console.error("保存エラー:", e);
            alert("クラウド同期中にエラーが発生しましたが、ローカルデータおよび15分保護スナップショットは安全に保存されました。");
        }
        saveBtn.textContent = "補充後の在庫を保存";
        renderFields(storeName);
    };

    reportBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return;
        const now = new Date();
        const dateStr = `${now.getMonth() + 1}/${now.getDate()}（${["日", "月", "火", "水", "木", "金", "土"][now.getDay()]}）`;
        let text = `${dateStr} ${storeName}\n\n■自販機写真\n${document.getElementById('gigafileUrl').value}\n\n[補充前]\n`;
        const rows = document.querySelectorAll('.item-row');
        rows.forEach((row, i) => {
            text += `${row.querySelector('strong').textContent} ${row.querySelector('.prev').value}\n`;
            if (rows[i + 1] && rows[i + 1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });
        text += `\n[補充後]\n`;
        rows.forEach((row, i) => {
            text += `${row.querySelector('strong').textContent} ${row.querySelector('.curr').value}\n`;
            if (rows[i + 1] && rows[i + 1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });
        output.textContent = text;
    };

    saveReportSheetBtn.onclick = async () => {
        const storeName = storeSelect.value;
        const reportText = output.textContent;
        if (!storeName || !reportText) return alert("先に「報告文を作成」ボタンを押して報告文を生成してください。");

        saveReportSheetBtn.textContent = "スプレッドシートに送信中...";
        try {
            const payload = encodeURIComponent(JSON.stringify({ storeName, reportText }));
            const reportUrl = `${GAS_URL}?action=saveReport&payload=${payload}`;
            await fetch(reportUrl, { mode: 'no-cors' });

            reportStatusNotice.style.display = 'block';
            reportStatusNotice.innerHTML = `✅ <strong>スプレッドシートへの報告保存が完了しました！</strong>（「報告ログ」シートに記録されました）`;
            alert("スプレッドシートの「報告ログ」シートへ報告文章を保存しました！");
        } catch (e) {
            console.error("報告保存エラー:", e);
            alert("スプレッドシートへの報告送信中にエラーが発生しました。ネットワークを確認してください。");
        }
        saveReportSheetBtn.textContent = "📊 スプレッドシートに報告保存";
    };

    copyBtn.onclick = async () => {
        const reportText = output.textContent;
        if (!reportText) return alert("先に「報告文を作成」ボタンを押して報告文を生成してください。");

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(reportText);
            } else {
                throw new Error("Clipboard API unavailable");
            }
            alert("📋 報告文章をクリップボードにコピーしました！");
        } catch (e) {
            const textarea = document.createElement('textarea');
            textarea.value = reportText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert("📋 報告文章をクリップボードにコピーしました！");
        }
    };
});