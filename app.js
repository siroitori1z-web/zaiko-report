const GAS_URL = "https://script.google.com/macros/s/AKfycbxu8GIUU1F68aWGtHsZ9J64rDZd3CcX99YbkyQ2WQLbeYDUBTkRX154UbEkYlEB3rsFog/exec";

const stores = [{"店舗名":"ドン・キホーテ松原店","商品リスト":["マイプロ ココア","マイプロレモン","アルプロンチョコ","アルプロンクッキー","VALXチョコ","VALXベリー","グロングチョコ","グロングヨーグルト","ザバスココア","ザバスストロベリー","ザバスリッチショコラ","ザバスバナナ","ザバスキャラメル","ザバスヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテりんくう店","商品リスト":["VALXチョコ","アルプロチョコ","グロングチョコ","VALXピーチ","アルプロストロベリー","ウルトラココナッツ","マイプロココア","マイプロ抹茶","マイプロレモン","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ京都伏見店","商品リスト":["マイプロココア","マイプロレモン","アルプロンチョコ","アルプロンイチゴ","VALXチョコ","VALXピーチ","ホエイチョコ","ホエイヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ西大和店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー","VALXチョコ","VALXピーチ","ウルトラココナッツ","ウルトラクッキー","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ箕面店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ茨木店","商品リスト":["マイプロココア","マイプロレモン","アルプロチョコ","アルプロクッキー＆クリーム","バルクスチョコ","バルクスベリー","グロングチョコ","グロングヨーグルト","コップ小","ウエットティッシュ"]},{"店舗名":"ドン・キホーテ枚方店","商品リスト":["マイプロココア","マイプロレモン","バルクスチョコ","バルクスピーチ","ザバスココア","ザバスストロベリー","ウルトラココナッツ","ウルトラパイン","コップ小","ウエットティッシュ"]}];

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

    let cloudData = null;

    // クラウドから最新データを取ってくる関数
    async function loadCloudData() {
        try {
            const res = await fetch(GAS_URL);
            cloudData = await res.json();
        } catch (e) {
            console.error("読み込み失敗", e);
            cloudData = {};
        }
    }

    // アプリ起動時にまず読み込み開始
    loadCloudData();

    storeSelect.onchange = async () => {
        const storeName = storeSelect.value;
        const store = stores.find(s => s.店舗名 === storeName);
        fieldsDiv.innerHTML = 'データ読み込み中...'; 
        if (!store) return;

        // まだ読み込みが終わってなければ少し待つ
        if (cloudData === null) {
            await loadCloudData();
        }

        fieldsDiv.innerHTML = '';
        const savedData = cloudData[storeName] || {};

        store.商品リスト.forEach(item => {
            const row = document.createElement('div');
            row.className = 'item-row';
            const val = savedData[item] || 0;
            row.innerHTML = `
                <strong>${item}</strong>
                補充前: <input type="number" class="prev" data-item="${item}" value="${val}"> 
                補充後: <input type="number" class="curr" data-item="${item}" value="${val}">
            `;
            fieldsDiv.appendChild(row);
        });
    };

    // --- ギガファイル便・ボタン・報告作成などの処理は変更なし ---
    // (中略) ここから下は前回お送りしたコードのsaveBtn以降と同じ内容を貼り付けてください
    // ★宛先メールアドレスの書き換えもお忘れなく！
