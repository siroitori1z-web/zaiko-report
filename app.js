const GAS_URL = "https://script.google.com/macros/s/AKfycbxu8GIUU1F68aWGtHsZ9J64rDZd3CcX99YbkyQ2WQLbeYDUBTkRX154UbEkYlEB3rsFog/exec";

const stores = [{"店舗名":"ドン・キホーテ松原店","商品リスト":["マイプロ ココア","マイプロレモン","アルプロンチョコ","アルプロンクッキー","VALXチョコ","VALXベリー","グロングチョコ","グロングヨーグルト","ザバスココア","ザバスストロベリー","ザバスリッチショコラ","ザバスバナナ","ザバスキャラメル","ザバスヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテりんくう店","商品リスト":["VALXチョコ","アルプロチョコ","グロングチョコ","VALXピーチ","アルプロストロベリー","ウルトラココナッツ","マイプロココア","マイプロ抹茶","マイプロレモン","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ京都伏見店","商品リスト":["マイプロココア","マイプロレモン","アルプロンチョコ","アルプロンイチゴ","VALXチョコ","VALXピーチ","ホエイチョコ","ホエイヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ西大和店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー","VALXチョコ","VALXピーチ","ウルトラココナッツ","ウルトラクッキー","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ箕面店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ茨木店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー＆クリーム","バルクスチョコ","バルクスベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ枚方店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","ウルトラココナッツ","ウルトラパイン","コップ小","ウエットティッシュ"]}];

window.onload = async () => {
    const storeSelect = document.getElementById('storeSelect');
    const fieldsDiv = document.getElementById('inventoryFields');
    const output = document.getElementById('output');
    const saveBtn = document.getElementById('saveBtn');
    const reportBtn = document.getElementById('reportBtn');

    let cloudData = {};

    // ------------------------
    // クラウドデータ取得（安定版）
    // ------------------------
    async function loadCloudData() {
        try {
            const res = await fetch(GAS_URL);
            const json = await res.json();
            cloudData = json || {};
        } catch (err) {
            console.error("クラウド読み込み失敗:", err);
            cloudData = {};
        }
    }

    // ------------------------
    // フィールド描画
    // ------------------------
    function renderFields(storeName) {
        const store = stores.find(s => s.店舗名 === storeName);
        if (!store) return;

        fieldsDiv.innerHTML = "";
        const savedData = cloudData[storeName] || {};

        store.商品リスト.forEach(item => {
            const val = savedData[item] ?? 0;
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `
                <strong>${item}</strong>
                補充前: <input type="number" min="0" class="prev" data-item="${item}" value="${val}">
                補充後: <input type="number" min="0" class="curr" data-item="${item}" value="${val}">
            `;
            fieldsDiv.appendChild(row);
        });
    }

    // ------------------------
    // 初期化処理
    // ------------------------
    stores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.店舗名;
        opt.textContent = s.店舗名;
        storeSelect.appendChild(opt);
    });

    // アプリを開いた時に「少し待たせて」確実に取りに行く
    fieldsDiv.innerHTML = 'スプレッドシートからデータ読み込み中...';
    await loadCloudData();
    
    // 読み込みが終わったら最初の店舗を表示
    if(storeSelect.value) {
        renderFields(storeSelect.value);
    } else {
        fieldsDiv.innerHTML = '';
    }

    // 店舗変更時
    storeSelect.onchange = () => {
        renderFields(storeSelect.value);
    };

    // ------------------------
    // ギガファイル便エリア（復活！）
    // ------------------------
    const gigaContainer = document.createElement('div');
    gigaContainer.style.margin = '20px 0';
    gigaContainer.style.padding = '15px';
    gigaContainer.style.backgroundColor = '#f0f0f0';
    gigaContainer.style.borderRadius = '8px';
    gigaContainer.innerHTML = `
        <button type="button" style="background-color: #0056b3; margin-bottom: 10px; color: white; padding: 10px; border: none; border-radius: 4px; cursor: pointer;" onclick="window.open('https://gigafile.nu/')">📸 ギガファイル便を開く</button>
        <input type="text" id="gigafileUrl" placeholder="ギガファイル便のURLを貼り付け" style="width:100%; padding:10px; box-sizing:border-box;">
    `;
    saveBtn.parentNode.insertBefore(gigaContainer, saveBtn);

    // ------------------------
    // 保存処理（安定版）
    // ------------------------
    saveBtn.onclick = async () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert("店舗を選択してください");

        const data = {};
        document.querySelectorAll('.curr').forEach(el => {
            data[el.dataset.item] = Number(el.value) || 0;
        });

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = "保存中...";

            await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ storeName, data })
            });

            await loadCloudData(); // 保存後に最新データを再取得
            alert("スプレッドシートに保存しました！");
            renderFields(storeName);

        } catch (err) {
            console.error(err);
            alert("保存に失敗しました");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "補充後の在庫を保存";
        }
    };

    // ------------------------
    // 報告文生成（レイアウト復活！）
    // ------------------------
    reportBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return;

        const now = new Date();
        const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}（${["日曜","月曜","火曜","水曜","木曜","金曜","土曜"][now.getDay()]}）`;
        const gigaUrl = document.getElementById('gigafileUrl').value;

        let text = `${dateStr} ${storeName}\n\n`;
        if (gigaUrl) text += `■自販機写真（ギガファイル便）\n${gigaUrl}\n\n`;

        const itemRows = document.querySelectorAll('.item-row');
        text += `[補充前]\n`;
        itemRows.forEach((row, index) => {
            const name = row.querySelector('strong').textContent;
            const p = row.querySelector('.prev').value || 0;
            text += `${name} ${p}\n`;
            if (itemRows[index + 1] && itemRows[index + 1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });

        text += `\n\n[補充後]\n`;
        itemRows.forEach((row, index) => {
            const name = row.querySelector('strong').textContent;
            const c = row.querySelector('.curr').value || 0;
            text += `${name} ${c}\n`;
            if (itemRows[index + 1] && itemRows[index + 1].querySelector('strong').textContent === "コップ小") text += `\n`;
        });

        output.textContent = text;
    };

    // ------------------------
    // Gmailボタン（復活！）
    // ------------------------
    const gmailBtn = document.createElement('button');
    gmailBtn.textContent = 'Gmailで報告（下書き作成）';
    gmailBtn.style.backgroundColor = '#ea4335';
    gmailBtn.style.color = 'white';
    gmailBtn.style.padding = '10px';
    gmailBtn.style.border = 'none';
    gmailBtn.style.borderRadius = '4px';
    gmailBtn.style.cursor = 'pointer';
    gmailBtn.style.marginTop = '10px';
    document.body.insertBefore(gmailBtn, output);
    
    gmailBtn.onclick = () => {
        const reportText = output.textContent;
        if (!reportText) return alert('先に「報告文を作成」を押してください');
        const to = "siroitori1z@gmail.com"; 
        const subject = encodeURIComponent(`${storeSelect.value} 在庫報告`);
        const body = encodeURIComponent(reportText);
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    };
};
