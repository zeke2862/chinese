// 玩家稱呼（由大廳設定）
function playerName() { return (window.HY_PLAYER && HY_PLAYER.get()) || ''; }
(function () {
  const h = document.getElementById('playerHi');
  if (h) h.textContent = playerName() ? `👋 ${playerName()}，選擇模式，開始射擊吧！` : '';
})();

// =============================================
//   TypeStrike — 國字拼音打字射擊遊戲 v3
//   一般模式：看拼音選國字　／　專家模式：看國字選拼音
// =============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── 生字資料（CHAR_BOOKS 由 character-books-data.js 載入） ──
// 結構： [ { book:"01", label:"一年級上冊", lessons:[ { lesson, title, chars:[[國字,拼音],...] }, ... ] }, ... ]
let selectedBook = (typeof CHAR_BOOKS !== 'undefined' && CHAR_BOOKS[0]) ? CHAR_BOOKS[0].book : null;
let selectedLessons = new Set(); // 該冊中被選取的課別代碼

// 練習範圍模式：'single'＝單冊模式（選一冊＋選課文）／'combined'＝綜合關卡（可跨冊、跨年級混合練習）／'wrong'＝常錯題目關卡
let rangeMode = 'single';
let combinedBooks = new Set(); // 綜合關卡：被選取的冊別代碼（可複選多冊）

// ── 常錯題目記錄（存在瀏覽器 localStorage，換頁/關機後仍會保留） ──
const WRONG_HISTORY_KEY = 'ztype_wrong_history_v1';

