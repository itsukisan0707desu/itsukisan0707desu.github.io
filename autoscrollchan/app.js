'use strict';
const FPS = 30;
const $ = id => document.getElementById(id);
const items = [];           // {id, file, url, on, bmp?}
let uid = 0, dragId = null, busy = false;

/* ───── 画像リスト ───── */
function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|bmp|avif|tiff?)$/i.test(f.name)) continue;
    items.push({ id: ++uid, file: f, url: URL.createObjectURL(f), on: true });
  }
  render();
}
function render() {
  const box = $('thumbs'); box.textContent = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 't' + (it.on ? ' on' : ''); d.draggable = true; d.dataset.id = it.id;
    d.innerHTML = '<img alt=""><div class="n"></div><div class="ctl"><button data-a="l">◀</button><button data-a="x">✕</button><button data-a="r">▶</button></div>';
    d.querySelector('img').src = it.url;
    d.querySelector('.n').textContent = i + 1;
    d.title = it.file.name;
    box.appendChild(d);
  });
  $('count').textContent = `${items.length} 枚（使用 ${items.filter(i => i.on).length} 枚）`;
  estimate();
  if (typeof syncCast === 'function') syncCast();
}
function move(i, j) {
  if (j < 0 || j >= items.length) return;
  items.splice(j, 0, items.splice(i, 1)[0]); render();
}
$('thumbs').addEventListener('click', e => {
  const t = e.target.closest('.t'); if (!t) return;
  const i = items.findIndex(x => x.id == t.dataset.id), a = e.target.dataset.a;
  if (a === 'l') move(i, i - 1);
  else if (a === 'r') move(i, i + 1);
  else if (a === 'x') { URL.revokeObjectURL(items[i].url); items.splice(i, 1); render(); }
  else { items[i].on = !items[i].on; render(); }
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
  if (t) { const i = items.findIndex(x => x.id == dragId), j = items.findIndex(x => x.id == t.dataset.id); move(i, j); }
  dragId = null; render();
});
$('thumbs').addEventListener('dragend', () => { dragId = null; render(); });

