'use strict';
const $ = id => document.getElementById(id);
const FPS = 30;
const items = [];            // {id, file, url, on}
let uid = 0, dragId = null, busy = false;

/* ═════════ 画像リスト ═════════ */
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif|tiff?)$/i;
/* ZIP読み込み（外部ライブラリ不要：ブラウザ標準の DecompressionStream を使用） */
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff' };
async function unzipImages(file) {
  const buf = await file.arrayBuffer(), dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIPとして読めませんでした');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nb = u8.subarray(p + 46, p + 46 + nl);
    let name;
    if (flag & 0x800) name = new TextDecoder('utf-8').decode(nb);
    else { try { name = new TextDecoder('utf-8', { fatal: true }).decode(nb); } catch { name = new TextDecoder('shift_jis').decode(nb); } }
    p += 46 + nl + xl + cl;
    const base = name.split('/').pop();
    if (!base || name.endsWith('/') || name.startsWith('__MACOSX') || base.startsWith('._') || !IMG_RE.test(base)) continue;
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u8.subarray(ds, ds + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push(new File([data], base, { type: MIME[base.split('.').pop().toLowerCase()] || '' }));
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  return out;
}
async function addFiles(files) {
  let list = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
      try { const z = await unzipImages(f); list.push(...z); toast(`${f.name}：画像 ${z.length} 枚を取り出しました`); }
      catch (e) { toast(`${f.name} を読み込めませんでした：${e.message}`); }
    } else if (f.type.startsWith('image/') || IMG_RE.test(f.name)) list.push(f);
  }
  if (!list.length) return;
  if ($('resetOnLoad').checked) { items.forEach(i => URL.revokeObjectURL(i.url)); items.length = 0; $('result').hidden = true; }
  for (const f of list) items.push({ id: ++uid, file: f, url: URL.createObjectURL(f), on: true });
  itemsChanged();
}
function renderThumbs() {
  const box = $('thumbs'); box.textContent = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 't' + (it.on ? ' on' : ''); d.draggable = true; d.dataset.id = it.id; d.title = it.file.name;
    d.innerHTML = '<img alt=""><div class="fn"></div><div class="n"></div><div class="ctl"><button data-a="l">◀</button><button data-a="x">✕</button><button data-a="r">▶</button></div>';
    d.querySelector('img').src = it.url; d.querySelector('.fn').textContent = castBase(it.file); d.querySelector('.n').textContent = i + 1;
    box.appendChild(d);
  });
  $('count').textContent = `${items.length} 枚（使用 ${items.filter(i => i.on).length} 枚）`;
  estimate();
}
function itemsChanged() { renderThumbs(); syncCasts(); renderCasts(); generate(); }
function moveItem(i, j) { if (j < 0 || j >= items.length) return; items.splice(j, 0, items.splice(i, 1)[0]); itemsChanged(); }
function removeItem(i) { URL.revokeObjectURL(items[i].url); items.splice(i, 1); itemsChanged(); }