function loadWrongHistory() {
  try {
    const raw = localStorage.getItem(WRONG_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveWrongHistory() {
  try {
    localStorage.setItem(WRONG_HISTORY_KEY, JSON.stringify(wrongHistory));
  } catch (e) {
    // 無痕模式或儲存空間被關閉時，安靜地放棄儲存即可，不影響遊戲進行
  }
}

let wrongHistory = loadWrongHistory(); // { "天": { pinyin: "tiān", count: 3 }, ... }

/* ===== 休息小遊戲（relax-break）=====
   觸發：每答 10 題，或連續答對 5 題（先到先觸發）→ 在「關卡／波次之間」隨機出一款小遊戲，一局決勝負，贏了得寶箱／關卡獎勵。
   年級：用「練習範圍的最高冊數」換算，2 冊 1 個年級（1-2 冊＝1 年級 … 11-12 冊＝6 年級）。
   解鎖：「同一款」小遊戲累積贏電腦 3 次，這一款就能在首頁「🎮 遊戲區」直接玩（不看冊數）；遊戲區每一款每天各玩 2 回。
   電腦強度：依該款的勝場數與勝率慢慢調高，一律從最簡單開始。進度存在這台電腦的瀏覽器裡。 */
const RB_ALL={whack:null,downstairs:null,memory:null,catmouse:null,reversi:null,snake:null,upstairs:null,gomoku9:null,checkers:null,
  banqi:null,hexxagon:['small37','random37','classic','square7'],pickupred:null,oldmaid:null,sevens:null,xiangqi:null,minesweeper:null,go9:null};
const RB_PICK=(...ids)=>Object.fromEntries(ids.map(k=>[k,RB_ALL[k]]));
const RB_GRADE_GAMES={
 1:RB_PICK('whack','downstairs','memory','catmouse'),
 2:RB_PICK('reversi','snake','upstairs','memory'),
 3:RB_PICK('gomoku9','reversi','checkers','memory'),
 4:RB_PICK('gomoku9','banqi','hexxagon','pickupred','oldmaid','sevens'),
 5:RB_PICK('gomoku9','xiangqi','banqi','pickupred','sevens','minesweeper'),
 6:RB_PICK(...Object.keys(RB_ALL))};   // 6 年級：各年級小遊戲＋圍棋
const rbGradeOf=vol=>Math.max(1,Math.min(6,Math.ceil((+vol||1)/2)));

// ── 一輪不重複／補課預習 ──
let zUsed = new Set(), zRound = 1, zGrowSet = new Set(), zCut = 0;
function zResetRound() { zUsed = new Set(); zRound = 1; zGrowSet = new Set(); zCut = 0; }
function zBaseHit(b, l) {
  if (rangeMode === 'combined') return combinedBooks.has(b.book);
  return b.book === selectedBook && (selectedLessons.size === 0 || selectedLessons.has(l.lesson));
}
function zScopeLessons() {   // 目前練習範圍（含補課／預習加進來的課）→ [[冊序,課序],...]
  const out = [];
  if (typeof CHAR_BOOKS === 'undefined') return out;
  CHAR_BOOKS.forEach((b, bi) => b.lessons.forEach((l, li) => { if (zBaseHit(b, l) || zGrowSet.has(bi + ':' + li)) out.push([bi, li]); }));
  return out;
}
function zGrowScope() {      // 先往前補課（直到第1冊第1課），補完再往後預習（直到最後一課）
  const all = [];
  CHAR_BOOKS.forEach((b, bi) => b.lessons.forEach((l, li) => all.push([bi, li])));
  const ids = [];
  all.forEach((x, i) => { if (zBaseHit(CHAR_BOOKS[x[0]], CHAR_BOOKS[x[0]].lessons[x[1]]) || zGrowSet.has(x[0] + ':' + x[1])) ids.push(i); });
  if (!ids.length) return '';
  const lo = Math.min(...ids), hi = Math.max(...ids);
  let a, k;
  if (lo > 0) { a = all[lo - 1]; k = '📚 補課：加入'; }
  else if (hi < all.length - 1) { a = all[hi + 1]; k = '🔭 預習：加入'; }
  else return '🏁 已涵蓋全部課文';
  zGrowSet.add(a[0] + ':' + a[1]);
  const bk = CHAR_BOOKS[a[0]];
  return k + bk.label + ' 第' + (+bk.lessons[a[1]].lesson) + '課';
}
function zToast(t) {
  const d = document.createElement('div'); d.textContent = t;
  d.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);background:#2b2150ee;color:#ffd84d;border:2px solid #7a64e8;border-radius:12px;padding:8px 16px;z-index:1000;font:700 16px "Noto Sans TC",sans-serif;pointer-events:none;max-width:92vw;text-align:center';
  document.body.appendChild(d); setTimeout(() => d.remove(), 4200);
}
// ── 小遊戲 ──
let zPrev = null;
RelaxBreak.init({every:10,streak:5,level:'easy',unlockWins:3,dailyLimit:2,storageKey:'hy_relax_v1',deferred:true,
  rewardLabels:{chest:'寶箱（生命 +1）',stage:'關卡獎勵（下一波敵艦少 4 艘）'},
  rewards:{
    chest:()=>{ if (lives < maxLives) { lives++; return '❤️ 生命 +1'; } const b = 300 * wave; score += b; return '🏅 生命已滿，改發分數 +' + b; },
    stage:()=>{ zCut = 4; return '🛡️ 下一波敵艦少 4 艘'; }},
  onStart:()=>{ zPrev = { st: state, pn: document.getElementById('answerPanel').style.display }; state = STATE.MINI; document.getElementById('answerPanel').style.display = 'none'; },
  onEnd:info=>{ if (zPrev) { state = zPrev.st; document.getElementById('answerPanel').style.display = zPrev.pn; zPrev = null; }
    updateHUD(); const c = zCont; zCont = null; if (c && !info.zone) c(); }});
let zCont = null;
function rbAnsZ(ok) { try { RelaxBreak.answered(!!ok); } catch (e) {} }
function zVol() {
  let m = 0;
  if (rangeMode === 'wrong') CHAR_BOOKS.forEach((b, bi) => { if (b.lessons.some(l => l.chars.concat(l.words || []).some(p => wrongHistory[p[0]]))) m = bi; });
  else zScopeLessons().forEach(x => { m = Math.max(m, x[0]); });
  return m + 1;
}
function rbHoldZ(cont) {   // 每一波之間才彈出小遊戲，不會打斷作答
  if (!window.RelaxBreak || RelaxBreak.active) { cont(); return; }
  RelaxBreak.configure({ games: RB_GRADE_GAMES[rbGradeOf(zVol())] });
  zCont = cont;
  if (RelaxBreak.poll()) return;
  zCont = null; cont();
}
document.getElementById('zoneBtn').addEventListener('click', () => { RelaxBreak.configure({ games: RB_GRADE_GAMES[6] }); RelaxBreak.openZone(); });


// 答錯（含被敵艦撞到）時呼叫：累計這個字/詞的錯誤次數
function recordWrong(item) {
  const key = item.hanzi;
  if (!wrongHistory[key]) wrongHistory[key] = { pinyin: item.pinyin, count: 0 };
  wrongHistory[key].pinyin = item.pinyin;
  wrongHistory[key].count++;
  saveWrongHistory();
}

// 常錯題目關卡的題庫：依照錯誤次數加權（錯越多次，出現機率越高）
function getWrongPool() {
  const pool = [];
  for (const key in wrongHistory) {
    const entry = wrongHistory[key];
    const weight = Math.max(1, Math.min(entry.count, 15)); // 最多重複15次，避免單一項目過度壟斷題庫
    for (let i = 0; i < weight; i++) pool.push({ hanzi: key, pinyin: entry.pinyin });
  }
  return pool;
}

function getBook(bookCode) {
  if (typeof CHAR_BOOKS === 'undefined') return null;
  return CHAR_BOOKS.find(b => b.book === bookCode) || null;
}

// 取得目前選取範圍內的課文（若沒有勾選任何課文，預設整冊都練習）
function getSelectedLessonList() {
  const book = getBook(selectedBook);
  if (!book) return [];
  const lessons = book.lessons.filter(l => selectedLessons.has(l.lesson));
  return lessons.length > 0 ? lessons : book.lessons;
}

// 綜合關卡：把所有被選取冊別的課文全部攤平在一起
function getCombinedLessonList() {
  if (typeof CHAR_BOOKS === 'undefined') return [];
  const books = CHAR_BOOKS.filter(b => combinedBooks.has(b.book));
  let lessons = [];
  for (const b of books) lessons = lessons.concat(b.lessons);
  return lessons;
}

// 將選取的課文攤平成生字＋詞語池（同一個字/詞若在多課出現會重複，屬正常機率分布）
// 同時混合單字（生字）與多字詞語（詞語），讓練習內容不限於單一國字
function getCharPool() {
  if (rangeMode === 'wrong') return getWrongPool();
  const lessons = zScopeLessons().map(([bi, li]) => CHAR_BOOKS[bi].lessons[li]);
  const pool = [];
  for (const l of lessons) {
    for (const pair of l.chars) {
      pool.push({ hanzi: pair[0], pinyin: pair[1] });
    }
    for (const pair of (l.words || [])) {
      pool.push({ hanzi: pair[0], pinyin: pair[1] });
    }
  }
  return pool;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// 隨機抽出一個練習目標 {hanzi, pinyin}
function pickChineseTarget() {
  const pool = getCharPool();
  if (pool.length === 0) return null;
  if (rangeMode === 'wrong') return pool[Math.floor(Math.random() * pool.length)];   // 常錯題：保持加權隨機
  // 一輪內不重複：題庫全部出過一遍才算一輪；答完一輪自動補課（往前）／預習（往後）加一課
  let fresh = pool.filter(x => !zUsed.has(x.hanzi));
  if (fresh.length === 0) {
    zUsed = new Set(); zRound++;
    const note = zGrowScope();
    zToast('🔄 題庫答完一輪（第 ' + zRound + ' 輪）｜' + note);
    fresh = getCharPool();
  }
  const t = fresh[Math.floor(Math.random() * fresh.length)];
  zUsed.add(t.hanzi);
  return t;
}

// 產生選項（1 個正確答案 + 其餘干擾選項）
// field：'hanzi'（一般模式，選國字）或 'pinyin'（專家模式，選拼音）
// 干擾選項一律從「字數相同」的生字/詞語中挑選，確保同一題的選項字數一致
// 所有12冊的生字＋詞語（不受目前練習範圍影響），當練習範圍題庫太小、湊不出4個選項時當作備援
let _allItemsCache = null;
function getAllItemsPool() {
  if (_allItemsCache) return _allItemsCache;
  const pool = [];
  if (typeof CHAR_BOOKS !== 'undefined') {
    for (const b of CHAR_BOOKS) {
      for (const l of b.lessons) {
        for (const pair of l.chars) pool.push({ hanzi: pair[0], pinyin: pair[1] });
        for (const pair of (l.words || [])) pool.push({ hanzi: pair[0], pinyin: pair[1] });
      }
    }
  }
  _allItemsCache = pool;
  return pool;
}

function buildAnswerChoices(correctItem, field) {
  const correctVal = correctItem[field];
  const targetLen = correctItem.hanzi.length;
  const choices = new Set([correctVal]);
  const pool = getCharPool();

  const sameLenPool = pool.filter(it => it.hanzi.length === targetLen && it[field] !== correctVal);
  let guard = 0;
  while (choices.size < 4 && guard < 100 && sameLenPool.length > 0) {
    guard++;
    const cand = sameLenPool[Math.floor(Math.random() * sameLenPool.length)][field];
    if (cand) choices.add(cand);
  }

  // 若同字數的生字/詞語不夠湊出4個選項，才放寬到其他字數（避免練習範圍太小時卡住）
  guard = 0;
  while (choices.size < 4 && guard < 100 && pool.length > 0) {
    guard++;
    const cand = pool[Math.floor(Math.random() * pool.length)][field];
    if (cand && cand !== correctVal) choices.add(cand);
  }

  // 最後還是不夠（例如常錯題目關卡剛開始只有一兩項記錄），就從全部12冊題庫裡湊滿4個選項
  // 一樣先試著湊「字數相同」的，真的不夠才不限字數
  const allPool = getAllItemsPool();
  const allSameLen = allPool.filter(it => it.hanzi.length === targetLen && it[field] !== correctVal);
  guard = 0;
  while (choices.size < 4 && guard < 150 && allSameLen.length > 0) {
    guard++;
    const cand = allSameLen[Math.floor(Math.random() * allSameLen.length)][field];
    if (cand) choices.add(cand);
  }
  guard = 0;
  while (choices.size < 4 && guard < 150 && allPool.length > 0) {
    guard++;
    const cand = allPool[Math.floor(Math.random() * allPool.length)][field];
    if (cand && cand !== correctVal) choices.add(cand);
  }

  const arr = Array.from(choices);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Game State ─────────────────────────────────
const STATE = {
  MENU: 'menu',
  CATEGORIES: 'categories',
  PLAYING: 'playing',
  PAUSED: 'paused',
  MINI: 'mini',
  GAMEOVER: 'gameover'
};

let state = STATE.MENU;
let mode = 'normal'; // 'normal'（看拼音選國字） | 'expert'（看國字選拼音）
let score = 0;
let wave = 1;
let lives = 5;
let maxLives = 5;
let killCount = 0;
let totalAnswers = 0;
let correctAnswers = 0;
let wrongAnswers = []; // { promptLabel, prompt, correctLabel, correct }
let gameStartTime = 0;
let gameEndTime = 0;
let lockedTarget = null;
let enemies = [];
let bullets = [];
let particles = [];
let stars = [];
let explosions = [];
let waveTimer = 0;
let waveEnemyCount = 0;
let spawnedThisWave = 0;
let waveDone = false;
let frameCount = 0;
let lastTime = 0;
let nebulaCanvas = null;

// ── Resize ─────────────────────────────────────
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  nebulaCanvas = null; // force redraw
}
window.addEventListener('resize', () => { resize(); initStars(); });
resize();

// ── Stars Background ───────────────────────────
function initStars() {
  stars = [];
  const count = Math.floor((canvas.width * canvas.height) / 6000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.2,
      brightness: Math.random(),
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.15 + 0.05,
      color: Math.random() < 0.15 ? '#a0c8ff' : Math.random() < 0.1 ? '#ffd0b0' : '#ffffff'
    });
  }
}
initStars();

// ── Player Ship ────────────────────────────────
const ship = {
  x: 0, y: 0,
  w: 18, h: 26,
  thrustAnim: 0,
  shieldFlash: 0,
  get cx() { return canvas.width / 2; },
  get cy() { return canvas.height - 80; }
};

// ── Enemy Class ────────────────────────────────
// target: { hanzi, pinyin }
class Enemy {
  constructor(target, x) {
    this.hanzi = target.hanzi;
    this.pinyin = target.pinyin;
    this.x = x;
    this.y = -30;
    this.typed = 0; // 0 或 1（是否已被擊中）
    this.size = 18;
    this.speed = this.calcSpeed();
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleAmp = Math.random() * 8 + 4;
    this.wobbleSpeed = Math.random() * 0.02 + 0.008;
    this.id = Math.random();
    this.glowPulse = Math.random() * Math.PI * 2;
    this.choices = null; // 被鎖定時才會產生選項
  }

  calcSpeed() {
    if (mode === 'expert') {
      const base = 0.22;
      const waveBonus = Math.min(wave * 0.045, 0.85);
      return (base + waveBonus) * (0.9 + Math.random() * 0.3);
    }
    const base = 0.18;
    const waveBonus = Math.min(wave * 0.035, 0.6);
    return (base + waveBonus) * (0.9 + Math.random() * 0.3);
  }

  get isLocked() { return lockedTarget === this; }
  get progress() { return this.typed; }

  // 敵人朝玩家的太空船直線前進（每一格都重新瞄準，可隨畫面縮放調整）
  update(dt) {
    const dx = ship.cx - this.x;
    const dy = ship.cy - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const step = this.speed * dt * 60;
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.wobble += this.wobbleSpeed;
    this.glowPulse += 0.05;
  }

  draw() {
    const wx = this.x + Math.sin(this.wobble) * this.wobbleAmp * (1 - this.progress * 0.7);
    const wy = this.y;
    const glow = this.isLocked ? 1 : 0.5 + 0.25 * Math.sin(this.glowPulse);
    const alpha = this.isLocked ? 1 : 0.85;

    // Engine trail
    for (let i = 0; i < 3; i++) {
      const trail = this.size * (0.3 - i * 0.07);
      const trailAlpha = (0.25 - i * 0.07) * alpha;
      const grad = ctx.createRadialGradient(wx, wy + this.size * 0.5 + i * 6, 0, wx, wy + this.size * 0.5 + i * 6, trail * 3);
      grad.addColorStop(0, `rgba(255, 80, 120, ${trailAlpha})`);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(wx, wy + this.size * 0.5 + i * 6, trail * 3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Ship body glow
    const bodyGlow = ctx.createRadialGradient(wx, wy, 0, wx, wy, this.size * 2.5 * glow);
    bodyGlow.addColorStop(0, `rgba(255, 60, 100, ${0.3 * glow})`);
    bodyGlow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(wx, wy, this.size * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = bodyGlow;
    ctx.fill();

    // Ship body
    ctx.save();
    ctx.translate(wx, wy);
    ctx.beginPath();
    ctx.moveTo(0, this.size);
    ctx.lineTo(-this.size * 0.7, -this.size * 0.6);
    ctx.lineTo(0, -this.size * 0.3);
    ctx.lineTo(this.size * 0.7, -this.size * 0.6);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, -this.size, 0, this.size);
    fillGrad.addColorStop(0, `rgba(255,80,110,${0.95 * alpha})`);
    fillGrad.addColorStop(1, `rgba(180,20,50,${0.7 * alpha})`);
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.strokeStyle = this.isLocked ? `rgba(255,200,200,0.9)` : `rgba(255,100,130,0.5)`;
    ctx.lineWidth = this.isLocked ? 1.5 : 0.8;
    ctx.stroke();

    // Core dot
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,200,200,${0.8 * alpha})`;
    ctx.fill();
    ctx.restore();

    // Word label
    this.drawLabel(wx, wy);
  }

  // 一般模式：只顯示拼音（要選國字）；專家模式：只顯示國字（要選拼音）
  drawLabel(wx, wy) {
    const label = mode === 'expert' ? this.hanzi : this.pinyin;
    const fontSize = this.isLocked ? 22 : 18;
    ctx.font = `${this.isLocked ? '700' : '600'} ${fontSize}px 'Noto Sans TC', 'Orbitron', sans-serif`;
    const totalW = ctx.measureText(label).width;
    const lx = wx - totalW / 2;
    const ly = wy - this.size - 12;

    const padX = 10, padY = 6;
    const bgW = totalW + padX * 2;
    const bgH = fontSize + padY * 2;
    const bgX = lx - padX;
    const bgY = ly - fontSize - 2;
    ctx.fillStyle = this.isLocked ? 'rgba(0,12,30,0.92)' : 'rgba(0,5,15,0.75)';
    roundRect(ctx, bgX, bgY, bgW, bgH, 5);
    ctx.fill();

    if (this.isLocked) {
      ctx.strokeStyle = 'rgba(0,245,255,0.7)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bgX, bgY, bgW, bgH, 5);
      ctx.stroke();
    }

    if (this.isLocked) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,245,255,0.9)';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = 'rgba(180,200,220,0.75)';
    }
    ctx.fillText(label, lx, ly);
    ctx.shadowBlur = 0;
  }
}

// ── Bullet Class ───────────────────────────────
class Bullet {
  constructor(tx, ty) {
    this.x = canvas.width / 2;
    this.y = ship.cy;
    this.tx = tx;
    this.ty = ty;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.vx = (dx / dist) * 14;
    this.vy = (dy / dist) * 14;
    this.life = 1;
    this.trail = [];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();
    this.x += this.vx;
    this.y += this.vy;
    const dx = this.x - this.tx;
    const dy = this.y - this.ty;
    if (dx * dx + dy * dy < 200) this.life = 0;
  }

  draw() {
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, 2 * t, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,255,${t * 0.6})`;
      ctx.fill();
    }
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 5);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#00f5ff');
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// ── Particle System ────────────────────────────
function spawnExplosion(x, y, color = '#ff4466') {
  const count = 22;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = Math.random() * 4 + 1.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: Math.random() * 0.03 + 0.02,
      size: Math.random() * 4 + 1.5,
      color
    });
  }
  explosions.push({ x, y, r: 4, maxR: 55, life: 1, color });
}