$('pick').onclick = () => $('file').click();
$('file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
const drop = $('drop');
['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { if (dragId == null) { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach(n => drop.addEventListener(n, () => drop.classList.remove('over')));
drop.addEventListener('drop', e => { if (dragId == null) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (dragId == null && e.target.closest && !e.target.closest('#drop')) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
$('selAll').onclick = () => { items.forEach(i => i.on = true); render(); };
$('selNone').onclick = () => { items.forEach(i => i.on = false); render(); };
$('sortName').onclick = () => { items.sort((a, b) => a.file.name.localeCompare(b.file.name, 'ja', { numeric: true })); render(); };
$('clear').onclick = () => { items.forEach(i => URL.revokeObjectURL(i.url)); items.length = 0; render(); };

/* ───── 設定 ───── */
$('preset').onchange = () => {
  const v = $('preset').value; if (v === 'custom') return;
  [$('vw').value, $('vh').value] = v.split('x');
};
const whChanged = () => {
  const k = `${$('vw').value}x${$('vh').value}`;
  $('preset').value = [...$('preset').options].some(o => o.value === k) ? k : 'custom';
};
$('vw').oninput = $('vh').oninput = whChanged;
function estimate() {
  const n = items.filter(i => i.on).length, d = +$('disp').value, f = +$('fade').value;
  $('dispV').textContent = d + ' 秒'; $('fadeV').textContent = f + ' 秒';
  $('estimate').textContent = n ? `動画の長さ：約 ${(n * d + Math.max(0, n - 1) * f).toFixed(1)} 秒（${n} 枚）` : '';
}
$('disp').oninput = $('fade').oninput = estimate;

/* ───── 描画 ───── */
function drawFit(ctx, bmp, W, H, dx = 0, dy = 0, alpha = 1) {
  const s = Math.min(W / bmp.width, H / bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  ctx.globalAlpha = alpha;
  ctx.drawImage(bmp, dx + Math.round((W - w) / 2), dy + Math.round((H - h) / 2), w, h);
  ctx.globalAlpha = 1;
}
function bg(ctx, W, H) { ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, W, H); }
// 時刻 t(秒) のフレームを描画
function renderAt(ctx, bmps, W, H, disp, fade, mode, t) {
  const n = bmps.length, step = disp + fade;
  let i = Math.min(n - 1, Math.floor(t / step));
  const local = t - i * step;
  bg(ctx, W, H);
  if (local < disp || i === n - 1 || fade <= 0) { drawFit(ctx, bmps[i], W, H); return; }
  const p = Math.min(1, (local - disp) / fade), cur = bmps[i], nxt = bmps[i + 1];
  switch (mode) {
    case 'フェードアウト→イン':
      if (p < .5) drawFit(ctx, cur, W, H, 0, 0, 1 - p * 2); else drawFit(ctx, nxt, W, H, 0, 0, (p - .5) * 2);
      break;
    case '左スライド': { const x = Math.round(W * p); drawFit(ctx, cur, W, H, -x, 0); drawFit(ctx, nxt, W, H, W - x, 0); break; }
    case '右スライド': { const x = Math.round(W * p); drawFit(ctx, cur, W, H, x, 0); drawFit(ctx, nxt, W, H, x - W, 0); break; }
    case '上スライド': { const y = Math.round(H * p); drawFit(ctx, cur, W, H, 0, -y); drawFit(ctx, nxt, W, H, 0, H - y); break; }
    default: drawFit(ctx, cur, W, H); drawFit(ctx, nxt, W, H, 0, 0, p);
  }
}

/* ───── 書き出し ───── */
const status = m => $('status').textContent = m;
const progress = v => { $('bar').hidden = false; $('bar').value = v; };
const tick = () => new Promise(r => setTimeout(r, 0));

function pickAvcCodec(W, H) {
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16);
  const lvl = mbs <= 8192 ? '28' : mbs <= 22080 ? '32' : mbs <= 36864 ? '33' : '34'; // 4.0 / 5.0 / 5.1 / 5.2
  return ['avc1.6400' + lvl, 'avc1.4d00' + lvl, 'avc1.42' + '00' + lvl];
}

async function encodeMp4(bmps, W, H, disp, fade, mode) {
  let codec = null;
  const bitrate = Math.round(Math.min(40e6, Math.max(4e6, W * H * FPS * 0.15)));
  for (const c of pickAvcCodec(W, H)) {
    try { const r = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: FPS }); if (r.supported) { codec = c; break; } } catch {}
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
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
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
    const canMp4 = window.VideoEncoder && window.VideoFrame && window.Mp4Muxer;
    if (canMp4) {
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

/* ───── ツイート自動生成 ───── */
const DEFAULT_TPL = '{ひとこと}\n\n{日付} 出勤のBAR呼び出し可能キャストさん😊\n\n{キャスト}\n\n{ハッシュタグ}';
let tpls = [], castDirty = false;
const LS = 'slideshow_tweet_tpls';
const trySet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const tryGet = k => { try { return localStorage.getItem(k); } catch { return null; } };

function castName(f) { return f.name.replace(/\.[^.]+$/, ''); }
function syncCast() {
  if (!$('tcast') || castDirty) return;
  $('tcast').value = items.filter(i => i.on).map(i => castName(i.file)).join('\n');
  buildTweet();
}
function fmtDate(v) { if (!v) return ''; const [, m, d] = v.split('-'); return `${+m}/${+d}`; }
function weighted(s) { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2; } return n; }
function buildTweet() {
  const suf = $('tsuf').value.trim();
  const cast = $('tcast').value.split('\n').map(s => s.trim()).filter(Boolean).map(n => suf ? `${n}　${suf}` : n).join('\n');
  const t = $('ttpl').value
    .replaceAll('{日付}', fmtDate($('tdate').value))
    .replaceAll('{ひとこと}', $('tword').value.trim())
    .replaceAll('{キャスト}', cast)
    .replaceAll('{ハッシュタグ}', $('ttags').value.trim());
  $('tout').value = t;
  const w = weighted(t);
  $('tlen').textContent = `${w} / 280（Xの文字数換算）`; $('tlen').classList.toggle('over140', w > 280);
  $('tPost').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t);
}
function saveTpls() { trySet(LS, JSON.stringify(tpls)); }
function fillSel(sel) {
  $('tplSel').textContent = '';
  tpls.forEach((t, i) => $('tplSel').add(new Option(t.name, i)));
  if (sel != null) $('tplSel').value = sel;
}
function applyTpl() {
  const t = tpls[$('tplSel').value]; if (!t) return;
  $('tname').value = t.name; $('ttpl').value = t.body; $('tsuf').value = t.suffix; $('ttags').value = t.tags;
  if (t.word != null) $('tword').value = t.word;
  buildTweet();
}
$('tplSel').onchange = applyTpl;
$('tSave').onclick = () => {
  const name = $('tname').value.trim() || 'テンプレ';
  const t = { name, body: $('ttpl').value, suffix: $('tsuf').value, tags: $('ttags').value, word: $('tword').value };
  let i = tpls.findIndex(x => x.name === name);
  if (i < 0) { tpls.push(t); i = tpls.length - 1; } else tpls[i] = t;
  saveTpls(); fillSel(i); status(`テンプレ「${name}」を保存しました`);
};
$('tDel').onclick = () => {
  if (tpls.length <= 1) return alert('最後のテンプレは削除できません。');
  tpls.splice($('tplSel').value, 1); saveTpls(); fillSel(0); applyTpl();
};
/* CSV */
const csvEsc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
function toCsv() {
  const head = ['テンプレ名', 'テンプレ本文', '敬称', 'ハッシュタグ', 'ひとこと'];
  return '\ufeff' + [head, ...tpls.map(t => [t.name, t.body, t.suffix, t.tags, t.word])].map(r => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
}
function parseCsv(s) {
  s = s.replace(/^\ufeff/, ''); const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; r.push(f); f = ''; if (r.some(x => x !== '')) rows.push(r); r = []; }
    else f += c;
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  return rows;
}
$('tExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv;charset=utf-8' }));
  a.download = 'tweet_templates.csv'; a.click();
};
$('tImport').onclick = () => $('tcsv').click();
$('tcsv').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('\ufffd')) txt = new TextDecoder('shift_jis').decode(buf); // Excel(日本語)保存対策
    const rows = parseCsv(txt).slice(1).filter(r => r.length >= 2);
    if (!rows.length) throw new Error('テンプレが見つかりません');
    tpls = rows.map(r => ({ name: r[0] || 'テンプレ', body: r[1] || '', suffix: r[2] ?? 'ちゃん', tags: r[3] ?? '', word: r[4] ?? '' }));
    saveTpls(); fillSel(0); applyTpl(); status(`CSVから ${tpls.length} 件のテンプレを読み込みました`);
  } catch (err) { alert('CSVを読み込めませんでした：' + err.message); }
};
$('tCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('tout').value); status('ツイート文をコピーしました'); }
  catch { $('tout').select(); document.execCommand('copy'); status('ツイート文をコピーしました'); }
};
function initTweet() {
  const d = new Date(); $('tdate').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  try { tpls = JSON.parse(tryGet(LS) || '[]'); } catch { tpls = []; }
  if (!tpls.length) tpls = [{ name: '出勤告知', body: DEFAULT_TPL, suffix: 'ちゃん', tags: '#男の娘 #ニューハーフ', word: $('tword').value }];
  fillSel(0); applyTpl(); castDirty = false; syncCast();
  $('tcast').addEventListener('input', () => { castDirty = true; buildTweet(); });
  ['tdate', 'tword', 'tsuf', 'ttags', 'ttpl'].forEach(id => $(id).addEventListener('input', buildTweet));
}
render();
initTweet();
(() => {
  const cb = $('tweetOn'), body = $('tweetBody');
  const apply = () => { body.hidden = !cb.checked; try { localStorage.setItem('slideshow_tweet_on', cb.checked ? '1' : '0'); } catch {} };
  try { if (localStorage.getItem('slideshow_tweet_on') === '0') cb.checked = false; } catch {}
  cb.onchange = apply; apply();
})();