$('thumbs').addEventListener('click', e => {
  const t = e.target.closest('.t'); if (!t) return;
  const i = items.findIndex(x => x.id == t.dataset.id), a = e.target.dataset.a;
  if (a === 'l') moveItem(i, i - 1); else if (a === 'r') moveItem(i, i + 1);
  else if (a === 'x') removeItem(i);
  else { items[i].on = !items[i].on; itemsChanged(); }
});
$('thumbs').addEventListener('dragstart', e => {
  const t = e.target.closest('.t'); if (!t) return;
  dragId = t.dataset.id; t.classList.add('drag'); e.dataTransfer.setData('text/plain', 'x');
});
$('thumbs').addEventListener('dragover', e => {
  if (dragId == null) return; e.preventDefault();
  document.querySelectorAll('.t.ov').forEach(x => x.classList.remove('ov'));
  e.target.closest('.t')?.classList.add('ov');
});
$('thumbs').addEventListener('drop', e => {
  if (dragId == null) return; e.preventDefault(); e.stopPropagation();
  const t = e.target.closest('.t');
  if (t) moveItem(items.findIndex(x => x.id == dragId), items.findIndex(x => x.id == t.dataset.id));
  dragId = null; itemsChanged();
});
$('thumbs').addEventListener('dragend', () => { dragId = null; renderThumbs(); });
$('pick').onclick = () => $('file').click();
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
const drop = $('drop');
['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { if (dragId == null) { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach(n => drop.addEventListener(n, () => drop.classList.remove('over')));
drop.addEventListener('drop', e => { if (dragId == null) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (dragId == null && !e.target.closest('#drop')) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
$('selAll').onclick = () => { items.forEach(i => i.on = true); itemsChanged(); };
$('selNone').onclick = () => { items.forEach(i => i.on = false); itemsChanged(); };
$('sortName').onclick = () => { items.sort((a, b) => a.file.name.localeCompare(b.file.name, 'ja', { numeric: true })); itemsChanged(); };
$('clear').onclick = () => { items.forEach(i => URL.revokeObjectURL(i.url)); items.length = 0; itemsChanged(); };

/* ═════════ 動画の設定 ═════════ */
$('preset').onchange = () => { const v = $('preset').value; if (v !== 'custom') [$('vw').value, $('vh').value] = v.split('x'); };
$('vw').oninput = $('vh').oninput = () => {
  const k = `${$('vw').value}x${$('vh').value}`;
  $('preset').value = [...$('preset').options].some(o => o.value === k) ? k : 'custom';
};
function estimate() {
  const n = items.filter(i => i.on).length, d = +$('disp').value, f = +$('fade').value;
  $('dispV').textContent = d + ' 秒'; $('fadeV').textContent = f + ' 秒';
  $('estimate').textContent = n ? `動画の長さ：約 ${(n * d + Math.max(0, n - 1) * f).toFixed(1)} 秒（${n} 枚）` : '';
}
$('disp').oninput = $('fade').oninput = estimate;

/* ═════════ 描画 ═════════ */
function drawFit(ctx, bmp, W, H, dx = 0, dy = 0, alpha = 1) {
  const s = Math.min(W / bmp.width, H / bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  ctx.globalAlpha = alpha;
  ctx.drawImage(bmp, dx + Math.round((W - w) / 2), dy + Math.round((H - h) / 2), w, h);
  ctx.globalAlpha = 1;
}
function renderAt(ctx, bmps, W, H, disp, fade, mode, t) {
  const n = bmps.length, step = disp + fade;
  const i = Math.min(n - 1, Math.floor(t / step)), local = t - i * step;
  ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, W, H);
  if (local < disp || i === n - 1 || fade <= 0) { drawFit(ctx, bmps[i], W, H); return; }
  const p = Math.min(1, (local - disp) / fade), cur = bmps[i], nxt = bmps[i + 1];
  switch (mode) {
    case 'フェードアウト→イン':
      if (p < .5) drawFit(ctx, cur, W, H, 0, 0, 1 - p * 2); else drawFit(ctx, nxt, W, H, 0, 0, (p - .5) * 2); break;
    case '左スライド': { const x = Math.round(W * p); drawFit(ctx, cur, W, H, -x, 0); drawFit(ctx, nxt, W, H, W - x, 0); break; }
    case '右スライド': { const x = Math.round(W * p); drawFit(ctx, cur, W, H, x, 0); drawFit(ctx, nxt, W, H, x - W, 0); break; }
    case '上スライド': { const y = Math.round(H * p); drawFit(ctx, cur, W, H, 0, -y); drawFit(ctx, nxt, W, H, 0, H - y); break; }
    default: drawFit(ctx, cur, W, H); drawFit(ctx, nxt, W, H, 0, 0, p);
  }
}

/* ═════════ 書き出し ═════════ */
const status = m => $('status').textContent = m;
const progress = v => { $('bar').hidden = false; $('bar').value = v; };
const tick = () => new Promise(r => setTimeout(r, 0));
function avcCodecs(W, H) {
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16);
  const lvl = mbs <= 8192 ? '28' : mbs <= 22080 ? '32' : mbs <= 36864 ? '33' : '34';
  return ['avc1.6400' + lvl, 'avc1.4d00' + lvl, 'avc1.4200' + lvl];
}
async function encodeMp4(bmps, W, H, disp, fade, mode) {
  const bitrate = Math.round(Math.min(40e6, Math.max(4e6, W * H * FPS * 0.15)));
  let codec = null;
  for (const c of avcCodecs(W, H)) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: FPS })).supported) { codec = c; break; } } catch {}
  }
  if (!codec) throw new Error('この環境ではH.264エンコードに対応していません');
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
  let err = null;
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => err = e });
  enc.configure({ codec, width: W, height: H, bitrate, framerate: FPS, avc: { format: 'avc' } });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const total = bmps.length * disp + Math.max(0, bmps.length - 1) * fade;
  const frames = Math.max(1, Math.round(total * FPS));
  for (let k = 0; k < frames; k++) {
    if (err) throw err;
    renderAt(ctx, bmps, W, H, disp, fade, mode, Math.min(total - 1e-6, k / FPS));
    const vf = new VideoFrame(cv, { timestamp: Math.round(k * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: k % (FPS * 2) === 0 }); vf.close();
    while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
    if (k % 10 === 0) { progress(Math.round(k / frames * 97)); status(`エンコード中… ${k + 1}/${frames} フレーム`); await tick(); }
  }
  await enc.flush(); if (err) throw err;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
}
async function recordFallback(bmps, W, H, disp, fade, mode) {
  if (!window.MediaRecorder) throw new Error('このブラウザは動画の書き出しに対応していません');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(cv.captureStream(FPS), { mimeType: mime || undefined, videoBitsPerSecond: 8e6 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);
  const total = bmps.length * disp + Math.max(0, bmps.length - 1) * fade;
  renderAt(ctx, bmps, W, H, disp, fade, mode, 0);
  rec.start(); const t0 = performance.now();
  await new Promise(res => {
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) return res();
      renderAt(ctx, bmps, W, H, disp, fade, mode, t);
      progress(Math.round(t / total * 97)); status(`録画中… ${t.toFixed(1)} / ${total.toFixed(1)} 秒`);
      requestAnimationFrame(loop);
    };
    loop();
  });
  renderAt(ctx, bmps, W, H, disp, fade, mode, total - 1e-6);
  await new Promise(r => setTimeout(r, 200)); rec.stop(); await done;
  const type = rec.mimeType || mime || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