function spawnLetterPop(x, y, letter) {
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 3,
    vy: -Math.random() * 3 - 1,
    life: 1,
    decay: 0.025,
    size: 11,
    letter,
    isLetter: true
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.isLetter) {
      const isCJK = /[\u4e00-\u9fff]/.test(p.letter);
      ctx.font = isCJK ? `bold 18px 'Noto Sans TC', sans-serif` : `bold 16px 'Orbitron', monospace`;
      ctx.fillStyle = `rgba(0,245,255,${p.life})`;
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 8;
      ctx.fillText(p.letter, p.x, p.y);
      ctx.shadowBlur = 0;
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color.startsWith('#') ? hexToRgba(p.color, p.life * 0.85) : p.color;
      ctx.fill();
    }
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.r += (e.maxR - e.r) * 0.15;
    e.life -= 0.04;
    if (e.life <= 0) { explosions.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(e.color, e.life * 0.7);
    ctx.lineWidth = 2 * e.life;
    ctx.stroke();
  }
}

// ── Ship Drawing ───────────────────────────────
function drawShip() {
  const cx = canvas.width / 2;
  const cy = ship.cy;
  ship.thrustAnim += 0.15;

  // Engine glow
  for (let i = 0; i < 3; i++) {
    const glowR = (12 + Math.sin(ship.thrustAnim + i) * 5) * (1 - i * 0.25);
    const g = ctx.createRadialGradient(cx, cy + 20 + i * 8, 0, cx, cy + 20 + i * 8, glowR * 2);
    g.addColorStop(0, `rgba(0,180,255,${0.5 - i * 0.13})`);
    g.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy + 20 + i * 8, glowR * 2, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, cy);

  // Body
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(-12, 10);
  ctx.lineTo(-5, 5);
  ctx.lineTo(0, 14);
  ctx.lineTo(5, 5);
  ctx.lineTo(12, 10);
  ctx.closePath();
  const bodyGrad = ctx.createLinearGradient(0, -26, 0, 14);
  bodyGrad.addColorStop(0, '#60e8ff');
  bodyGrad.addColorStop(0.5, '#00a8d4');
  bodyGrad.addColorStop(1, '#003a5c');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,245,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cockpit
  ctx.beginPath();
  ctx.ellipse(0, -12, 4, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,245,255,0.5)';
  ctx.fill();

  // Wings
  ctx.beginPath();
  ctx.moveTo(-12, 10);
  ctx.lineTo(-22, 18);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,120,200,0.8)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(12, 10);
  ctx.lineTo(22, 18);
  ctx.lineTo(14, 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,120,200,0.8)';
  ctx.fill();

  // Shield flash
  if (ship.shieldFlash > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 80, 120, ${ship.shieldFlash})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ship.shieldFlash -= 0.06;
  }

  ctx.restore();
}

