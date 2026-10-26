/* gate-nav.js — 全站共用：①玩家稱呼  ②回大廳／回項目首頁 的浮動按鈕
 *
 * 用法：放在各項目 index.html 的 <head> 裡（越早載入越好，遊戲才拿得到名字）
 *   <script src="../gate-nav.js" data-pos="bl" data-name="生字射擊"></script>
 * data-pos     : bl 左下(預設) / tl 左上 / br 右下 / tr 右上
 * data-name    : 這個項目的名稱（顯示在確認視窗）
 * data-home    : "0" 不顯示「項目首頁」按鈕
 * data-confirm : "0" 離開前不再詢問
 * data-bar     : "0" 不顯示浮動按鈕（大廳首頁用）
 * data-askname : "0" 沒有名字時不要自動詢問（大廳首頁自己處理）
 *
 * 玩家稱呼：window.HY_PLAYER
 *   .get()      → 目前稱呼（沒有就回傳空字串）
 *   .set(name)  → 設定稱呼
 *   .esc(s)     → 轉成可安全放進 innerHTML 的文字
 *   .ask(cb)    → 跳出「你想被叫什麼名字？」視窗
 */
(function () {
  var me = document.currentScript || {};
  var ds = me.dataset || {};
  var pos = ds.pos || 'bl';
  var roomName = ds.name || '這個項目';
  var showHome = ds.home !== '0';
  var needConfirm = ds.confirm !== '0';
  var showBar = ds.bar !== '0';
  var autoAsk = ds.askname !== '0';
  var Z = 2147483000;
  var KEY = 'huawen-player-name';
  var FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';

  /* ---------- 玩家稱呼 ---------- */
  function clean(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }
  function readName() {
    var n = '';
    try { n = new URL(location.href).searchParams.get('name') || ''; } catch (e) {}
    n = clean(n);
    if (n) { try { localStorage.setItem(KEY, n); } catch (e) {} try { sessionStorage.setItem(KEY, n); } catch (e) {} return n; }
    try { n = clean(localStorage.getItem(KEY)); } catch (e) {}
    if (!n) { try { n = clean(sessionStorage.getItem(KEY)); } catch (e) {} }
    return n;
  }
  var current = readName();
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  window.HY_PLAYER = {
    get: function () { return current; },
    set: function (n) {
      current = clean(n);
      try { localStorage.setItem(KEY, current); } catch (e) {}
      try { sessionStorage.setItem(KEY, current); } catch (e) {}
      return current;
    },
    esc: esc,
    ask: function (cb, opts) { askName(cb, opts); }
  };

  function css(el, o) { for (var k in o) el.style[k] = o[k]; return el; }

  function mkBtn(text, title, fn, host) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = title || '';
    css(b, {
      font: 'inherit', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
      border: '2px solid rgba(255,255,255,.9)', borderRadius: '999px', padding: '6px 14px',
      background: 'rgba(255,138,61,.95)', color: '#fff', boxShadow: '0 3px 10px rgba(0,0,0,.35)',
      minHeight: '36px'
    });
    if (host) {
      b.onmouseenter = function () { host.style.opacity = '1'; };
      b.onmouseleave = function () { host.style.opacity = '.88'; };
    }
    b.onclick = fn;
    return b;
  }

  function modal(build) {
    var mask = css(document.createElement('div'), {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: Z + 1, background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: FONT
    });
    var box = css(document.createElement('div'), {
      background: '#fff', color: '#3b2f2a', borderRadius: '18px', padding: '22px 24px',
      maxWidth: '360px', width: '100%', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.4)'
    });
    mask.appendChild(box);
    var api = { mask: mask, box: box, close: function () { if (mask.parentNode) mask.parentNode.removeChild(mask); } };
    build(api);
    document.body.appendChild(mask);
    return api;
  }

  /* 「你想被叫什麼名字？」視窗 */
  function askName(cb, opts) {
    opts = opts || {};
    modal(function (m) {
      var t = css(document.createElement('div'), { fontSize: '22px', fontWeight: '800', marginBottom: '6px' });
      t.textContent = '👋 你好！';
      var p = css(document.createElement('div'), { fontSize: '16px', lineHeight: '1.6', marginBottom: '12px', color: '#6b5a50', whiteSpace: 'pre-line' });
      p.textContent = '你想被叫什麼名字呢？\n之後遊戲裡都會這樣叫你喔！';
      var inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 12; inp.placeholder = '例如：小明、Eric'; inp.value = current || '';
      css(inp, { width: '100%', font: 'inherit', fontSize: '20px', textAlign: 'center', padding: '10px', border: '3px solid #f1e2cc', borderRadius: '12px', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' });
      var ok = mkBtn('開始囉！', '', function () {
        var v = clean(inp.value); if (!v) { inp.focus(); inp.style.borderColor = '#e0533d'; return; }
        window.HY_PLAYER.set(v); m.close();
        if (cb) cb(v); else location.reload();
      });
      css(ok, { fontSize: '18px', padding: '9px 26px', border: '2px solid #ff8a3d', boxShadow: 'none' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); e.stopPropagation(); });
      inp.addEventListener('keyup', function (e) { e.stopPropagation(); });
      m.box.appendChild(t); m.box.appendChild(p); m.box.appendChild(inp); m.box.appendChild(ok);
      if (opts.cancelable) {
        var no = mkBtn('取消', '', m.close);
        css(no, { background: '#e9e2d6', color: '#3b2f2a', border: '2px solid #e9e2d6', boxShadow: 'none', marginLeft: '8px' });
        m.box.appendChild(no);
      }
      setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  }

  function onReady(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }

  /* 直接開啟某個遊戲、但還沒有名字時，自動詢問一次 */
  if (autoAsk && !current) onReady(function () { askName(null); });

  /* ---------- 浮動按鈕 ---------- */
  if (!showBar) return;

  var bar = css(document.createElement('div'), {
    position: 'fixed', zIndex: Z, display: 'flex', gap: '6px', alignItems: 'center',
    opacity: '.88', fontFamily: FONT
  });
  var gap = '10px';
  if (pos.charAt(0) === 't') bar.style.top = gap; else bar.style.bottom = gap;
  if (pos.charAt(1) === 'r') bar.style.right = gap; else bar.style.left = gap;

  function confirmBox(msg, okText, onOk) {
    if (!needConfirm) { onOk(); return; }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); api.close(); document.removeEventListener('keydown', onKey, true); } }
    var api = modal(function (m) {
      var p = css(document.createElement('div'), { fontSize: '17px', lineHeight: '1.6', marginBottom: '16px', fontWeight: '700', whiteSpace: 'pre-line' });
      p.textContent = msg;
      var row = css(document.createElement('div'), { display: 'flex', gap: '10px', justifyContent: 'center' });
      var cancel = mkBtn('繼續玩', '', function () { m.close(); document.removeEventListener('keydown', onKey, true); });
      css(cancel, { background: '#e9e2d6', color: '#3b2f2a', border: '2px solid #e9e2d6', boxShadow: 'none', fontSize: '16px', padding: '8px 18px' });
      var ok = mkBtn(okText, '', function () { m.close(); document.removeEventListener('keydown', onKey, true); onOk(); });
      css(ok, { fontSize: '16px', padding: '8px 18px', border: '2px solid #ff8a3d', boxShadow: 'none' });
      row.appendChild(cancel); row.appendChild(ok);
      m.box.appendChild(p); m.box.appendChild(row);
      m.mask.addEventListener('click', function (e) { if (e.target === m.mask) { m.close(); document.removeEventListener('keydown', onKey, true); } });
      document.addEventListener('keydown', onKey, true);
      setTimeout(function () { ok.focus(); }, 0);
    });
  }

  function exitFs() {
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
  }
  function goLobby() {
    exitFs();
    var u = new URL('../index.html', location.href);
    if (current) u.searchParams.set('name', current);
    location.href = u.href;
  }
  function goHome() {
    exitFs();
    var u = new URL(location.href); u.hash = '';
    location.href = u.href;            // 同一頁重新載入 = 回到這個項目的首頁
    if (location.href === u.href) location.reload();
  }

  bar.appendChild(mkBtn('🏠 大廳', '回到學習大廳', function () {
    confirmBox('要回到「學習大廳」嗎？\n目前這一局的進度不會保留喔。', '回大廳', goLobby);
  }, bar));
  if (showHome) {
    bar.appendChild(mkBtn('↩ 首頁', '回到「' + roomName + '」首頁', function () {
      confirmBox('要回到「' + roomName + '」的首頁嗎？\n目前這一局的進度不會保留喔。', '回首頁', goHome);
    }, bar));
  }
  if (current) {
    var chip = css(document.createElement('span'), {
      fontSize: '13px', fontWeight: '700', color: '#fff', background: 'rgba(0,0,0,.45)',
      border: '2px solid rgba(255,255,255,.7)', borderRadius: '999px', padding: '4px 11px', maxWidth: '110px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    });
    chip.textContent = '👤 ' + current; chip.title = '目前的稱呼（要改請回大廳）';
    bar.appendChild(chip);
  }
  onReady(function () { document.body.appendChild(bar); });
})();
