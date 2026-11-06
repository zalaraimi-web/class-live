/* Shared helpers for the teacher board and the student page. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SHAPES = ['▲', '◆', '●', '■'];
const shape = i => `<span class="shape s${i}" aria-hidden="true"></span>`;
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const fmt = n => Number(n || 0).toLocaleString('en-US');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function teacherHeader() { const k = store.get('classlive.key'); return k ? { 'X-Teacher-Key': k } : {}; }
async function getJSON(url) {
  const r = await fetch(url, { headers: teacherHeader() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Something went wrong'); e.status = r.status; e.needPassword = !!d.needPassword; e.localOnly = !!d.localOnly; throw e; }
  return d;
}
async function post(url, body, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...teacherHeader() }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = r.status; e.needPassword = !!data.needPassword; e.localOnly = !!data.localOnly; throw e; }
      return data;
    } catch (e) {
      if (e.status || attempt >= retries) throw e;          // server answered with an error: don't retry
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
    }
  }
}

let toastTimer;
function toast(msg, ms = 2600) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* Server clock sync so every screen shows the same countdown */
const clock = {
  offset: 0, samples: [],
  sync(serverNow) {
    this.samples.push(serverNow - Date.now()); if (this.samples.length > 8) this.samples.shift();
    this.offset = Math.max(...this.samples);   // the least-delayed sample is closest to the truth
  },
  now() { return Date.now() + this.offset; },
};
function timeLeft(timer) {
  if (!timer) return 0;
  if (timer.paused) return timer.remaining;
  return Math.max(0, timer.endsAt - clock.now());
}

/* Live connection (Server-Sent Events) with automatic reconnect + visible status */
function connect(url, handlers, onStatus) {
  let es, alive = false, deadTimer;
  const open = () => {
    es = new EventSource(url);
    es.addEventListener('open', () => { alive = true; clearTimeout(deadTimer); onStatus?.(true); });
    es.addEventListener('state', e => { alive = true; onStatus?.(true); handlers.state?.(JSON.parse(e.data)); });
    for (const k of ['invalid', 'kicked', 'closed']) es.addEventListener(k, () => { es.close(); handlers[k]?.(); });
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) { setTimeout(open, 1500); }   // browser gave up: reopen ourselves
      clearTimeout(deadTimer); deadTimer = setTimeout(() => onStatus?.(false), 1200);
    });
  };
  open();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && es.readyState === EventSource.CLOSED) open(); });
  window.addEventListener('online', () => { if (es.readyState !== EventSource.OPEN) { es.close(); open(); } });
  return { close: () => es.close(), reopen: () => { es.close(); open(); } };
}

/* Tiny synth for game sounds (no audio files needed) */
const sfx = {
  ctx: null, on: true, musicTimer: null,
  ac() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } if (this.ctx?.state === 'suspended') this.ctx.resume(); return this.ctx; },
  tone(freq, dur = .15, type = 'sine', vol = .15, delay = 0) {
    if (!this.on) return; const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
  },
  join() { this.tone(660, .12, 'triangle', .18); this.tone(990, .16, 'triangle', .15, .08); },
  tick(final) { this.tone(final ? 880 : 520, .08, 'square', .06); },
  start() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .22, 'triangle', .16, i * .09)); },
  correct() { [660, 880, 1320].forEach((f, i) => this.tone(f, .2, 'triangle', .16, i * .08)); },
  wrong() { this.tone(220, .3, 'sawtooth', .08); this.tone(180, .35, 'sawtooth', .07, .12); },
  reveal() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, .3, 'sine', .14, i * .06)); },
  fanfare() { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, .28, 'triangle', .16, i * .14)); },
  music(on, tempo = 300) {
    clearInterval(this.musicTimer); this.musicTimer = null; if (!on) return;
    const seq = [262, 330, 392, 523, 392, 330, 294, 370, 440, 587, 440, 370], bass = [131, 131, 147, 147];
    let i = 0;
    this.musicTimer = setInterval(() => { this.tone(seq[i % seq.length], .18, 'triangle', .045); if (i % 3 === 0) this.tone(bass[(i / 3 | 0) % 4], .3, 'sine', .07); i++; }, tempo);
  },
};

/* Confetti burst */
function confetti(ms = 4500) {
  let c = $('#confetti'); if (!c) { c = document.createElement('canvas'); c.id = 'confetti'; document.body.append(c); }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = c.getContext('2d'); const W = c.width = innerWidth, H = c.height = innerHeight;
  const cols = ['#d4af37', '#ecc95c', '#13254f', '#1b3366', '#f9c0d3', '#b5d9f6', '#a5e2c8', '#fbd97a'];
  const ps = Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .6, vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4, r: 5 + Math.random() * 7, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0] }));
  const end = performance.now() + ms;
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (t < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(performance.now());
}