// ── Background ─────────────────────────────────
function drawBackground() {
  ctx.fillStyle = '#020408';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawNebula();

  frameCount++;
  for (const s of stars) {
    s.y += s.speed;
    if (s.y > canvas.height) s.y = 0;
    const twinkle = 0.5 + 0.5 * Math.sin(frameCount * s.twinkleSpeed + s.twinklePhase);
    const a = 0.3 + twinkle * 0.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = s.color === '#ffffff' ? `rgba(255,255,255,${a})` :
      s.color === '#a0c8ff' ? `rgba(160,200,255,${a})` : `rgba(255,208,176,${a})`;
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,20,40,0.06)';
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 2);
  }
}

function drawNebula() {
  if (!nebulaCanvas) {
    nebulaCanvas = document.createElement('canvas');
    nebulaCanvas.width = canvas.width;
    nebulaCanvas.height = canvas.height;
    const nc = nebulaCanvas.getContext('2d');
    const blobs = [
      { x: 0.15, y: 0.2, r: 0.25, c: 'rgba(30,0,80,0.15)' },
      { x: 0.85, y: 0.35, r: 0.2,  c: 'rgba(0,40,80,0.12)' },
      { x: 0.5,  y: 0.6, r: 0.3,  c: 'rgba(0,20,60,0.1)'  },
    ];
    for (const b of blobs) {
      const g = nc.createRadialGradient(b.x * canvas.width, b.y * canvas.height, 0,
        b.x * canvas.width, b.y * canvas.height, b.r * canvas.width);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'transparent');
      nc.beginPath();
      nc.arc(b.x * canvas.width, b.y * canvas.height, b.r * canvas.width, 0, Math.PI * 2);
      nc.fillStyle = g;
      nc.fill();
    }
  }
  ctx.drawImage(nebulaCanvas, 0, 0);
}