$('go').onclick = async () => {
  if (busy) return;
  const sel = items.filter(i => i.on);
  if (!sel.length) return alert('画像が選択されていません。');
  let W = parseInt($('vw').value), H = parseInt($('vh').value);
  if (!(W >= 64 && H >= 64)) return alert('幅・高さに正しい数値を入力してください。');
  W -= W % 2; H -= H % 2;
  const disp = +$('disp').value, fade = +$('fade').value, mode = $('trans').value;
  busy = true; $('go').disabled = true; $('go').textContent = '⏳ 生成中...'; $('result').hidden = true;
  const bmps = [];
  try {
    for (let i = 0; i < sel.length; i++) {
      status(`画像を読み込み中 (${i + 1}/${sel.length}): ${sel[i].file.name}`); progress(0); await tick();
      try { bmps.push(await createImageBitmap(sel[i].file)); } catch { status(`⚠ スキップ: ${sel[i].file.name}`); }
    }
    if (!bmps.length) throw new Error('読み込める画像がありませんでした');
    let out;
    if (window.VideoEncoder && window.VideoFrame && window.Mp4Muxer) {
      try { out = await encodeMp4(bmps, W, H, disp, fade, mode); }
      catch (e) { console.warn(e); status('H.264エンコードに失敗。録画方式に切り替えます…'); out = await recordFallback(bmps, W, H, disp, fade, mode); }
    } else out = await recordFallback(bmps, W, H, disp, fade, mode);
    const name = ($('fname').value.trim() || 'slideshow').replace(/[\\/:*?"<>|]/g, '_') + '.' + out.ext;
    const url = URL.createObjectURL(out.blob);
    $('video').src = url; $('dl').href = url; $('dl').download = name; $('result').hidden = false;
    progress(100); status(`✅ 完了 → ${name}（${(out.blob.size / 1048576).toFixed(1)} MB${out.ext === 'webm' ? '・WebM形式' : ''}）`);
  } catch (e) { console.error(e); status('❌ ' + (e.message || e)); }
  finally { bmps.forEach(b => b.close && b.close()); busy = false; $('go').disabled = false; $('go').textContent = '▶ 動画を生成する'; }
};

/* ═════════ 出勤ツイート ═════════ */
const KEY = 'slideshow_tweet_v1';
const MARK = '・';   // キャストの先頭記号の初期値
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const BLOCK_DEFS = [
  { key: 'title', label: '見出し（1行目）', group: 1, multi: false, text: '💛 {店名} 本日もオープン！！' },
  { key: 'dateLine', label: '日付の行', group: 2, multi: false, text: '本日{日付}も元気に営業しております！' },
  { key: 'castHead', label: 'キャスト一覧の見出し', group: 2, multi: false, text: '🌟 本日の出勤キャスト 🌟' },
  { key: 'closing', label: '締めの文章（複数行OK）', group: 4, multi: true, text: '本日は個性豊かな{人数}名のキャストで、皆さまをお迎えいたします🎀\n初めての方も、お一人様も大歓迎！\nお気に入りのキャストと一緒に、楽しいひとときを過ごしませんか？🥰\n皆さまのご来店、心よりお待ちしております！💕' },
  { key: 'tags', label: 'ハッシュタグ', group: 4, multi: false, text: '#コンカフェ #コンセプトカフェ' },
];
const CSV_NAMES = { title: '見出し', dateLine: '日付の行', castHead: 'キャスト見出し', closing: '締めの文章', tags: 'ハッシュタグ' };
const DEFAULT_SHOP = 'コンカフェ';
const defaultBlocks = () => Object.fromEntries(BLOCK_DEFS.map(d => [d.key, { on: true, text: d.text }]));

let storageOK = true;
let state = loadState();
function loadState() {
  const b = { shopName: DEFAULT_SHOP, suffix: '', sync: true, autoWords: true, casts: [], profiles: {}, blocks: defaultBlocks(), tweetOn: true };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) {
      b.shopName = String(s.shopName ?? b.shopName); b.suffix = String(s.suffix ?? ''); b.sync = s.sync !== false;
      b.autoWords = s.autoWords !== false; b.tweetOn = s.tweetOn !== false; b.profiles = s.profiles || {};
      b.casts = (s.casts || []).map(c => ({ name: String(c.name ?? ''), handle: String(c.handle ?? ''), emoji: String(c.emoji ?? ''), on: c.on !== false }));
      BLOCK_DEFS.forEach(d => { const sb = s.blocks && s.blocks[d.key]; if (sb) b.blocks[d.key] = { on: sb.on !== false, text: String(sb.text ?? d.text) }; });
    }
  } catch { storageOK = false; }
  return b;
}
function saveState() {
  try {
    const manual = state.casts.filter(c => !c.id).map(({ name, handle, emoji, on }) => ({ name, handle, emoji, on }));
    localStorage.setItem(KEY, JSON.stringify({ ...state, casts: manual })); storageOK = true;
  } catch { storageOK = false; }
  $('saveState').textContent = storageOK ? '💾 自動保存中（このブラウザに保存）' : '⚠ 保存できない環境です（閉じると内容が消えます）';
  $('saveState').className = storageOK ? '' : 'bad';
}
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return `${m}/${d}(${WD[new Date(y, m - 1, d).getDay()]})`; };
const currentDate = () => $('autoDate').checked ? todayStr() : ($('dateInput').value || todayStr());
const castBase = f => f.name.replace(/\.[^.]+$/, '');

