// プロテイン在庫報告（現場用）v2
// 店舗を選ぶ → 補充前・補充後を入れる → 「保存して報告」1回で、スプレッドシートに報告と最新在庫が入る。
// 電波が無くても入力はスマホに残り、未送信の報告はつながった時に自動で送り直す。

const GAS_URL = "https://script.google.com/macros/s/AKfycbyAfnCDD7fOHScKvK4PyAiFTaosfDgFhix_P5azEtCJh5vcy3QmkH4JML0f8t3pfhErZg/exec";

const STORES = [
    { name: "ドン・キホーテ松原店", items: ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンクッキー", "VALXチョコ", "VALXベリー", "グロングチョコ", "グロングヨーグルト", "ザバスココア", "ザバスストロベリー", "ザバスリッチショコラ", "ザバスバナナ", "ザバスキャラメル", "ザバスヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテりんくう店", items: ["VALXチョコ", "アルプロチョコ", "グロングチョコ", "VALXピーチ", "アルプロストロベリー", "ウルトラココナッツ", "マイプロココア", "マイプロ抹茶", "マイプロレモン", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ箕面店", items: ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ茨木店", items: ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー＆クリーム", "バルクスチョコ", "バルクスベリー", "グロングチョコ", "グロングヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ枚方店", items: ["マイプロココア", "マイプロレモン", "バルクスチョコ", "バルクスピーチ", "ザバスココア", "ザバスストロベリー", "ウルトラココナッツ", "ウルトラパイン", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ京都伏見店", items: ["マイプロココア", "マイプロレモン", "アルプロンチョコ", "アルプロンイチゴ", "VALXチョコ", "VALXピーチ", "ホエイチョコ", "ホエイヨーグルト", "コップ小", "ウエットティッシュ"] },
    { name: "ドン・キホーテ西大和店", items: ["マイプロココア", "マイプロレモン", "アルプロチョコ", "アルプロクッキー", "VALXチョコ", "VALXピーチ", "ウルトラココナッツ", "ウルトラクッキー", "コップ小", "ウエットティッシュ"] },
];
// 回る順。日〜水は火ルート、木〜土は金ルート
const ROUTES = {
    火: ["ドン・キホーテ松原店", "ドン・キホーテりんくう店", "ドン・キホーテ箕面店", "ドン・キホーテ茨木店", "ドン・キホーテ枚方店", "ドン・キホーテ西大和店"],
    金: ["ドン・キホーテ松原店", "ドン・キホーテりんくう店", "ドン・キホーテ箕面店", "ドン・キホーテ京都伏見店", "ドン・キホーテ西大和店"],
};
const SUPPLIES = ["コップ小", "ウエットティッシュ"];
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
// 作業日: 夜中0〜4時は前の日の巡回
const todayWork = () => new Date(Date.now() - 4 * 3600e3);
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
        const last = inventory[name] || {};
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
    const last = inventory[s.name] || {};
    const k = keyOf(workDay, s.name);
    main.innerHTML = `<h2>${s.name}${sent[k] ? `　<span class="hint">✓ ${sent[k]} 送信済み（直して送り直せます）</span>` : ""}</h2>
        <div class="row head"><span>商品（前回）</span><span>補充前</span><span>補充後</span><span>🛒</span></div>`;
    for (const it of s.items) {
        const row = document.createElement("div");
        const low = lowOf(it, dr.after[it]);
        row.className = "row" + (SUPPLIES.includes(it) ? " supply" : "") + (low ? " low" : "");
        const inCart = cart.some((c) => c.store === s.name && c.name === it);
        row.innerHTML = `<span class="name">${it}<small>前回 ${last[it] ?? "-"}${low ? ' <span class="lowTag">少ない</span>' : ""}</small></span>
            <input type="text" inputmode="decimal" data-k="before" value="${dr.before[it] ?? ""}">
            <input type="text" inputmode="decimal" data-k="after" value="${dr.after[it] ?? ""}">
            <button type="button" class="cartBtn${inCart ? " on" : ""}" title="発注したい物に入れる">🛒</button>`;
        row.querySelectorAll("input").forEach((inp) => {
            inp.oninput = () => {
                dr[inp.dataset.k][it] = inp.value;
                dr.touched = true;
                saveDrafts();
                inp.classList.toggle("bad", inp.value !== "" && !isNum(inp.value));
                if (inp.dataset.k === "after") {
                    const l = lowOf(it, inp.value);
                    row.classList.toggle("low", l);
                    row.querySelector("small").innerHTML = `前回 ${last[it] ?? "-"}${l ? ' <span class="lowTag">少ない</span>' : ""}`;
                }
            };
            inp.onfocus = () => inp.select();
        });
        row.querySelector(".cartBtn").onclick = () => toggleCart(s.name, it);
        main.appendChild(row);
    }
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
    const rep = { workDay, store: s.name, text: reportText(s, dr), before: clean(dr.before), after: clean(dr.after) };
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

window.addEventListener("online", flush);
if (!ROUTES[routeOf(workDay)].includes(current)) current = ROUTES[routeOf(workDay)][0];
render();
if (!token) { $("settings").hidden = false; setNet("はじめに右上の ⚙ で合言葉を入れてください", true); }
else { loadInventory(); flush(); }