// ── Wave Management ────────────────────────────
function waveEnemyCount_(w) {
  return Math.min(4 + w * 2, 20);
}

function startWave() {
  waveEnemyCount = Math.max(3, waveEnemyCount_(wave) - zCut);
  zCut = 0;
  spawnedThisWave = 0;
  waveTimer = 0;
  waveDone = false;

  // 開始遊戲／每一波一開始就先讓敵人出現，不用乾等
  const initialBatch = Math.min(5, waveEnemyCount);
  for (let i = 0; i < initialBatch; i++) spawnEnemy();
}

function getSpawnInterval() {
  const base = mode === 'expert' ? 2000 : 2500;
  const min = mode === 'expert' ? 600 : 700;
  return Math.max(base - wave * 130, min);
}

function trySpawn(dt) {
  if (spawnedThisWave >= waveEnemyCount) return;
  waveTimer += dt * 1000;
  if (waveTimer >= getSpawnInterval()) {
    waveTimer -= getSpawnInterval();
    spawnEnemy();
  }
}

function spawnEnemy() {
  const margin = 60;
  const x = margin + Math.random() * (canvas.width - margin * 2);
  spawnedThisWave++;
  const target = pickChineseTarget();
  if (!target) return; // 生字資料不足時安全略過
  enemies.push(new Enemy(target, x));
}

function distToShip(en) {
  const dx = en.x - ship.cx;
  const dy = en.y - ship.cy;
  return dx * dx + dy * dy;
}

// ── 鎖定目標與作答（一般模式：看拼音選國字／專家模式：看國字選拼音） ──
function updateChineseLock() {
  if (lockedTarget && !enemies.includes(lockedTarget)) lockedTarget = null;
  if (!lockedTarget) {
    if (enemies.length === 0) {
      renderChoiceUI(null);
      return;
    }
    // 鎖定離太空船最近（最危險）的敵艦，因為敵人現在是直線朝玩家飛來，不只是往下掉
    lockedTarget = enemies.reduce((a, b) => (distToShip(a) < distToShip(b) ? a : b));
    const field = mode === 'expert' ? 'pinyin' : 'hanzi';
    lockedTarget.choices = buildAnswerChoices(lockedTarget, field);
    renderChoiceUI(lockedTarget);
  }
}

function renderChoiceUI(enemy) {
  const hint = document.getElementById('answerHint');
  const choicesWrap = document.getElementById('answerChoices');
  if (!hint || !choicesWrap) return;

  if (!enemy) {
    hint.textContent = '等待敵艦出現…';
    choicesWrap.innerHTML = '';
    return;
  }

  if (mode === 'expert') {
    hint.textContent = `國字：${enemy.hanzi}　→　請選出正確的拼音`;
  } else {
    hint.textContent = `拼音：${enemy.pinyin}　→　請選出正確的國字`;
  }

  choicesWrap.innerHTML = '';
  for (const choice of enemy.choices) {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => handleChineseAnswer(enemy, choice, btn));
    choicesWrap.appendChild(btn);
  }
}

function handleChineseAnswer(enemy, choice, btnEl) {
  if (state !== STATE.PLAYING) return;
  if (lockedTarget !== enemy || !enemies.includes(enemy)) return; // 已消滅的敵艦，忽略舊的作答
  totalAnswers++;
  rbAnsZ(choice === (mode === 'expert' ? enemy.pinyin : enemy.hanzi));

  const correctVal = mode === 'expert' ? enemy.pinyin : enemy.hanzi;
  if (choice === correctVal) {
    correctAnswers++;
    btnEl.classList.add('correct-flash');
    enemy.typed = 1;
    const ex = enemy.x + Math.sin(enemy.wobble) * enemy.wobbleAmp;
    const ey = enemy.y;
    bullets.push(new Bullet(ex, ey));
    spawnLetterPop(ex, ey - 25, enemy.hanzi);
    destroyEnemy(enemy);
  } else {
    btnEl.classList.add('wrong-flash');
    setTimeout(() => btnEl.classList.remove('wrong-flash'), 300);
    wrongAnswers.push(
      mode === 'expert'
        ? { promptLabel: '國字', prompt: enemy.hanzi, correctLabel: '正確拼音', correct: enemy.pinyin }
        : { promptLabel: '拼音', prompt: enemy.pinyin, correctLabel: '正確國字', correct: enemy.hanzi }
    );
    recordWrong({ hanzi: enemy.hanzi, pinyin: enemy.pinyin });
    flashWrong();
    chineseWrongAnswer();
  }
}

// 答錯：扣一條命
function chineseWrongAnswer() {
  lives--;
  ship.shieldFlash = 1;
  updateHUD();
  if (lives <= 0) gameOver();
}

