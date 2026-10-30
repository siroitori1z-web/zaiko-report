// 写真に撮影日時（EXIF の DateTimeOriginal）が無ければ書き込む。
// iPhone のブラウザのカメラで撮った写真は撮影日時が入らないため。向きなど元の EXIF はそのまま残す。
// 使い方: const blob = await stampTakenAt(file, new Date(file.lastModified));

const EXIF_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const SUB_IFD = { 0x8769: "exif", 0x8825: "gps", 0xa005: "interop" };

function exifDateString(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// JPEG の中の EXIF（APP1）を探す → { start, end, tiff }（無ければ null）
function findExifSegment(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 < buf.length && buf[p] === 0xff) {
        const marker = buf[p + 1], len = (buf[p + 2] << 8) | buf[p + 3];
        if (marker === 0xda) break; // 画像データの始まり
        if (marker === 0xe1 && buf[p + 4] === 0x45 && buf[p + 5] === 0x78 && buf[p + 6] === 0x69 && buf[p + 7] === 0x66) {
            return { start: p, end: p + 2 + len, tiff: buf.subarray(p + 10, p + 2 + len) };
        }
        p += 2 + len;
    }
    return null;
}

// TIFF の IFD を読む → { tag: { type, count, bytes } }。サブ IFD は再帰で読む
function readIfd(t, le, off, depth = 0) {
    const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
    const out = { entries: {}, subs: {} };
    if (off + 2 > t.length) return out;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        if (e + 12 > t.length) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        const size = (EXIF_TYPE_SIZE[type] || 1) * count;
        if (SUB_IFD[tag]) {
            if (depth < 2) out.subs[SUB_IFD[tag]] = readIfd(t, le, u32(e + 8), depth + 1);
            continue;
        }
        const at = size <= 4 ? e + 8 : u32(e + 8);
        if (at + size > t.length) continue;
        out.entries[tag] = { type, count, bytes: t.slice(at, at + size) };
    }
    return out;
}

// IFD を書く。子の IFD（exif/gps/interop）は親のあとに並べ、ポインタをつなぐ
function writeTiff(ifd0, le) {
    const ascii = (s) => { const b = new Uint8Array(s.length + 1); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
    const blocks = []; // { ifd, pointerTag, parent }
    const order = (ifd, tagOfParent, parent) => {
        const block = { ifd, tagOfParent, parent };
        blocks.push(block);
        for (const [name, tag] of [["exif", 0x8769], ["gps", 0x8825], ["interop", 0xa005]]) if (ifd.subs && ifd.subs[name]) order(ifd.subs[name], tag, block);
    };
    order(ifd0, 0, null);
    // 大きさを測って、場所を決める
    const sizeOf = (b) => {
        const tags = Object.keys(b.ifd.entries).length + blocks.filter((c) => c.parent === b).length;
        let data = 0;
        for (const e of Object.values(b.ifd.entries)) if (e.bytes.length > 4) data += e.bytes.length + (e.bytes.length & 1);
        return 2 + tags * 12 + 4 + data;
    };
    let pos = 8;
    for (const b of blocks) { b.off = pos; pos += sizeOf(b); }
    const out = new Uint8Array(pos);
    const v = new DataView(out.buffer);
    out.set(le ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42]);
    v.setUint32(4, 8, le);
    for (const b of blocks) {
        const list = Object.entries(b.ifd.entries).map(([tag, e]) => ({ tag: +tag, ...e }));
        for (const c of blocks.filter((x) => x.parent === b)) list.push({ tag: c.tagOfParent, type: 4, count: 1, ptr: c.off });
        list.sort((a, c) => a.tag - c.tag);
        v.setUint16(b.off, list.length, le);
        let data = b.off + 2 + list.length * 12 + 4;
        list.forEach((e, i) => {
            const at = b.off + 2 + i * 12;
            v.setUint16(at, e.tag, le);
            v.setUint16(at + 2, e.type, le);
            v.setUint32(at + 4, e.count, le);
            if (e.ptr != null) v.setUint32(at + 8, e.ptr, le);
            else if (e.bytes.length <= 4) out.set(e.bytes, at + 8);
            else { v.setUint32(at + 8, data, le); out.set(e.bytes, data); data += e.bytes.length + (e.bytes.length & 1); }
        });
        v.setUint32(b.off + 2 + list.length * 12, 0, le); // 次の IFD なし（縮小画像は付けない）
    }
    return { out, ascii };
}

async function stampTakenAt(file, when) {
    try {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf[0] !== 0xff || buf[1] !== 0xd8) return file; // JPEG でなければそのまま
        const seg = findExifSegment(buf);
        let le = false, ifd0 = { entries: {}, subs: {} };
        if (seg) {
            le = seg.tiff[0] === 0x49;
            const tv = new DataView(seg.tiff.buffer, seg.tiff.byteOffset, seg.tiff.byteLength);
            ifd0 = readIfd(seg.tiff, le, tv.getUint32(4, le));
        }
        ifd0.subs.exif = ifd0.subs.exif || { entries: {}, subs: {} };
        if (ifd0.subs.exif.entries[0x9003]) return file; // もう撮影日時がある
        const s = exifDateString(when);
        const enc = (str) => { const b = new Uint8Array(str.length + 1); for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i); return b; };
        const dt = { type: 2, count: s.length + 1, bytes: enc(s) };
        ifd0.entries[0x0132] = dt;              // DateTime
        ifd0.subs.exif.entries[0x9003] = dt;    // DateTimeOriginal（撮影日時）
        ifd0.subs.exif.entries[0x9004] = dt;    // DateTimeDigitized
        const { out: tiff } = writeTiff(ifd0, le);
        const len = 2 + 6 + tiff.length;
        if (len > 0xffff) return file;
        const app1 = new Uint8Array(2 + len);
        app1.set([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
        app1.set(tiff, 10);
        // SOI → 新しい EXIF → 元の EXIF を除いた残り
        const rest = seg ? [buf.subarray(2, seg.start), buf.subarray(seg.end)] : [buf.subarray(2)];
        return new Blob([buf.subarray(0, 2), app1, ...rest], { type: "image/jpeg" });
    } catch {
        return file; // 書けなかったら元のまま送る
    }
}