/* 画像 → キャスト連動 */
function syncCasts() {
  if (!state.sync) return;
  const manual = state.casts.filter(c => !c.id);
  const old = new Map(state.casts.filter(c => c.id).map(c => [c.id, c]));
  const linked = items.map((it, i) => {
    let c = old.get(it.id);
    if (!c) {
      const nm = castBase(it.file), p = state.profiles[nm] || {};
      c = { id: it.id, name: nm, emoji: p.emoji || MARK, handle: p.handle || '', on: true, nameEdited: false };
    }
    if (!c.nameEdited) c.name = castBase(it.file);
    c.on = it.on; return c;
  });
  state.casts = linked.concat(manual);
}
function rememberProfile(c) { if (c.name.trim()) state.profiles[c.name.trim()] = { emoji: c.emoji, handle: c.handle }; }

function renderCasts() {
  const box = $('castList'); box.innerHTML = '';
  if (!state.casts.length) box.innerHTML = '<p class="hint">キャストがいません。上の画像を入れるか、「＋キャストを追加」・CSVで追加してください。</p>';
  state.casts.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'cast' + (c.on ? '' : ' off');
    const chk = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.on, title: '出勤' });
    chk.onchange = () => {
      c.on = chk.checked; row.classList.toggle('off', !c.on);
      const it = c.id && items.find(x => x.id === c.id); if (it) { it.on = c.on; renderThumbs(); }
      changed();
    };
    const em = Object.assign(document.createElement('input'), { type: 'text', className: 'emoji', value: c.emoji, title: '絵文字' });
    em.oninput = () => { c.emoji = em.value; rememberProfile(c); changed(); };
    const nm = Object.assign(document.createElement('input'), { type: 'text', value: c.name, placeholder: '名前' });
    nm.oninput = () => { c.name = nm.value; c.nameEdited = true; changed(); };
    const hd = Object.assign(document.createElement('input'), { type: 'text', value: c.handle, placeholder: 'Xアカウント（任意）', className: 'hd' });
    hd.oninput = () => { c.handle = hd.value; rememberProfile(c); changed(); };
    const ctrl = document.createElement('div'); ctrl.className = 'ctrl';
    if (c.id) {
      ctrl.append(Object.assign(document.createElement('span'), { className: 'lk', textContent: '🖼連動' }));
    } else {
      ctrl.append(mk('↑', () => moveCast(i, -1)), mk('↓', () => moveCast(i, 1)),
        mk('✕', () => { if (confirm(`「${c.name || 'このキャスト'}」を削除しますか？`)) { state.casts.splice(i, 1); renderCasts(); changed(); } }, 'del'));
    }
    row.append(chk, em, nm, hd, ctrl); box.appendChild(row);
  });
}
function mk(label, fn, cls = '') { const b = document.createElement('button'); b.textContent = label; b.className = 'sm ' + cls; b.onclick = fn; return b; }
function moveCast(i, d) {
  const manualIdx = state.casts.map((c, k) => c.id ? -1 : k).filter(k => k >= 0);
  const p = manualIdx.indexOf(i), q = p + d; if (q < 0 || q >= manualIdx.length) return;
  const j = manualIdx[q]; [state.casts[i], state.casts[j]] = [state.casts[j], state.casts[i]]; renderCasts(); changed();
}
$('sync').onchange = () => {
  state.sync = $('sync').checked;
  if (!state.sync) state.casts.forEach(c => { if (c.id) { c.fromImage = true; delete c.id; } });
  else { state.casts = state.casts.filter(c => !c.fromImage); syncCasts(); }
  renderCasts(); changed();
};
$('addCast').onclick = () => {
  state.casts.push({ name: '', handle: '', emoji: MARK, on: true });
  renderCasts(); changed();
  const ins = document.querySelectorAll('#castList .cast:last-child input[type=text]'); if (ins[1]) ins[1].focus();
};
$('allOn').onclick = () => { state.casts.forEach(c => c.on = true); items.forEach(i => i.on = state.sync ? true : i.on); renderThumbs(); renderCasts(); changed(); };
$('allOff').onclick = () => { state.casts.forEach(c => c.on = false); items.forEach(i => i.on = state.sync ? false : i.on); renderThumbs(); renderCasts(); changed(); };