function flashWrong() {
  ctx.fillStyle = 'rgba(255,0,50,0.08)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function destroyEnemy(en) {
  const ex = en.x + Math.sin(en.wobble) * en.wobbleAmp;
  const ey = en.y;
  spawnExplosion(ex, ey, '#ff4466');

  const base = mode === 'expert' ? 20 : 15;
  const wordScore = base * wave;
  score += wordScore;
  killCount++;
  scoreFloaters.push({ x: ex, y: ey - 20, val: `+${wordScore}`, life: 1 });

  enemies.splice(enemies.indexOf(en), 1);
  if (lockedTarget === en) lockedTarget = null;
  updateHUD();
}

// Score floaters
const scoreFloaters = [];
function drawFloaters() {
  for (let i = scoreFloaters.length - 1; i >= 0; i--) {
    const f = scoreFloaters[i];
    f.y -= 1.2;
    f.life -= 0.025;
    if (f.life <= 0) { scoreFloaters.splice(i, 1); continue; }
    ctx.font = `bold 18px 'Orbitron', monospace`;
    ctx.fillStyle = `rgba(255,215,0,${f.life})`;
    ctx.shadowColor = 'rgba(255,215,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(f.val, f.x, f.y);
    ctx.shadowBlur = 0;
  }
}

// ── Enemy reaches bottom ───────────────────────
function enemyReached(en) {
  rbAnsZ(false);
  lives--;
  ship.shieldFlash = 1;
  spawnExplosion(canvas.width / 2, ship.cy, '#ff0055');

  // 撞到太空船也算沒有答對，一併記錄到錯題複習裡
  wrongAnswers.push(
    mode === 'expert'
      ? { promptLabel: '國字', prompt: en.hanzi, correctLabel: '正確拼音', correct: en.pinyin }
      : { promptLabel: '拼音', prompt: en.pinyin, correctLabel: '正確國字', correct: en.hanzi }
  );
  recordWrong({ hanzi: en.hanzi, pinyin: en.pinyin });

  enemies.splice(enemies.indexOf(en), 1);
  if (lockedTarget === en) lockedTarget = null;
  updateHUD();

  if (lives <= 0) gameOver();
}

// ── HUD Updates ────────────────────────────────
function updateHUD() {
  document.getElementById('scoreDisplay').textContent = score.toLocaleString();
  document.getElementById('waveDisplay').textContent = wave;
  const lDiv = document.getElementById('livesDisplay');
  lDiv.innerHTML = '';
  for (let i = 0; i < maxLives; i++) {
    const icon = document.createElement('div');
    icon.className = 'life-icon' + (i >= lives ? ' lost' : '');
    lDiv.appendChild(icon);
  }
}

// ── Game Flow ──────────────────────────────────
function goToCategories() {
  state = STATE.CATEGORIES;
  showScreen('categoryScreen');
  if (rangeMode === 'single') setSingleStep('books'); // 每次進來都先選冊別
  if (rangeMode === 'wrong') buildWrongPanel(); // 每次進入畫面都重新整理，才會顯示上一局最新的錯題記錄
}

function goToMenu() {
  state = STATE.MENU;
  enemies = []; bullets = []; particles = []; explosions = [];
  scoreFloaters.length = 0;
  lockedTarget = null;
  document.getElementById('answerPanel').style.display = 'none';
  showScreen('startScreen');
  initMenuShips();
}

function startGame() {
  state = STATE.PLAYING;
  maxLives = 5;
  score = 0; wave = 1; lives = maxLives; killCount = 0;
  totalAnswers = 0; correctAnswers = 0;
  wrongAnswers = [];
  zResetRound();
  if (window.RelaxBreak) RelaxBreak.reset();
  gameStartTime = Date.now();
  gameEndTime = 0;
  lockedTarget = null;
  enemies = []; bullets = []; particles = []; explosions = [];
  scoreFloaters.length = 0;
  nebulaCanvas = null;
  initStars();
  updateHUD();
  startWave();
  hideAllScreens();

  document.getElementById('answerPanel').style.display = 'flex';
  renderChoiceUI(null);
}

function pauseGame() {
  state = STATE.PAUSED;
  showScreen('pauseScreen');
}

function resumeGame() {
  state = STATE.PLAYING;
  hideAllScreens();
}

