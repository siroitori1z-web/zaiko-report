const GAS_URL = "https://script.google.com/macros/s/AKfycbxu8GIUU1F68aWGtHsZ9J64rDZd3CcX99YbkyQ2WQLbeYDUBTkRX154UbEkYlEB3rsFog/exec";

const stores = [{"店舗名":"ドン・キホーテ松原店","商品リスト":["マイプロ ココア","マイプロレモン","アルプロンチョコ","アルプロンクッキー","VALXチョコ","VALXベリー","グロングチョコ","グロングヨーグルト","ザバスココア","ザバスストロベリー","ザバスリッチショコラ","ザバスバナナ","ザバスキャラメル","ザバスヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテりんくう店","商品リスト":["VALXチョコ","アルプロチョコ","グロングチョコ","VALXピーチ","アルプロストロベリー","ウルトラココナッツ","マイプロココア","マイプロ抹茶","マイプロレモン","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ京都伏見店","商品リスト":["マイプロココア","マイプロレモン","アルプロンチョコ","アルプロンイチゴ","VALXチョコ","VALXピーチ","ホエイチョコ","ホエイヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ西大和店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー","VALXチョコ","VALXピーチ","ウルトラココナッツ","ウルトラクッキー","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ箕面店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ茨木店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー＆クリーム","バルクスチョコ","バルクスベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ枚方店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","ウルトラココナッツ","ウルトラパイン","コップ小","ウエットティッシュ"]}];

window.onload = () => {
    const storeSelect = document.getElementById('storeSelect');
    const fieldsDiv = document.getElementById('inventoryFields');
    const output = document.getElementById('output');
    const saveBtn = document.getElementById('saveBtn');
    const reportBtn = document.getElementById('reportBtn');

    let cloudData = {};

    // 1. ギガファイル便エリア作成
    const gigaContainer = document.createElement('div');
    gigaContainer.style.margin = '20px 0';
    gigaContainer.style.padding = '15px';
    gigaContainer.style.backgroundColor = '#f0f0f0';
    gigaContainer.style.borderRadius = '8px';
    gigaContainer.innerHTML = `
        <button type="button" style="background-color: #0056b3; margin-bottom: 10px; color: white; padding: 10px; border: none; border-radius: 4px; cursor: pointer;" onclick="window.open('https://gigafile.nu/')">📸 ギガファイル便を開く</button>
        <input type="text" id="gigafileUrl" placeholder="URLを貼り付け" style="width:100%; padding:10px; box-sizing:border-box;">
    `;
    saveBtn.parentNode.insertBefore(gigaContainer, saveBtn);

    // 2. Gmailボタン作成
    const gmailBtn = document.createElement('button');
    gmailBtn.textContent = 'Gmailで報告（下書き作成）';
    gmailBtn.style.cssText = 'background-color:#ea4335; color:white; padding:10px; border:none; border-radius:4px; cursor:pointer; margin-top:10px; width:100%;';
    document.body.insertBefore(gmailBtn, output);

    // データ取得関数
    function loadCloudData() {
        fetch(GAS_URL).then(res => res.json()).then(json => {
            cloudData = json || {};
            if(storeSelect.value) renderFields(storeSelect.value); // 取得できたら即反映
        }).catch(e => console.error("通信エラー", e));
    }

    function renderFields(storeName) {
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
    }

    // 店舗リスト初期化
    stores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.店舗名; opt.textContent = s.店舗名;
        storeSelect.appendChild(opt);
    });

    loadCloudData(); // 起動時に読み込み開始（裏で動く）

    storeSelect.onchange = () => renderFields(storeSelect.value);

    saveBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert("店舗を選択してください");
        const data = {};
        document.querySelectorAll('.curr').forEach(el => { data[el.dataset.item] = el.value; });
        saveBtn.textContent = "保存中...";
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ storeName, data }) })
        .then(() => {
            alert("保存完了！");
            saveBtn.textContent = "補充後の在庫を保存";
            loadCloudData(); // 再読み込み
        });
    };

    reportBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return;
        const now = new Date();
        const dateStr = `${now.getMonth()+1}/${now.getDate()}（${["日","月","火","水","木","金","土"][now.getDay()]}）`;
        const gigaUrl = document.getElementById('gigafileUrl').value;
        let text = `${dateStr} ${storeName}\n\n`;
        if (gigaUrl) text += `■自販機写真\n${gigaUrl}\n\n`;
        const rows = document.querySelectorAll('.item-row');
        text += `[補充前]\n`;
        rows.forEach((row, i) => {
            text += `${row.querySelector('strong').textContent} ${row.querySelector('.prev').value}\n`;
            if (rows[i+1] && rows[i+1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });
        text += `\n[補充後]\n`;
        rows.forEach((row, i) => {
            text += `${row.querySelector('strong').textContent} ${row.querySelector('.curr').value}\n`;
            if (rows[i+1] && rows[i+1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });
        output.textContent = text;
    };

    gmailBtn.onclick = () => {
        if (!output.textContent) return alert("先に報告文を作成してください");
        window.location.href = `mailto:siroitori1z@gmail.com?subject=${encodeURIComponent(storeSelect.value + " 在庫報告")}&body=${encodeURIComponent(output.textContent)}`;
    };
};