/* ================= Certificates (poster style: cream paper, navy & gold) ================= */
function openCertificates(people, meta, { teacherTools = false } = {}) {
  const w = window.open('', '_blank');
  if (!w) { toast('Please allow pop-ups to open the certificates'); return; }
  const B = typeof BRAND !== 'undefined' ? BRAND : {}, A = typeof ART !== 'undefined' ? ART : {};
  const saved = store.get('classlive.cert') || { teacher: B.certificateTeacher || '', school: B.school || '' };
  const ORIGIN = location.origin;
  const F3 = (txt, col) => typeof fx3d === 'function' ? fx3d(txt, col, 'serif') : esc(txt);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const kind = r => r === 1 ? { t: 'Champion', s: 'Certificate of Excellence', note: '#fbd97a' } : r === 2 ? { t: 'Second Place', s: 'Certificate of Achievement', note: '#b5d9f6' }
    : r === 3 ? { t: 'Third Place', s: 'Certificate of Achievement', note: '#a5e2c8' } : { t: 'Participant', s: 'Certificate of Participation', note: '#f9c0d3' };
  const cert = p => {
    const k = kind(p.rank);
    return `<section class="cert r${Math.min(p.rank, 4)}"><div class="sheet">
      <div class="crown">${A.crown || '👑'}</div>
      <h1>${F3("Certificate", "gold")}</h1>
      <div class="brush">${esc(k.s)}</div>
      <div class="presented">Proudly presented to</div>
      <div class="name" dir="auto">${esc(p.avatar || '')} ${esc(p.name)}</div>
      <div class="hl">${p.rank <= 3 ? `${esc(k.t)} &nbsp;·&nbsp; ${ordinal(p.rank)} of ${meta.players}` : 'In recognition of participation'}</div>
      <div class="for">in the live class competition <b dir="auto">“${esc(meta.title)}”</b></div>
      <div class="stats"><span>${fmt(p.score)} points</span><span>${p.correct}/${meta.total} correct</span>${p.bestStreak > 1 ? `<span>🔥 streak ${p.bestStreak}</span>` : ''}</div>
      <div class="sign">
        <div class="col"><img class="sigimg" src="${ORIGIN}${B.signature || '/signature-navy.png'}" alt=""><span class="t-teacher" dir="auto">${esc(saved.teacher) || 'Teacher'}</span></div>
        <div class="medal" style="--n:${k.note}"><b>${p.rank <= 3 ? p.rank : '★'}</b></div>
        <div class="col"><div class="dt">${esc(date)}</div><span class="t-school" dir="auto">${esc(saved.school) || 'Date'}</span></div>
      </div>
    </div></section>`;
  };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificates · ${esc(meta.title)}</title>
<link rel="stylesheet" href="${ORIGIN}/common.css">
<style>
  @page{size:A4 landscape;margin:0}
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{background:#e9dfcc;background-image:none;font-family:'Baloo Bhaijaan 2',system-ui,sans-serif;color:#13254f}
  .tools{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:center;padding:.8rem;background:#13254f;border-bottom:4px solid #d4af37}
  .tools input,.tools select{padding:.5em .8em;border-radius:10px;border:2px solid #d4af37;background:#fff;color:#13254f;font:inherit;font-weight:700}
  .tools button{padding:.55em 1.3em;border-radius:999px;border:2px solid #a8841f;font:inherit;font-weight:800;cursor:pointer;color:#13254f;background:linear-gradient(180deg,#fbe9a8,#ecc95c 40%,#d4af37 70%,#b8922a);box-shadow:0 4px 0 #a8841f}
  .tools .hint{color:#f3d98a;font-size:.9rem}
  .cert{width:min(96vw,1123px);aspect-ratio:297/210;margin:1.2rem auto;container-type:inline-size;break-after:page}
  .sheet{position:relative;height:100%;overflow:hidden;padding:3.4cqw 8cqw 2.6cqw;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
    background:radial-gradient(70% 60% at 15% 0%,#fffdf7,transparent 70%),linear-gradient(160deg,#fbf6ec,#f3e8d2);
    border:.9cqw solid #13254f;outline:.3cqw solid #d4af37;outline-offset:-1.9cqw;box-shadow:0 12px 40px rgba(92,70,30,.35)}
  .dd{position:absolute;opacity:.9}.dd svg{width:100%;height:100%;display:block}
  .plane{top:3.5cqw;left:4cqw;width:8cqw;transform:rotate(-8deg)}.trail{top:8cqw;left:9cqw;width:9cqw;opacity:.6}
  .s1{top:5cqw;right:22cqw;width:2.6cqw}.s2{bottom:14cqw;left:5cqw;width:2.6cqw}.s3{top:20cqw;right:5cqw;width:3cqw}
  .bulb{top:4cqw;right:5cqw;width:5.5cqw}.sky{bottom:3cqw;right:3cqw;width:13cqw;opacity:.95;rotate:2deg}
  .crown{width:9cqw;margin-bottom:-1.4cqw}.crown svg{width:100%;display:block}
  h1{font-size:6.8cqw;line-height:1.05;margin:-.4cqw 0 .6cqw}
  .brush{display:inline-block;background:#13254f;color:#fff;padding:.5cqw 2.6cqw;border-radius:999px;font-weight:700;font-size:1.3cqw;letter-spacing:.2em;text-transform:uppercase}
  .presented{font-family:'CL Title',Lora,Georgia,serif;font-style:italic;font-weight:700;font-size:1.9cqw}
  .name{font-family:'Lilita One','Baloo Bhaijaan 2',sans-serif;font-size:5.6cqw;line-height:1.05;color:#13254f;max-width:88%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    text-shadow:0 .3cqw 0 #0a1530,.25cqw .25cqw 0 #fff,-.25cqw -.25cqw 0 #fff,.25cqw -.25cqw 0 #fff,-.25cqw .25cqw 0 #fff}
  .hl{display:inline-block;border-top:.15cqw solid #d4af37;border-bottom:.15cqw solid #d4af37;padding:.3cqw 2.6cqw;font-family:'CL Title',Lora,Georgia,serif;font-style:italic;font-weight:700;font-size:2.1cqw}
  .for{font-size:1.75cqw;font-weight:600}
  .for b{color:#13254f;font-weight:800}
  .stats{display:flex;gap:1.2cqw}
  .stats span{border:.15cqw solid #d4af37;border-radius:999px;padding:.3cqw 1.6cqw;font-size:1.3cqw;font-weight:800;background:#fffdf7}
  
  .sign{width:84%;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:3cqw}
  .col{display:flex;flex-direction:column;align-items:center;gap:.3cqw;border-top:.2cqw solid #13254f;padding-top:.4cqw}
  .col .sigimg{height:6.2cqw;width:auto;margin-top:-6.6cqw;margin-bottom:.2cqw}
  .col .script{font-family:'Great Vibes','Segoe Script','Snell Roundhand',cursive;font-size:3.2cqw;line-height:1;min-height:3cqw;margin-top:-3.4cqw;white-space:nowrap}
  .col .dt{font-weight:800;font-size:1.6cqw;margin-top:-2.6cqw}
  .col span{font-size:1.1cqw;letter-spacing:.2em;text-transform:uppercase;font-weight:700}
  .medal{width:8.5cqw;height:8.5cqw;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,#fff2c2,#e2bf55 45%,#a8841f);
    box-shadow:0 0 0 .5cqw #13254f,0 0 0 .8cqw #d4af37,0 .8cqw 1.6cqw rgba(0,0,0,.3);position:relative}
  .medal::before,.medal::after{content:'';position:absolute;top:80%;width:2.4cqw;height:4cqw;background:#13254f;z-index:-1;clip-path:polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)}
  .medal::before{left:1.6cqw;rotate:18deg}.medal::after{right:1.6cqw;rotate:-18deg;background:#d4af37}
  .medal b{font-family:'Lilita One',sans-serif;font-weight:400;font-size:4cqw;color:#13254f}
  .note{position:absolute;bottom:3.4cqw;left:3.4cqw;width:15cqw;background:#f9c0d3;padding:.9cqw 1cqw;font-family:Caveat,cursive;font-weight:700;font-size:1.6cqw;line-height:1.1;rotate:-4deg;box-shadow:0 .8cqw 1.2cqw -.6cqw rgba(92,70,30,.45);text-align:left}
  @media print{body{background:none}.tools{display:none}.cert{width:297mm;height:210mm;margin:0}.sheet{box-shadow:none}}
</style></head><body>
${teacherTools ? `<div class="tools"><input id="tName" placeholder="Teacher's name" value="${esc(saved.teacher)}" dir="auto"><input id="tSchool" placeholder="School name" value="${esc(saved.school)}" dir="auto">
  <select id="which"><option value="all">All students (${people.length})</option><option value="top">Top 3 only</option></select>
  <button onclick="print()">🖨 Print / Save as PDF</button><span class="hint">Tip: choose “Landscape” and turn on “Background graphics”.</span></div>`
  : `<div class="tools"><button onclick="print()">⬇ Save my certificate</button><span class="hint">Or take a screenshot!</span></div>`}
<div id="certs">${people.map(cert).join('')}</div>
</body></html>`);
  w.document.close();
  if (teacherTools) {
    const d = w.document, upd = () => {
      const t = d.getElementById('tName').value, sc = d.getElementById('tSchool').value;
      store.set('classlive.cert', { teacher: t, school: sc });
      d.querySelectorAll('.t-teacher').forEach(e => e.textContent = t || 'Teacher');
      d.querySelectorAll('.t-school').forEach(e => e.textContent = sc || 'Date');
    };
    d.getElementById('tName').oninput = upd; d.getElementById('tSchool').oninput = upd;
    d.getElementById('which').onchange = e => d.querySelectorAll('.cert').forEach(c => c.style.display = e.target.value === 'top' && c.classList.contains('r4') ? 'none' : '');
  }
}