/* 文章ブロック */
function renderBlocks() {
  const box = $('blocks'); box.innerHTML = '';
  BLOCK_DEFS.forEach(d => {
    const b = state.blocks[d.key], wrap = document.createElement('div'); wrap.className = 'block' + (b.on ? '' : ' off');
    const lab = document.createElement('label'); lab.className = 't2';
    const chk = Object.assign(document.createElement('input'), { type: 'checkbox', checked: b.on });
    chk.onchange = () => { b.on = chk.checked; wrap.classList.toggle('off', !b.on); changed(); };
    lab.append(chk, document.createTextNode(d.label));
    const f = d.multi ? document.createElement('textarea') : Object.assign(document.createElement('input'), { type: 'text' });
    f.value = b.text;
    f.oninput = () => { b.text = f.value; if (state.autoWords) { state.autoWords = false; $('autoWords').checked = false; } changed(); };
    wrap.append(lab, f); box.appendChild(wrap);
  });
}
/* おまかせ文章 */
const pick = a => a[Math.floor(Math.random() * a.length)];
function randomWords() {
  const h = new Date().getHours(), g = h < 11 ? 'おはようございます☀️' : h < 17 ? 'こんにちは😊' : 'こんばんは✨';
  const t = {
    title: pick(['💛 {店名} 本日もオープン！！', '✨ {店名} 営業中です！', '🎀 {店名} 本日オープンしました！', '🌸 {店名} 本日も元気に営業中！']),
    dateLine: pick(['本日{日付}も元気に営業しております！', g + ' 本日{日付}は営業しております😻', '{日付} 本日もお待ちしております🥰', g + ' {日付}の出勤をお知らせします！']),
    castHead: pick(['🌟 本日の出勤キャスト 🌟', '🌸 本日の出勤キャストさん 🌸', '✨ 本日出勤のキャストはこちら ✨', '💖 本日の出勤メンバー 💖']),
    closing: pick([
      '本日は個性豊かな{人数}名のキャストで、皆さまをお迎えいたします🎀\n初めての方も、お一人様も大歓迎！\n皆さまのご来店、心よりお待ちしております！💕',
      '{人数}名のキャストがお待ちしております😊\nお仕事帰りにふらっとお立ち寄りください✨\nご来店お待ちしております💕',
      '初めての方もお気軽にどうぞ🥰\nお気に入りのキャストと楽しいひとときを過ごしませんか？\n本日も{人数}名でお待ちしております🎀',
    ]),
  };
  Object.keys(t).forEach(k => state.blocks[k] = { on: state.blocks[k].on, text: t[k] });
}
$('dice').onclick = () => { randomWords(); renderBlocks(); changed(); };
$('autoWords').onchange = () => { state.autoWords = $('autoWords').checked; if (state.autoWords) { randomWords(); renderBlocks(); } changed(); };
$('resetBlocks').onclick = () => {
  if (!confirm('文章を初期状態に戻しますか？（キャストはそのままです）')) return;
  state.blocks = defaultBlocks(); state.shopName = DEFAULT_SHOP; state.suffix = ''; state.autoWords = false;
  $('shopName').value = DEFAULT_SHOP; $('suffix').value = ''; $('autoWords').checked = false; renderBlocks(); changed();
};
$('shopName').oninput = () => { state.shopName = $('shopName').value; changed(); };
$('suffix').oninput = () => { state.suffix = $('suffix').value; changed(); };

