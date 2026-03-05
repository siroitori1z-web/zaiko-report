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

    // --- 1. ギガファイル便エリア ---
    const gigaContainer = document.createElement('div');
    gigaContainer.style = 'margin:20px 0; padding:15px; background:#f0f0f0; border-radius:8px;';
    gigaContainer.innerHTML = `
        <button type="button" style="background:#0056b3; color:white; padding:10px; border:none; border-radius:4px; margin-bottom:10px;" onclick="window.open('https://gigafile.nu/')">📸 ギガファイル便を開く</button>
        <input type="text" id="gigafileUrl" placeholder="URLを貼り付け" style="width:100%; padding:10px; box-sizing:border-box;">
    `;
    saveBtn.parentNode.insertBefore(gigaContainer, saveBtn);

    // --- 2. Gmailボタン ---
    const gmailBtn = document.createElement('button');
    gmailBtn.textContent = 'Gmailで報告（下書き作成）';
    gmailBtn.style = 'background:#ea4335; color:white; padding:10px; border:none; border-radius:4px; margin-top:10px; width:100%; cursor:pointer;';
    document.body.insertBefore(gmailBtn, output);

    // --- 3. データ処理 ---
    const loadCloudData = async () => {
        try {
            const res = await fetch(GAS_URL);
            const json = await res.json();
            // GASの応答 {stores:[...], raw:[{store, item, value}]} を
            // {storeName: {item: value}} の形式に変換
            cloudData = {};
            if (json.raw) {
                json.raw.forEach(d => {
                    if (!cloudData[d.store]) cloudData[d.store] = {};
                    cloudData[d.store][d.item] = d.value;
                });
            }
            console.log("クラウドデータ取得成功:", cloudData);
            if (storeSelect.value) renderFields(storeSelect.value);
        } catch (e) { console.error("データ取得失敗", e); }
    };

    const renderFields = (storeName) => {
        const store = stores.find(s => s.店舗名 === storeName);
        if (!store) return;
        fieldsDiv.innerHTML = "";
        const savedData = cloudData[storeName] || {};
        store.商品リスト.forEach(item => {
            const val = savedData[item] ?? 0;
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `<strong>${item}</strong> 補充前: <input type="number" class="prev" data-item="${item}" value="${val}"> 補充後: <input type="number" class="curr" data-item="${item}" value="${val}">`;
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
        const data = {};
        document.querySelectorAll('.curr').forEach(el => { data[el.dataset.item] = el.value; });
        saveBtn.textContent = "保存中...";
        try {
            // GETで保存（POSTはGASのリダイレクトでCORSエラーになるため）
            const payload = encodeURIComponent(JSON.stringify({ storeName, data }));
            const saveUrl = `${GAS_URL}?action=save&payload=${payload}`;
            await fetch(saveUrl);
            alert("保存完了！スプレッドシートを確認してください。");
        } catch (e) {
            console.error("保存エラー:", e);
            alert("保存に失敗しました。ネットワーク接続を確認してください。");
        }
        saveBtn.textContent = "補充後の在庫を保存";
        loadCloudData();
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

    gmailBtn.onclick = () => {
        if (!output.textContent) return alert("先に報告文を作成してください");
        window.location.href = `mailto:siroitori1z@gmail.com?subject=${encodeURIComponent(storeSelect.value + " 在庫報告")}&body=${encodeURIComponent(output.textContent)}`;
    };
});