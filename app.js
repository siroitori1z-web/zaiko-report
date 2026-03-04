const stores = [{ "店舗名": "ドン・キホーテ松原店", "商品リスト": ["マイプロ ココア", "マイプロレモン", "アルプロンチョコ", "アルプロンクッキー", "VALXチョコ", "VALXベリー", "グロングチョコ", "グロングヨーグルト", "ザバスココア", "ザバスストロベリー", "ザバスリッチショコラ", "ザバスバナナ", "ザバスキャラメル", "ザバスヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテりんくう店", "商品リスト": ["VALXチョコ", "アルプロチョコ", "グロングチョコ", "VALXピーチ", "アルプロストロベリー", "ウルトラココナッツ", "マイプロココア", "マイプロ抹茶", "マイプロレモン", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ京都伏見店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンイチゴ", "VALXチョコ", "VALXピーチ", "ホエイチョコ", "ホエイヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ西大和店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー", "VALXチョコ", "VALXピーチ", "ウルトラココナッツ", "ウルトラクッキー", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ箕面店", "商品リスト": ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ茨木店", "商品リスト": ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー＆クリーム", "バルクスチョコ", "バルクスベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] }, { "店舗名": "ドン・キホーテ枚方店", "商品リスト": ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "ウルトラココナッツ", "ウルトラパイン", "コップ小", "ウエットティッシュ"] }];

window.onload = () => {
    const storeSelect = document.getElementById('storeSelect');
    const fieldsDiv = document.getElementById('inventoryFields');
    const output = document.getElementById('output');

    stores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.店舗名;
        opt.textContent = s.店舗名;
        storeSelect.appendChild(opt);
    });

    storeSelect.onchange = () => {
        const storeName = storeSelect.value;
        const store = stores.find(s => s.店舗名 === storeName);
        fieldsDiv.innerHTML = '';
        if (!store) return;

        const savedData = JSON.parse(localStorage.getItem(storeName) || '{}');

        store.商品リスト.forEach(item => {
            const row = document.createElement('div');
            row.className = 'item-row';
            const prevVal = savedData[item] || 0;
            row.innerHTML = `
                <strong>${item}</strong>
                補充前: <input type="number" class="prev" data-item="${item}" value="${prevVal}"> 
                補充後: <input type="number" class="curr" data-item="${item}" value="${prevVal}">
            `;
            fieldsDiv.appendChild(row);
        });
    };

    // --- ギガファイル便 連携エリア ---
    const gigaContainer = document.createElement('div');
    gigaContainer.style.margin = '20px 0';
    gigaContainer.style.padding = '15px';
    gigaContainer.style.backgroundColor = '#f0f0f0';
    gigaContainer.style.borderRadius = '8px';

    const openGigaBtn = document.createElement('button');
    openGigaBtn.textContent = '📸 ギガファイル便を開く';
    openGigaBtn.style.backgroundColor = '#0056b3';
    openGigaBtn.style.marginBottom = '10px';
    openGigaBtn.onclick = () => window.open('https://gigafile.nu/', '_blank');

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = 'gigafileUrl';
    urlInput.placeholder = 'ギガファイル便のURLを貼り付け';
    urlInput.style.width = '100%';
    urlInput.style.padding = '10px';
    urlInput.style.boxSizing = 'border-box';

    gigaContainer.appendChild(openGigaBtn);
    gigaContainer.appendChild(urlInput);
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.parentNode.insertBefore(gigaContainer, saveBtn);

    saveBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert('店舗を選んでください');
        const data = {};
        document.querySelectorAll('.curr').forEach(el => {
            data[el.dataset.item] = el.value;
        });
        localStorage.setItem(storeName, JSON.stringify(data));
        alert('補充後の在庫を保存しました！');
    };

    document.getElementById('reportBtn').onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert('店舗を選んでください');

        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const dayOfWeek = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"][now.getDay()];
        const dateStr = `${month}/${date}（${dayOfWeek}）`;

        const gigaUrl = document.getElementById('gigafileUrl').value;
        let text = `${dateStr} ${storeName}\n\n`;

        if (gigaUrl) {
            text += `■自販機写真（ギガファイル便）\n${gigaUrl}\n\n`;
        }

        const itemRows = document.querySelectorAll('.item-row');
        text += `[補充前]\n`;
        itemRows.forEach((row, index) => {
            const name = row.querySelector('strong').textContent;
            const p = row.querySelector('.prev').value || 0;
            text += `${name} ${p}\n`;
            const nextRow = itemRows[index + 1];
            if (nextRow && nextRow.querySelector('strong').textContent === "コップ小") {
                text += `\n`;
            }
        });

        text += `\n\n[補充後]\n`;
        itemRows.forEach((row, index) => {
            const name = row.querySelector('strong').textContent;
            const c = row.querySelector('.curr').value || 0;
            text += `${name} ${c}\n`;
            const nextRow = itemRows[index + 1];
            if (nextRow && nextRow.querySelector('strong').textContent === "コップ小") {
                text += `\n`;
            }
        });

        output.textContent = text;
    };

    const gmailBtn = document.createElement('button');
    gmailBtn.textContent = 'Gmailで報告（下書き作成）';
    gmailBtn.style.backgroundColor = '#ea4335';
    document.body.insertBefore(gmailBtn, output);

    gmailBtn.onclick = () => {
        const storeName = storeSelect.value;
        if (!storeName) return alert('店舗を選んでください');
        const reportText = output.textContent;
        if (!reportText) return alert('先に「報告文を作成」を押してください');

        const to = "your-email@example.com"; // ここを自分の送信先に書き換え
        const subject = encodeURIComponent(`${storeName} 在庫報告`);
        const body = encodeURIComponent(reportText);

        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    };
};