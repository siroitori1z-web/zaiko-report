// プロテイン在庫報告（現場用）v2
// 店舗を選ぶ → 補充前・補充後を入れる → 「保存して報告」1回で、スプレッドシートに報告と最新在庫が入る。
// 電波が無くても入力はスマホに残り、未送信の報告はつながった時に自動で送り直す。

const GAS_URL = "https://script.google.com/macros/s/AKfycbyAfnCDD7fOHScKvK4PyAiFTaosfDgFhix_P5azEtCJh5vcy3QmkH4JML0f8t3pfhErZg/exec";

const STORES = [
    { name: "ドン・キホーテ松原店", items: ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンクッキー", "VALXチョコ", "VALXベリー", "グロングチョコ", "グロングヨーグルト", "ザバスココア", "ザバスストロベリー", "ザバスリッチショコラ", "ザバスバナナ", "ザバスキャラメル", "ザバスヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテりんくう店", items: ["VALXチョコ", "アルプロチョコ", "グロングチョコ", "VALXピーチ", "アルプロストロベリー", "ウルトラ抹茶", "マイプロココア", "マイプロ抹茶", "マイプロレモン", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ箕面店", items: ["マイプロココア", "マイプロレモン", "ハイブリッドチョコ", "ハイブリッドカフェオレ", "ザバスココア", "ザバスストロベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ茨木店", items: ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー＆クリーム", "ハイブリッドチョコ", "ハイブリッドカフェオレ", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ枚方店", items: ["マイプロココア", "マイプロレモン", "ハイブリッドチョコ", "ハイブリッドカフェオレ", "ザバスココア", "ザバスストロベリー", "ザバスSOYバナナ", "ザバスBIOPROヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ京都伏見店", items: ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンイチゴ", "ハイブリッドチョコ", "ハイブリッドカフェオレ", "ホエイチョコ", "ホエイヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ西大和店", items: ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー", "VALXチョコ", "VALXピーチ", "ウルトラチョコ", "ウルトラ抹茶", "コップ小", "ウエットティッシュ"] },
];
// 回る順。日〜水は火ルート、木〜土は金ルート
const ROUTES = {
    火: ["ドン・キホーテ松原店", "ドン・キホーテりんくう店", "ドン・キホーテ箕面店", "ドン・キホーテ茨木店", "ドン・キホーテ枚方店", "ドン・キホーテ西大和店"],
    金: ["ドン・キホーテ松原店", "ドン・キホーテりんくう店", "ドン・キホーテ箕面店", "ドン・キホーテ京都伏見店", "ドン・キホーテ西大和店"],
};
const SUPPLIES = ["コップ小", "ウエットティッシュ"];
// 名前を変えた商品（2026-10-31）。新しい名前の「前回」が無いときは、古い名前の値を使う
const RENAMED = {
    "ドン・キホーテ箕面店": { "ハイブリッドチョコ": "バルクスチョコ", "ハイブリッドカフェオレ": "バルクスピーチ" },
    "ドン・キホーテ茨木店": { "ハイブリッドチョコ": "バルクスチョコ", "ハイブリッドカフェオレ": "バルクスベリー" },
    "ドン・キホーテ枚方店": { "ハイブリッドチョコ": "バルクスチョコ", "ハイブリッドカフェオレ": "バルクスピーチ", "ザバスSOYバナナ": "ウルトラココナッツ", "ザバスBIOPROヨーグルト": "ウルトラパイン" },
    "ドン・キホーテ京都伏見店": { "ハイブリッドチョコ": "VALXチョコ", "ハイブリッドカフェオレ": "VALXピーチ" },
    "ドン・キホーテりんくう店": { "ウルトラ抹茶": "ウルトラココナッツ" },
    "ドン・キホーテ西大和店": { "ウルトラチョコ": "ウルトラココナッツ", "ウルトラ抹茶": "ウルトラクッキー" },
};
function lastOf(name) {
    const inv = inventory[name] || {}, out = { ...inv };
    for (const [now, old] of Object.entries(RENAMED[name] || {})) if (out[now] == null && inv[old] != null) out[now] = inv[old];
    return out;
}

// 補充後がこれより少ないと「少ない」と出す（数字は仮。店舗や商品で変えたいときはここを直す）
const LOW = { "コップ小": 20, "ウエットティッシュ": 1, default: 1 };
const WEEK = "日月火水木金土";

// ---- 保存（スマホの中） ------------------------------------------------------
const store = {
    get(k, d) { try { const v = localStorage.getItem("zr2_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("zr2_" + k, JSON.stringify(v)); } catch { } },
};
let token = store.get("token", "");
let inventory = store.get("inventory", {});   // 店舗 → 商品 → 最新の補充後
let drafts = store.get("drafts", {});         // 「作業日|店舗」→ { before, after }（入力中のもの。送れたら消す）
let outbox = store.get("outbox", []);         // 未送信の報告
let sent = store.get("sent", {});             // 「作業日|店舗」→ 送れた時刻
let cart = store.get("cart", []);             // 発注したい物 [{ store, name, qty }]
let current = store.get("current", "");

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
// 作業日: 夜中0時台は前の日の巡回（西大和が日付をまたぐことがある）。1時からはその日
const todayWork = () => new Date(Date.now() - 1 * 3600e3);
const dayOf = (s) => { const [y, m, d] = s.split("/").map(Number); return new Date(y, m - 1, d); };
const routeOf = (s) => (dayOf(s).getDay() <= 3 ? "火" : "金");
const keyOf = (day, name) => `${day}|${name}`;
const short = (name) => name.replace(/^ドン・キホーテ/, "").replace(/店$/, "");
const norm = (s) => String(s ?? "").normalize("NFKC").replace(/[．。]/g, ".").replace(/\s/g, "");
const isNum = (s) => /^\d+(\.\d+)?$/.test(norm(s));

let workDay = ymd(todayWork());

// ---- スプレッドシートとのやりとり ----------------------------------------------
async function api(action, payload) {
    if (!token) throw new Error("合言葉が入っていません（右上の ⚙）");
    // text/plain の POST は事前確認なしで届き、返事も読める
    const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action, token, payload }) });
    if (!res.ok) throw new Error(`通信エラー ${res.status}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "失敗しました");
    return j;
}

function setNet(text, warn) {
    $("net").textContent = text;
    $("net").className = "net" + (warn ? " warn" : "");
}

async function loadInventory() {
    try {
        const j = await api("inventory");
        inventory = j.stores || {};
        store.set("inventory", inventory);
        setNet(`最新の在庫を読み込みました（${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）`);
    } catch (e) {
        setNet(`在庫を読み込めませんでした: ${e.message}（前回の値で表示しています）`, true);
    }
    render();
}

// 未送信の報告を古い順に送る。送れたものは消す
let flushing = false;
async function flush() {
    if (flushing || !outbox.length || !token) return;
    flushing = true;
    try {
        while (outbox.length) {
            const r = outbox[0];
            await api("report", r);
            sent[keyOf(r.workDay, r.store)] = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            delete drafts[keyOf(r.workDay, r.store)];
            inventory[r.store] = Object.assign(inventory[r.store] || {}, r.after);
            outbox.shift();
            store.set("outbox", outbox); store.set("sent", sent); store.set("drafts", drafts); store.set("inventory", inventory);
        }
        setNet("報告はすべて送れています");
    } catch (e) {
        setNet(`未送信 ${outbox.length}件（${e.message}）。電波が戻ったら自動で送り直します`, true);
    } finally {
        flushing = false;
        render();
    }
}

// ---- 画面 -----------------------------------------------------------------
function draftOf(name) {
    const k = keyOf(workDay, name);
    // まだ触っていない店舗は、最新の在庫が届くたびに作り直す
    if (!drafts[k] || !drafts[k].touched) {
        const last = lastOf(name);
        const items = STORES.find((s) => s.name === name).items;
        // 補充前・補充後とも、前回の補充後から始める（変わった所だけ直せばよい）
        const v = Object.fromEntries(items.map((it) => [it, last[it] != null && last[it] !== "" ? String(last[it]) : ""]));
        drafts[k] = { before: { ...v }, after: { ...v }, touched: false };
    }
    return drafts[k];
}
const saveDrafts = () => store.set("drafts", drafts);

function renderStores() {
    const nav = $("stores");
    nav.innerHTML = "";
    const route = routeOf(workDay);
    const d = dayOf(workDay);
    const head = document.createElement("div");
    head.className = "route";
    const done = ROUTES[route].filter((n) => sent[keyOf(workDay, n)]).length;
    head.textContent = `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${route}ルート ${done}/${ROUTES[route].length}店舗 送信済み`;
    nav.appendChild(head);
    const waiting = new Set(outbox.map((r) => keyOf(r.workDay, r.store)));
    for (const name of ROUTES[route]) {
        const b = document.createElement("button");
        const k = keyOf(workDay, name);
        const mark = sent[k] ? "✓ " : waiting.has(k) ? "⏳ " : "";
        b.textContent = mark + short(name);
        b.className = (name === current ? "cur " : "") + (sent[k] ? "sent" : waiting.has(k) ? "wait" : "");
        b.onclick = () => { current = name; store.set("current", current); render(); window.scrollTo(0, 0); };
        nav.appendChild(b);
    }
    // ルート外の店舗
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">ほかの店舗…</option>` +
        STORES.filter((s) => !ROUTES[route].includes(s.name)).map((s) => `<option>${s.name}</option>`).join("");
    sel.onchange = () => { if (sel.value) { current = sel.value; store.set("current", current); render(); } };
    nav.appendChild(sel);
}

function lowOf(item, v) {
    if (!isNum(v)) return false;
    return Number(norm(v)) < (LOW[item] ?? LOW.default);
}

function renderForm() {
    const main = $("form");
    const s = STORES.find((x) => x.name === current);
    if (!s) { main.innerHTML = `<p>上の店舗を選んでください。</p>`; return; }
    const dr = draftOf(s.name);
    const last = lastOf(s.name);
    const k = keyOf(workDay, s.name);
    main.innerHTML = `<h2>${s.name}${sent[k] ? `　<span class="hint">✓ ${sent[k]} 送信済み（直して送り直せます）</span>` : ""}</h2>
        <div id="lowBanner" class="lowBanner" hidden></div>
        <div class="row head"><span>商品（前回）</span><span>補充前</span><span>補充後</span><span>🛒</span></div>`;
    // 補充後が少ない品を、いちばん上に赤字でまとめる
    const showLow = () => {
        const lows = s.items.filter((it) => lowOf(it, dr.after[it]));
        $("lowBanner").hidden = !lows.length;
        $("lowBanner").textContent = `⚠ 在庫が少なくなっています: ${lows.join("・")}（🛒 で発注依頼できます）`;
    };
    for (const it of s.items) {
        const row = document.createElement("div");
        const low = lowOf(it, dr.after[it]);
        row.className = "row" + (SUPPLIES.includes(it) ? " supply" : "") + (low ? " low" : "");
        const inCart = cart.some((c) => c.store === s.name && c.name === it);
        row.innerHTML = `<span class="name">${it}<small>前回 ${last[it] ?? "-"}${low ? ' <span class="lowTag">在庫が少なくなっています</span>' : ""}</small></span>
            <input type="text" inputmode="decimal" data-k="before" value="${dr.before[it] ?? ""}">
            <input type="text" inputmode="decimal" data-k="after" value="${dr.after[it] ?? ""}">
            <button type="button" class="cartBtn${inCart ? " on" : ""}" title="発注したい物に入れる">🛒</button>`;
        row.querySelectorAll("input").forEach((inp) => {
            inp.oninput = () => {
                dr[inp.dataset.k][it] = inp.value;
                dr.touched = true;
                if (!dr.startedAt) dr.startedAt = Date.now(); // 入力を始めた時刻（入店の目安）
                saveDrafts();
                inp.classList.toggle("bad", inp.value !== "" && !isNum(inp.value));
                if (inp.dataset.k === "after") {
                    const l = lowOf(it, inp.value);
                    row.classList.toggle("low", l);
                    row.querySelector("small").innerHTML = `前回 ${last[it] ?? "-"}${l ? ' <span class="lowTag">在庫が少なくなっています</span>' : ""}`;
                    showLow();
                }
            };
            inp.onfocus = () => inp.select();
        });
        row.querySelector(".cartBtn").onclick = () => toggleCart(s.name, it);
        main.appendChild(row);
    }
    showLow();
    main.appendChild(renderPhotoSlots(s, dr));
    const tools = document.createElement("div");
    tools.className = "tools";
    tools.innerHTML = `<button type="button" class="sub" id="sameBtn">補充後 ＝ 補充前（補充なし）</button>
        <button type="button" class="sub" id="copyBtn">報告文をコピー</button>`;
    main.appendChild(tools);
    main.insertAdjacentHTML("beforeend", `<button type="button" class="save" id="saveBtn">保存して報告</button><div class="status" id="status"></div>`);
    $("sameBtn").onclick = () => { dr.after = { ...dr.before }; dr.touched = true; saveDrafts(); render(); };
    $("copyBtn").onclick = async () => {
        const text = reportText(s, dr);
        try { await navigator.clipboard.writeText(text); say("報告文をコピーしました", true); }
        catch { main.insertAdjacentHTML("beforeend", `<pre class="report">${text}</pre>`); }
    };
    $("saveBtn").onclick = () => submit(s, dr);
}

// 拡張機能が読む報告文（LINE に送っていたものと同じ形）
function reportText(s, dr) {
    const d = dayOf(workDay);
    const block = (vals) => s.items.map((it) => (it === SUPPLIES[0] ? "\n" : "") + `${it} ${norm(vals[it])}`).join("\n");
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}） ${s.name}\n\n■自販機写真\n\n\n[補充前]\n${block(dr.before)}\n\n[補充後]\n${block(dr.after)}`;
}

function say(text, ok) {
    const el = $("status");
    if (!el) return;
    el.textContent = text;
    el.className = "status " + (ok ? "ok" : "ng");
}

async function submit(s, dr) {
    const bad = s.items.filter((it) => !isNum(dr.before[it]) || !isNum(dr.after[it]));
    if (bad.length) {
        say(`数字が入っていない／数字でない欄があります: ${bad.join("・")}`, false);
        $("form").querySelectorAll("input").forEach((inp) => inp.classList.toggle("bad", !isNum(inp.value)));
        return;
    }
    const clean = (vals) => Object.fromEntries(s.items.map((it) => [it, norm(vals[it])]));
    const rep = {
        workDay, store: s.name, text: reportText(s, dr), before: clean(dr.before), after: clean(dr.after),
        startedAt: dr.startedAt || Date.now(), sentAt: Date.now(), // 入力開始・送信（入店・退店の目安になる）
    };
    // 同じ日・同じ店舗の未送信は差し替え
    outbox = outbox.filter((r) => keyOf(r.workDay, r.store) !== keyOf(workDay, s.name)).concat(rep);
    store.set("outbox", outbox);
    $("saveBtn").disabled = true;
    say("送信中…", true);
    await flush();
    const k = keyOf(workDay, s.name);
    if (sent[k] && !outbox.some((r) => keyOf(r.workDay, r.store) === k)) {
        // 次の店舗へ
        const route = ROUTES[routeOf(workDay)];
        const next = route.find((n) => !sent[keyOf(workDay, n)]);
        if (next && route.includes(s.name)) { current = next; store.set("current", current); render(); }
        say(`✓ ${short(s.name)} を保存しました${next && route.includes(s.name) ? `。次は ${short(next)}` : ""}`, true);
    } else {
        say("まだ送れていません。入力はスマホに残っているので、電波が戻ったら自動で送ります", false);
    }
}

// ---- 写真（撮ったらその場でドライブへ。家で拡張機能が巡回報告に入れる） -------------
const PHOTO_SLOTS = ["業務開始時", "業務終了時", "サーバー全体（正面）", "サーバー内清掃前", "サーバー内清掃後", "原料在庫"];
// 写真はスマホの中（IndexedDB）に置いてから送る。送れなくても消えない
function photoDb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open("zr2", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("photos");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function photoOp(mode, fn) {
    const db = await photoDb();
    return new Promise((res, rej) => {
        const t = db.transaction("photos", mode);
        const req = fn(t.objectStore("photos"));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
    });
}
const photoGet = (k) => photoOp("readonly", (s) => s.get(k));
const photoPut = (k, v) => photoOp("readwrite", (s) => s.put(v, k));
const photoAll = () => photoOp("readonly", (s) => s.getAll());
const photoKeys = () => photoOp("readonly", (s) => s.getAllKeys());
const photoDel = (k) => photoOp("readwrite", (s) => s.delete(k));

const blobToBase64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
});

let photoFlushing = false;
async function flushPhotos() {
    if (photoFlushing || !token) return;
    photoFlushing = true;
    try {
        const keys = await photoKeys();
        for (const k of keys) {
            const rec = await photoGet(k);
            if (!rec || rec.sent) continue;
            rec.state = "送信中…";
            render();
            await api("photo", { workDay: rec.workDay, store: rec.store, slot: rec.slot, name: rec.name, mime: rec.type, data: await blobToBase64(rec.blob) });
            rec.sent = true;
            rec.state = "";
            await photoPut(k, rec);
        }
    } catch (e) {
        setNet(`写真の未送信があります（${e.message}）。電波が戻ったら自動で送り直します`, true);
    } finally {
        photoFlushing = false;
        render();
        showPhotoPending();
    }
}
// 未送信の写真の数を上に出す（「今すぐ送る」で送り直し）
async function showPhotoPending() {
    try {
        let n = 0;
        for (const k of await photoKeys()) { const r = await photoGet(k); if (r && !r.sent) n++; }
        $("photoPending").hidden = !n;
        $("photoPendingCount").textContent = n;
    } catch { }
}
$("sendNow").onclick = () => { flush(); flushPhotos(); };
// 1週間より前の写真はスマホから消す（ドライブには残る）
async function prunePhotos() {
    try {
        const limit = Date.now() - 7 * 864e5;
        for (const k of await photoKeys()) { const r = await photoGet(k); if (r && r.sent && r.at < limit) await photoDel(k); }
    } catch { }
}

// この店舗の写真を iPhone の「写真」にまとめて残す（共有の画面で「画像を保存」を押す）
async function savePhotosToPhone(s) {
    const files = [];
    for (const slot of PHOTO_SLOTS) {
        const rec = await photoGet(`${workDay}|${s.name}|${slot}`);
        if (rec) files.push(new File([rec.blob], `${short(s.name)}_${slot}_${rec.name}`.replace(/[\\/:*?"<>|]/g, ""), { type: "image/jpeg" }));
    }
    if (!files.length) return say("まだ写真がありません", false);
    if (navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, title: `${short(s.name)} の写真` }); }
        catch (e) { if (e.name !== "AbortError") say("保存できませんでした: " + e.message, false); }
    } else {
        // 共有できないブラウザ: 1枚ずつダウンロード
        for (const f of files) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(f);
            a.download = f.name;
            a.click();
        }
    }
}

function renderPhotoSlots(s, dr) {
    const box = document.createElement("div");
    box.innerHTML = `<h3 class="ph">📷 写真（撮ったらその場で保存されます）</h3><div class="photos"></div>
        <button type="button" class="sub phoneSave">📥 この店舗の写真を iPhone の「写真」に保存</button>`;
    box.querySelector(".phoneSave").onclick = () => savePhotosToPhone(s);
    const grid = box.querySelector(".photos");
    for (const slot of PHOTO_SLOTS) {
        const k = `${workDay}|${s.name}|${slot}`;
        const cell = document.createElement("label");
        cell.className = "pslot";
        cell.innerHTML = `<input type="file" accept="image/*" hidden><span class="pimg">＋</span><span class="plabel">${slot}</span><span class="pstate"></span>`;
        const inp = cell.querySelector("input");
        inp.onchange = async () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            if (!dr.startedAt) { dr.startedAt = Date.now(); dr.touched = true; saveDrafts(); }
            // カメラで撮った写真には撮影日時が入らないので、撮った時刻を書き込んでから残す（exif.js）
            const blob = await stampTakenAt(f, new Date(f.lastModified || Date.now()));
            await photoPut(k, { workDay, store: s.name, slot, blob, name: f.name || "photo.jpg", type: "image/jpeg", sent: false, at: Date.now() });
            render();
            flushPhotos();
        };
        photoGet(k).then((rec) => {
            if (!rec) return;
            const url = URL.createObjectURL(rec.blob);
            cell.querySelector(".pimg").outerHTML = `<img class="pimg" src="${url}" alt="">`;
            const st = cell.querySelector(".pstate");
            st.textContent = rec.sent ? "✓ 保存済み" : rec.state || "⏳ 未送信";
            st.className = "pstate " + (rec.sent ? "ok" : "wait");
        }).catch(() => { });
        grid.appendChild(cell);
    }
    return box;
}

// ---- 発注したい物 ---------------------------------------------------------------
function toggleCart(storeName, name) {
    const i = cart.findIndex((c) => c.store === storeName && c.name === name);
    if (i >= 0) cart.splice(i, 1);
    else cart.push({ store: storeName, name, qty: "1" });
    store.set("cart", cart);
    render();
}

function renderCart() {
    $("cartBox").hidden = !cart.length;
    const el = $("cart");
    el.innerHTML = "";
    cart.forEach((c, i) => {
        const row = document.createElement("div");
        row.className = "cartRow";
        row.innerHTML = `<span>${c.name}<br><small>${short(c.store)}</small></span>
            <input type="text" inputmode="decimal" value="${c.qty}">
            <button type="button" title="外す">✕</button>`;
        row.querySelector("input").oninput = (e) => { c.qty = e.target.value; store.set("cart", cart); };
        row.querySelector("button").onclick = () => { cart.splice(i, 1); store.set("cart", cart); render(); };
        el.appendChild(row);
    });
}

$("sendOrder").onclick = async () => {
    const btn = $("sendOrder");
    btn.disabled = true;
    try {
        const byStore = {};
        cart.forEach((c) => (byStore[c.store] = byStore[c.store] || []).push({ name: c.name, qty: norm(c.qty) }));
        for (const [st, items] of Object.entries(byStore)) await api("order", { store: st, items });
        alert(`発注依頼を ${cart.length}件 送りました。PC の拡張機能で資材発注に入力してください。`);
        cart = [];
        store.set("cart", cart);
    } catch (e) {
        alert("発注依頼を送れませんでした: " + e.message + "\n（一覧はそのまま残っています）");
    } finally {
        btn.disabled = false;
        render();
    }
};

// ---- 設定・はじめ ------------------------------------------------------------------
function render() {
    renderStores();
    renderForm();
    renderCart();
}

$("settingsBtn").onclick = () => { $("settings").hidden = !$("settings").hidden; $("token").value = token; };
$("saveToken").onclick = () => {
    token = $("token").value.trim();
    store.set("token", token);
    $("settings").hidden = true;
    loadInventory();
    flush();
};
$("workDay").value = workDay.replace(/\//g, "-");
$("workDay").onchange = (e) => {
    if (!e.target.value) return;
    workDay = e.target.value.replace(/-/g, "/");
    const route = ROUTES[routeOf(workDay)];
    if (!route.includes(current)) current = route[0];
    render();
};

window.addEventListener("online", () => { flush(); flushPhotos(); });
if (!ROUTES[routeOf(workDay)].includes(current)) current = ROUTES[routeOf(workDay)][0];
render();
if (!token) { $("settings").hidden = false; setNet("はじめに右上の ⚙ で合言葉を入れてください", true); }
else { loadInventory(); flush(); flushPhotos(); prunePhotos(); }