/* 生成 */
function generate() {
  const active = state.casts.filter(c => c.on && c.name.trim());
  const suf = state.suffix.trim();
  const castLines = active.map(c => {
    const h = c.handle.trim().replace(/^@/, '');
    return `${c.emoji ? c.emoji + ' ' : ''}${c.name.trim()}${suf ? '　' + suf : ''}${h ? `（@${h}）` : ''}`;
  }).join('\n');
  const fill = s => s.replaceAll('{店名}', state.shopName.trim()).replaceAll('{日付}', fmtDate(currentDate())).replaceAll('{人数}', String(active.length));
  const groups = {};
  BLOCK_DEFS.forEach(d => { const b = state.blocks[d.key]; if (b.on && b.text.trim()) (groups[d.group] ||= []).push(fill(b.text)); });
  const parts = [];
  [1, 2].forEach(g => { if (groups[g]) parts.push(groups[g].join('\n')); });
  if (castLines) parts.push(castLines);
  if (groups[4]) parts.push(groups[4].join('\n'));
  $('out').value = parts.join('\n\n');
  $('castSummary').textContent = `出勤 ${active.length} / 全${state.casts.length}名`;
  updateCount();
}
function weighted(s) {
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
  return n;
}
function updateCount() {
  const w = weighted($('out').value), el = $('tcount');
  el.textContent = `文字数: ${w} / 280（Xの数え方・日本語は1文字=2）` + (w > 280 ? '　⚠ 超過。無料アカウントは投稿できません' : '');
  el.classList.toggle('over', w > 280);
}
function changed() { saveState(); generate(); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }

/* 日付 */
function refreshDateHint() { $('dateHint').textContent = `ツイートに入る日付：${fmtDate(currentDate())}` + ($('autoDate').checked ? '（PCの日付に合わせて自動で変わります）' : '（手動指定中）'); }
$('autoDate').onchange = () => { $('dateInput').disabled = $('autoDate').checked; if (!$('autoDate').checked && !$('dateInput').value) $('dateInput').value = todayStr(); refreshDateHint(); generate(); };
$('dateInput').onchange = () => { refreshDateHint(); generate(); };
let lastDay = todayStr();
setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); refreshDateHint(); generate(); } }, 30000);

/* 結果 */
$('out').oninput = updateCount;
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('out').value); } catch { $('out').select(); document.execCommand('copy'); } toast('コピーしました'); };
$('post').onclick = () => window.open('https://x.com/intent/post?text=' + encodeURIComponent($('out').value), '_blank');

/* CSV（前作の shukkin_settings.csv と互換） */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const csvEsc = s => { s = String(s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const parseOn = v => { const s = String(v ?? '').trim().toLowerCase(); return s === '' || !['0', 'false', '×', 'x', 'no', 'off', 'いいえ', '休', '休み', 'なし'].includes(s); };
function castsFromSimpleCSV(rows, start) {
  const first = rows[0].map(x => x.trim().toLowerCase());
  const header = first.some(x => ['名前', 'name', 'なまえ', 'キャスト', '絵文字', 'emoji', '出勤'].includes(x));
  let idx = { name: 0, emoji: 1, handle: 2, on: 3 };
  if (header) {
    rows = rows.slice(1);
    const find = (...n) => first.findIndex(x => n.includes(x)), nn = find('名前', 'name', 'なまえ', 'キャスト');
    idx = { name: nn >= 0 ? nn : 0, emoji: find('絵文字', 'emoji'), handle: find('xアカウント', 'x', 'アカウント', 'handle', 'twitter', 'id'), on: find('出勤', 'on', '表示') };
  }
  const get = (r, i) => (i >= 0 && i < r.length) ? r[i].trim() : '', out = [];
  rows.forEach(r => { const name = get(r, idx.name); if (name) out.push({ name, emoji: get(r, idx.emoji) || MARK, handle: get(r, idx.handle).replace(/^@/, ''), on: parseOn(get(r, idx.on)) }); });
  return out;
}
$('csvImport').onclick = () => $('csvFile').click();
$('csvFile').onchange = async ev => {
  const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
  try {
    const buf = await file.arrayBuffer(); let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('shift_jis').decode(buf); }
    const replace = $('csvMode').value === 'replace', rows = parseCSV(text);
    const base = replace ? 0 : state.casts.length;
    const isNew = rows.length > 0 && (rows[0][0].trim() === '種別' || rows.some(r => ['設定', 'キャスト'].includes((r[0] || '').trim())));
    let imported = [], nSet = 0;
    if (isNew) {
      (rows[0][0].trim() === '種別' ? rows.slice(1) : rows).forEach(r => {
        const kind = (r[0] || '').trim(), a = (r[1] || '').trim(), b = r[2] ?? '', c = (r[3] || '').trim(), d = r[4] ?? '';
        if (kind === '設定') {
          if (a === '店名') { state.shopName = b; nSet++; }
          else if (a === '敬称') { state.suffix = b; nSet++; }
          else { const def = BLOCK_DEFS.find(x => CSV_NAMES[x.key] === a); if (def) { state.blocks[def.key] = { on: parseOn(d), text: b }; nSet++; } }
        } else if (kind === 'キャスト' && a) imported.push({ name: a, emoji: b.trim() || MARK, handle: c.replace(/^@/, ''), on: parseOn(d) });
      });
    } else if (rows.length) imported = castsFromSimpleCSV(rows, base);
    if (!imported.length && !nSet) return toast('読み込める行がありませんでした');
    if (nSet) { state.autoWords = false; $('autoWords').checked = false; }
    if (imported.length) {
      imported.forEach(rememberProfile);
      // CSVのキャストは「手動キャスト」として扱う。連動を切って置き換え/追加
      state.sync = false; $('sync').checked = false; state.casts.forEach(c => { delete c.id; delete c.fromImage; });
      if (!replace) { /* 追加：既存はそのまま残す */ }
      state.casts = replace ? imported : state.casts.concat(imported);
    }
    $('shopName').value = state.shopName; $('suffix').value = state.suffix;
    renderCasts(); renderBlocks(); changed();
    toast(`読み込みました：キャスト${imported.length}名` + (nSet ? ` / 設定${nSet}件` : '') + (imported.length ? '（画像との連動はOFFにしました）' : ''));
  } catch { toast('CSVの読み込みに失敗しました'); }
};
$('csvExport').onclick = () => {
  const L = ['種別,名前/項目,絵文字/内容,Xアカウント,出勤/表示'];
  L.push(['設定', '店名', state.shopName, '', 1].map(csvEsc).join(','));
  L.push(['設定', '敬称', state.suffix, '', 1].map(csvEsc).join(','));
  BLOCK_DEFS.forEach(d => { const b = state.blocks[d.key]; L.push(['設定', CSV_NAMES[d.key], b.text, '', b.on ? 1 : 0].map(csvEsc).join(',')); });
  state.casts.forEach(c => L.push(['キャスト', c.name, c.emoji, c.handle, c.on ? 1 : 0].map(csvEsc).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  a.download = 'shukkin_settings.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('shukkin_settings.csv に保存しました');
};

/* ツイート ON/OFF */
$('tweetOn').onchange = () => { $('tweetMain').hidden = !$('tweetOn').checked; state.tweetOn = $('tweetOn').checked; saveState(); };

/* 初期化 */
$('shopName').value = state.shopName; $('suffix').value = state.suffix;
$('sync').checked = state.sync; $('autoWords').checked = state.autoWords;
$('tweetOn').checked = state.tweetOn; $('tweetMain').hidden = !state.tweetOn;
$('dateInput').value = todayStr();
if (state.autoWords) randomWords();
renderThumbs(); syncCasts(); renderCasts(); renderBlocks(); refreshDateHint(); generate(); saveState();