// 測驗範圍文字，例如「一年級上冊・全冊｜看拼音選國字」或「綜合關卡・一年級上冊、三年級下冊｜看國字選拼音」
function getPracticeRangeLabel() {
  const modeLabel = mode === 'expert' ? '看國字選拼音' : '看拼音選國字';

  if (rangeMode === 'combined') {
    const books = (typeof CHAR_BOOKS !== 'undefined') ? CHAR_BOOKS.filter(b => combinedBooks.has(b.book)) : [];
    const labels = books.map(b => b.label).join('、') || '未選擇';
    return `綜合關卡・${labels}｜${modeLabel}`;
  }

  if (rangeMode === 'wrong') {
    return `常錯題目關卡（共 ${Object.keys(wrongHistory).length} 項錯題記錄）｜${modeLabel}`;
  }

  const book = getBook(selectedBook);
  if (!book) return '—';
  const lessons = getSelectedLessonList();
  const isAll = lessons.length === book.lessons.length &&
    book.lessons.every(l => selectedLessons.has(l.lesson));
  const lessonPart = isAll
    ? '全冊'
    : `第 ${lessons.map(l => l.lesson.replace(/^0/, '')).join('、')} 課`;
  return `${book.label}・${lessonPart}｜${modeLabel}`;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} 分 ${s.toString().padStart(2, '0')} 秒`;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function gameOver() {
  state = STATE.GAMEOVER;
  gameEndTime = Date.now();
  const acc = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  document.getElementById('finalScore').textContent = score.toLocaleString();
  const oh = document.getElementById('overHi');
  if (oh) oh.textContent = playerName() ? `${playerName()}，這一局辛苦了！` : '';
  document.getElementById('finalWave').textContent = wave;
  document.getElementById('finalKills').textContent = killCount;
  document.getElementById('finalAccuracy').textContent = acc + '%';
  document.getElementById('finalRange').textContent = getPracticeRangeLabel();
  document.getElementById('finalDuration').textContent = formatDuration(gameEndTime - gameStartTime);
  document.getElementById('finalEndTime').textContent = formatDateTime(gameEndTime);

  // 遊戲結束先顯示錯題複習，學生按下按鈕後才看到最終成果
  renderReviewList();
  showScreen('reviewScreen');
}

function renderReviewList() {
  const container = document.getElementById('reviewList');
  if (!container) return;
  container.innerHTML = '';

  if (wrongAnswers.length === 0) {
    const p = document.createElement('div');
    p.className = 'review-empty';
    p.textContent = '🎉 ' + (playerName() ? playerName() + '，' : '') + '太棒了，這次全部都答對了！';
    container.appendChild(p);
    return;
  }

  wrongAnswers.forEach(item => {
    const row = document.createElement('div');
    row.className = 'stat-row review-row';
    row.innerHTML = `<span>${item.promptLabel}：${item.prompt}</span><span class="review-answer">${item.correctLabel}：${item.correct}</span>`;
    container.appendChild(row);
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function hideAllScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
}

// ── UI Buttons ─────────────────────────────────
// Mode select
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
  });
});

window.addEventListener('keydown', e => {
  if (state === STATE.MENU || state === STATE.CATEGORIES) {
    if (e.key === 'Enter') {
      if (state === STATE.MENU) goToCategories();
      else startGame();
    }
    return;
  }
  if (e.key === 'Escape') {
    if (state === STATE.PLAYING) pauseGame();
    else if (state === STATE.PAUSED) resumeGame();
  }
});

// Start screen → Book/Lesson screen
document.getElementById('toCategories').addEventListener('click', goToCategories);

// ── 冊別 / 課文 選擇 UI ─────────────────────────

// 範圍模式切換：單冊模式 ↔ 綜合關卡（跨冊）
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    rangeMode = btn.dataset.rangeMode;
    document.getElementById('singleRangeWrap').style.display = rangeMode === 'single' ? 'block' : 'none';
    document.getElementById('combinedRangeWrap').style.display = rangeMode === 'combined' ? 'block' : 'none';
    document.getElementById('wrongRangeWrap').style.display = rangeMode === 'wrong' ? 'block' : 'none';
    if (rangeMode === 'wrong') buildWrongPanel();
    updateStartBtn();
  });
});

// 單冊模式分兩步：①先點冊別 → ②直接出現該冊的課文選單（不用往下拉）
let singleStep = 'books';
function updateStartBtn() {
  const btn = document.getElementById('startGameBtn');
  if (btn) btn.style.display = (rangeMode === 'single' && singleStep === 'books') ? 'none' : '';
}
function setSingleStep(step) {
  singleStep = step;
  const showBooks = step === 'books';
  const hint = document.getElementById('singleHint');
  const grid = document.getElementById('bookGrid');
  const panel = document.getElementById('lessonPanel');
  if (hint) hint.style.display = showBooks ? '' : 'none';
  if (grid) grid.style.display = showBooks ? '' : 'none';
  if (panel) panel.style.display = showBooks ? 'none' : 'block';
  updateStartBtn();
}

function buildBookGrid() {
  const grid = document.getElementById('bookGrid');
  if (!grid || typeof CHAR_BOOKS === 'undefined') return;
  grid.innerHTML = '';
  CHAR_BOOKS.forEach((book, idx) => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.book = book.book;
    const itemCount = book.lessons.reduce((sum, l) => sum + l.chars.length + (l.words ? l.words.length : 0), 0);
    btn.innerHTML = `
      <span class="cat-icon">📖</span>
      <span class="cat-name">${book.label}</span>
      <span class="cat-keys">共 ${book.lessons.length} 課・${itemCount} 項</span>
    `;
    btn.addEventListener('click', () => {
      selectedBook = book.book;
      selectedLessons = new Set(); // 換冊後重設，預設整冊全選
      buildLessonList();
      setSingleStep('lessons'); // 點冊別後，直接換成該冊的課文選單
    });
    grid.appendChild(btn);
  });
}

function buildLessonList() {
  const panel = document.getElementById('lessonPanel');
  const container = document.getElementById('lessonList');
  const titleEl = document.getElementById('lessonPanelTitle');
  const book = getBook(selectedBook);
  if (!panel || !container || !book) return;

  titleEl.textContent = `${book.label}｜選擇要練習的課文（可複選，預設全選）`;
  container.innerHTML = '';

  for (const lesson of book.lessons) {
    selectedLessons.add(lesson.lesson); // 預設全選

    const label = document.createElement('label');
    label.className = 'article-item checked';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) selectedLessons.add(lesson.lesson);
      else selectedLessons.delete(lesson.lesson);
      label.classList.toggle('checked', input.checked);
    });

    const span = document.createElement('span');
    span.className = 'article-item-text';
    span.textContent = `第${lesson.lesson}課　${lesson.title}`;

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  }
}

// 綜合關卡：可直接複選 1～12 冊，一起混合練習（跨年級）
function buildCombinedBookGrid() {
  const grid = document.getElementById('combinedBookGrid');
  if (!grid || typeof CHAR_BOOKS === 'undefined') return;
  grid.innerHTML = '';
  CHAR_BOOKS.forEach(book => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.book = book.book;
    const itemCount = book.lessons.reduce((sum, l) => sum + l.chars.length + (l.words ? l.words.length : 0), 0);
    btn.innerHTML = `
      <span class="cat-icon">🧩</span>
      <span class="cat-name">${book.label}</span>
      <span class="cat-keys">共 ${book.lessons.length} 課・${itemCount} 項</span>
    `;
    btn.addEventListener('click', () => {
      if (combinedBooks.has(book.book)) {
        combinedBooks.delete(book.book);
        btn.classList.remove('active');
      } else {
        combinedBooks.add(book.book);
        btn.classList.add('active');
      }
    });
    grid.appendChild(btn);
  });
}

buildBookGrid();
buildLessonList();
buildCombinedBookGrid();
buildWrongPanel();
setSingleStep('books');
document.getElementById('backToBooks')?.addEventListener('click', () => setSingleStep('books'));

document.getElementById('backToMode').addEventListener('click', () => {
  // 在課文選單時，「返回」先回到冊別；在冊別畫面才回主選單
  if (rangeMode === 'single' && singleStep === 'lessons') { setSingleStep('books'); return; }
  state = STATE.MENU;
  showScreen('startScreen');
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  if (getCharPool().length === 0) {
    let msg = '請至少選擇一課，才能開始練習喔！';
    if (rangeMode === 'combined') msg = '請至少勾選一個冊別，才能開始綜合練習喔！';
    else if (rangeMode === 'wrong') msg = '目前還沒有錯題記錄，請先去單冊或綜合關卡練習，答錯的題目才會自動收錄進來喔！';
    alert(msg);
    return;
  }
  startGame();
});

document.getElementById('selectAllBooks')?.addEventListener('click', () => {
  if (typeof CHAR_BOOKS === 'undefined') return;
  combinedBooks = new Set(CHAR_BOOKS.map(b => b.book));
  document.querySelectorAll('#combinedBookGrid .cat-btn').forEach(b => b.classList.add('active'));
});
document.getElementById('selectNoneBooks')?.addEventListener('click', () => {
  combinedBooks.clear();
  document.querySelectorAll('#combinedBookGrid .cat-btn').forEach(b => b.classList.remove('active'));
});

// 常錯題目關卡：顯示目前的錯題記錄（依錯誤次數由高到低排序）
function buildWrongPanel() {
  const container = document.getElementById('wrongList');
  const titleEl = document.getElementById('wrongPanelTitle');
  if (!container) return;

  const entries = Object.entries(wrongHistory).sort((a, b) => b[1].count - a[1].count);
  if (titleEl) titleEl.textContent = `常錯題目關卡：越常答錯的字/詞，出現機率越高（目前共 ${entries.length} 項記錄）`;

  container.innerHTML = '';
  if (entries.length === 0) {
    const p = document.createElement('div');
    p.className = 'review-empty';
    p.textContent = '目前還沒有錯題記錄，先去「單冊模式」或「綜合關卡」練習，答錯的題目會自動收錄在這裡！';
    container.appendChild(p);
    return;
  }

  entries.forEach(([hanzi, entry]) => {
    const row = document.createElement('div');
    row.className = 'stat-row review-row';
    row.innerHTML = `<span>${hanzi}　(${entry.pinyin})</span><span class="review-answer">答錯 ${entry.count} 次</span>`;
    container.appendChild(row);
  });
}

document.getElementById('clearWrongHistory')?.addEventListener('click', () => {
  if (!confirm('確定要清除所有的錯題記錄嗎？這個動作無法復原。')) return;
  wrongHistory = {};
  saveWrongHistory();
  buildWrongPanel();
});

document.getElementById('selectAllLessons')?.addEventListener('click', () => {
  document.querySelectorAll('#lessonList input[type=checkbox]').forEach(cb => {
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
  });
});
document.getElementById('selectNoneLessons')?.addEventListener('click', () => {
  document.querySelectorAll('#lessonList input[type=checkbox]').forEach(cb => {
    if (cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
  });
});

// Pause screen
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('pauseMenuBtn').addEventListener('click', goToMenu);

// Game over screen
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('overMenuBtn').addEventListener('click', goToMenu);

// 錯題複習畫面 → 查看遊戲成果
document.getElementById('toResultsBtn')?.addEventListener('click', () => {
  showScreen('gameoverScreen');
});

// Fullscreen toggle
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Fullscreen request failed:', err);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

const fsBtn = document.getElementById('fullscreenBtn');
if (fsBtn) {
  fsBtn.addEventListener('click', toggleFullscreen);
}

document.addEventListener('fullscreenchange', () => {
  if (fsBtn) {
    fsBtn.textContent = document.fullscreenElement ? '🗗 視窗化' : '⛶ 全螢幕';
  }
  resize();
});

// ── Wave completion ────────────────────────────
function checkWaveComplete() {
  if (!waveDone && spawnedThisWave >= waveEnemyCount && enemies.length === 0) {
    waveDone = true;
    wave++;
    updateHUD();
    setTimeout(() => {
      if (state === STATE.PLAYING) rbHoldZ(() => startWave());
    }, 1500);
  }
}

// ── Grid / scanlines overlay ───────────────────
function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,100,200,0.04)';
  ctx.lineWidth = 1;
  const spacing = 60;
  for (let x = 0; x < canvas.width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

// ── Target line ────────────────────────────────
function drawTargetLine() {
  const y = ship.cy;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,245,255,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Main Loop ──────────────────────────────────
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  drawBackground();
  drawGrid();

  const SHIP_HIT_RADIUS = 34; // 敵人與太空船的距離小於此值，視為撞擊

  if (state === STATE.PLAYING) {
    trySpawn(dt);
    updateChineseLock();

    // Update & draw bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].update();
      if (bullets[i].life <= 0) { bullets.splice(i, 1); continue; }
      bullets[i].draw();
    }

    // Update & draw enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      enemies[i].update(dt);
      const hdx = enemies[i].x - ship.cx;
      const hdy = enemies[i].y - ship.cy;
      if (hdx * hdx + hdy * hdy < SHIP_HIT_RADIUS * SHIP_HIT_RADIUS) {
        enemyReached(enemies[i]);
      }
    }
    // 目前要作答的目標（鎖定敵艦）最後畫，確保它的字一定在最上面，不會被其他敵艦蓋住
    for (const en of enemies) {
      if (en !== lockedTarget) en.draw();
    }
    if (lockedTarget) lockedTarget.draw();

    checkWaveComplete();
    drawTargetLine();
    drawShip();
    updateParticles(dt);
    drawFloaters();
  } else if (state === STATE.PAUSED || state === STATE.GAMEOVER || state === STATE.MINI) {
    for (const en of enemies) en.draw();
    drawShip();
  } else {
    // MENU or CATEGORIES — draw animated demo ships
    drawMenuShips(dt);
  }
}

// ── Menu animated ships ────────────────────────
let menuShips = [];
function initMenuShips() {
  menuShips = [];
  for (let i = 0; i < 6; i++) {
    const target = pickChineseTarget() || { hanzi: '字', pinyin: 'zì' };
    const e = new Enemy(target, Math.random() * window.innerWidth);
    e.y = Math.random() * window.innerHeight * 0.7;
    e.speed = 0.25 + Math.random() * 0.25;
    menuShips.push(e);
  }
}
initMenuShips();

function drawMenuShips(dt) {
  for (const s of menuShips) {
    s.update(dt);
    s.draw();
    if (s.y > canvas.height + 40) {
      s.y = -40;
      s.x = Math.random() * canvas.width;
    }
  }
}

// ── Utilities ──────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Kick off ───────────────────────────────────
showScreen('startScreen');
requestAnimationFrame(gameLoop);
