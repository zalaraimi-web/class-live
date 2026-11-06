/*
 * Class Live — live classroom quiz competition server.
 * Zero dependencies: needs only Node.js 18+ (no npm install).
 *
 *   node server.js            → teacher board:  http://localhost:3000
 *                               student phones: http://<your-laptop-ip>:3000/play
 *
 * Real-time sync uses Server-Sent Events (auto-reconnecting) + small POSTs.
 * Game state is saved to data/games.json so even a server restart keeps scores.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
let port = PORT;                       // may move up if 3000 is busy
const OPEN_BROWSER = process.argv.includes('--open');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const QUIZ_DIR = path.join(ROOT, 'quizzes');
const DATA_DIR = path.join(ROOT, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'games.json');
const READY_MS = 4000;          // "get ready" screen before answers open
const GAME_TTL_MS = 12 * 3600e3; // forget games after 12 hours
const MAX_PLAYERS = 120;
// Teacher password: set TEACHER_PASSWORD on the hosting service. Left empty (e.g. on your own laptop) = no password.
const TEACHER_PASSWORD = String(process.env.TEACHER_PASSWORD || '');
const isLocal = req => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(String(req.socket.remoteAddress || '')) && !req.headers['x-forwarded-for'];
function teacherOk(req) {
  if (!TEACHER_PASSWORD) return isLocal(req);   // no password: only the computer running the game is the teacher
  const got = Buffer.from(String(req.headers['x-teacher-key'] || ''));
  const want = Buffer.from(TEACHER_PASSWORD);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const denied = res => json(res, 401, TEACHER_PASSWORD ? { error: 'Teacher password required', needPassword: true }
  : { error: 'Open the teacher board on the computer that is running Class Live.', localOnly: true });

for (const d of [QUIZ_DIR, DATA_DIR]) fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------------ utils */
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();
const clean = (s, max) => String(s ?? '')
  .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

function lanAddress() {
  const cands = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = 0;
      if (a.address.startsWith('192.168.')) score = 3;
      else if (a.address.startsWith('10.')) score = 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score = 1;
      if (/^(en|eth|wlan|wl)\d/i.test(name)) score += 2;          // Wi-Fi / Ethernet (en0 on a Mac)
      if (/vbox|vmnet|docker|veth|br-|bridge|utun|awdl|llw|anpi|virtual|vethernet|wsl|tailscale|zt/i.test(name)) score -= 5;
      if (a.address.startsWith('169.254.')) score -= 10;          // no real network
      cands.push({ address: a.address, score });
    }
  }
  cands.sort((x, y) => y.score - x.score);
  return cands[0]?.address || 'localhost';
}

function joinBaseFor(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (host && !['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return `${proto}://${host}`;
  return `http://${lanAddress()}:${port}`;
}

/* ---------------------------------------------------------------- quizzes */
function validateQuiz(q) {
  if (!q || typeof q !== 'object') throw new Error('Quiz is missing');
  const title = clean(q.title, 80) || 'Untitled quiz';
  const category = clean(q.category, 60);
  if (!Array.isArray(q.questions) || !q.questions.length) throw new Error('The quiz needs at least one question');
  if (q.questions.length > 100) throw new Error('Maximum 100 questions per quiz');
  const questions = q.questions.map((x, i) => {
    const text = clean(x.text, 300);
    if (!text) throw new Error(`Question ${i + 1} has no text`);
    const options = (Array.isArray(x.options) ? x.options : []).map(o => clean(o, 120)).filter(Boolean).slice(0, 4);
    if (options.length < 2) throw new Error(`Question ${i + 1} needs at least 2 answers`);
    let correct = Array.isArray(x.correct) ? x.correct : [x.correct];
    correct = [...new Set(correct.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < options.length))];
    if (!correct.length) throw new Error(`Question ${i + 1} has no correct answer marked`);
    const time = Math.min(240, Math.max(5, Math.round(Number(x.time) || 20)));
    const points = [0, 1, 2].includes(Number(x.points)) ? Number(x.points) : 1;
    const image = /^https?:\/\/\S{3,500}$/i.test(String(x.image || '')) ? String(x.image) : '';
    const explain = clean(x.explain, 300);                      // short explanation shown after answering
    return { text, options, correct, time, points, image, explain };
  });
  return { title, category, questions };
}

function listQuizzes() {
  return fs.readdirSync(QUIZ_DIR).filter(f => f.endsWith('.json')).map(f => {
    try {
      const q = validateQuiz(JSON.parse(fs.readFileSync(path.join(QUIZ_DIR, f), 'utf8')));
      return { id: f.slice(0, -5), title: q.title, category: q.category, count: q.questions.length, mtime: fs.statSync(path.join(QUIZ_DIR, f)).mtimeMs };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}
function loadQuiz(id) {
  if (!/^[a-z0-9-]{1,80}$/.test(String(id))) throw new Error('Unknown quiz');
  const file = path.join(QUIZ_DIR, id + '.json');
  if (!fs.existsSync(file)) throw new Error('Quiz not found');
  return validateQuiz(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function saveQuiz(quiz) {
  const q = validateQuiz(quiz);
  let base = q.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'quiz';
  let id = base, n = 2;
  if (quiz.id && /^[a-z0-9-]{1,80}$/.test(quiz.id) && fs.existsSync(path.join(QUIZ_DIR, quiz.id + '.json'))) id = quiz.id; // overwrite (edit)
  else while (fs.existsSync(path.join(QUIZ_DIR, id + '.json'))) id = `${base}-${n++}`;
  fs.writeFileSync(path.join(QUIZ_DIR, id + '.json'), JSON.stringify(q, null, 2));
  return id;
}

/* ------------------------------------------------------------------ games */
const games = new Map();   // pin -> game
const conns = new Map();   // pin -> Set<{res, role, pid}>

function newPin() {
  for (;;) { const p = String(crypto.randomInt(100000, 1000000)); if (!games.has(p)) return p; }
}

function createGame(quiz, settings, joinBase) {
  const g = {
    pin: newPin(), hostToken: rid(), quiz, joinBase, createdAt: now(), touchedAt: now(),
    settings: {
      feedback: settings?.feedback === 'reveal' ? 'reveal' : 'instant',
      lateJoin: settings?.lateJoin !== false,
      shuffle: !!settings?.shuffle,
    },
    locked: false, phase: 'lobby', qIndex: -1, order: [],
    timer: { endsAt: 0, duration: 0, paused: false, remaining: 0 },
    players: {}, round: 0,
  };
  g.order = quiz.questions.map((_, i) => i);
  if (g.settings.shuffle) shuffle(g.order);
  games.set(g.pin, g);
  return g;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const currentQ = g => (g.qIndex >= 0 && g.qIndex < g.order.length) ? g.quiz.questions[g.order[g.qIndex]] : null;
const activePlayers = g => Object.values(g.players);
const isConnected = (g, pid) => { for (const c of conns.get(g.pin) || []) if (c.pid === pid) return true; return false; };

function ranked(g) {
  return activePlayers(g).slice().sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}
function rankMap(g) {
  const m = {}; let lastScore = null, lastRank = 0;
  ranked(g).forEach((p, i) => { if (p.score !== lastScore) { lastRank = i + 1; lastScore = p.score; } m[p.id] = lastRank; });
  return m;
}

/* timers: one per game */
const timers = new Map();
function clearTimer(g) { clearTimeout(timers.get(g.pin)); timers.delete(g.pin); }
function armTimer(g) {
  clearTimer(g);
  if (g.timer.paused || !['ready', 'question'].includes(g.phase)) return;
  const ms = Math.max(0, g.timer.endsAt - now());
  timers.set(g.pin, setTimeout(() => onTimer(g.pin), ms + 30));
}
function onTimer(pin) {
  const g = games.get(pin); if (!g || g.timer.paused) return;
  if (now() < g.timer.endsAt - 5) return armTimer(g);
  if (g.phase === 'ready') openAnswers(g);
  else if (g.phase === 'question') toReveal(g);
}

function startPhaseTimer(g, ms) { g.timer = { endsAt: now() + ms, duration: ms, paused: false, remaining: ms }; armTimer(g); }

function toReady(g) {
  g.qIndex += 1;
  if (g.qIndex >= g.order.length) return toFinal(g);
  const ranks = rankMap(g);
  for (const p of activePlayers(g)) { p.prevRank = ranks[p.id]; p.lastPoints = 0; p.lastCorrect = null; }
  g.phase = 'ready'; startPhaseTimer(g, READY_MS);
}
function openAnswers(g) {
  const q = currentQ(g);
  g.phase = 'question'; startPhaseTimer(g, q.time * 1000); changed(g);
}
function toReveal(g) {
  clearTimer(g);
  const qi = g.qIndex;
  for (const p of activePlayers(g)) {             // players who did not answer lose their streak
    if (!p.answers[qi]) { p.streak = 0; p.lastPoints = 0; p.lastCorrect = null; }
  }
  g.phase = 'reveal'; g.timer.paused = false; changed(g);
}
function toLeaderboard(g) { g.phase = 'leaderboard'; changed(g); }
function toFinal(g) { clearTimer(g); g.phase = 'final'; g.timer.paused = false; changed(g); }

function maybeAllAnswered(g) {
  if (g.phase !== 'question') return;
  const online = activePlayers(g).filter(p => isConnected(g, p.id) || p.answers[g.qIndex]);
  if (!online.length) return;
  if (online.every(p => p.answers[g.qIndex])) {
    clearTimer(g);
    timers.set(g.pin, setTimeout(() => { const gg = games.get(g.pin); if (gg && gg.phase === 'question' && !gg.timer.paused) toReveal(gg); }, 900));
  }
}

function hostAction(g, action, body) {
  switch (action) {
    case 'start':
      if (g.phase !== 'lobby') throw new Error('Game already started');
      if (!activePlayers(g).length) throw new Error('Wait for at least one student to join');
      toReady(g); break;
    case 'next':
      if (g.phase === 'ready') openAnswers(g);
      else if (g.phase === 'question') toReveal(g);
      else if (g.phase === 'reveal') toLeaderboard(g);
      else if (g.phase === 'leaderboard') toReady(g);
      else if (g.phase === 'lobby') return hostAction(g, 'start');
      break;
    case 'pause':
      if (!['ready', 'question'].includes(g.phase) || g.timer.paused) break;
      g.timer.remaining = Math.max(0, g.timer.endsAt - now()); g.timer.paused = true; clearTimer(g); break;
    case 'resume':
      if (!g.timer.paused) break;
      g.timer.paused = false; g.timer.endsAt = now() + Math.max(g.timer.remaining, 3000); armTimer(g); break;
    case 'addtime':
      if (g.phase !== 'question') break;
      if (g.timer.paused) g.timer.remaining += 10000; else { g.timer.endsAt += 10000; armTimer(g); }
      g.timer.duration += 10000; break;
    case 'end': toFinal(g); break;
    case 'again':
      clearTimer(g);
      for (const p of activePlayers(g)) Object.assign(p, { score: 0, streak: 0, answers: {}, prevRank: null, lastPoints: 0, lastCorrect: null, correctCount: 0 });
      g.order = g.quiz.questions.map((_, i) => i); if (g.settings.shuffle) shuffle(g.order);
      g.qIndex = -1; g.phase = 'lobby'; g.round += 1; g.locked = false; break;
    case 'lock': g.locked = true; break;
    case 'unlock': g.locked = false; break;
    case 'settings':
      if (body.feedback) g.settings.feedback = body.feedback === 'reveal' ? 'reveal' : 'instant';
      if (typeof body.lateJoin === 'boolean') g.settings.lateJoin = body.lateJoin;
      break;
    case 'kick': {
      const p = g.players[body.pid]; if (!p) break;
      delete g.players[p.id];
      for (const c of conns.get(g.pin) || []) if (c.pid === p.id) { sendEvent(c.res, 'kicked', {}); c.res.end(); }
      maybeAllAnswered(g); break;
    }
    case 'close':
      clearTimer(g);
      for (const c of conns.get(g.pin) || []) { sendEvent(c.res, 'closed', {}); c.res.end(); }
      games.delete(g.pin); conns.delete(g.pin); scheduleSave(); return;
    default: throw new Error('Unknown action');
  }
  changed(g);
}

function joinGame(g, name, avatar) {
  if (g.phase === 'final') throw new Error('This game has finished');
  if (g.locked) throw new Error('The teacher has locked this game');
  if (g.phase !== 'lobby' && !g.settings.lateJoin) throw new Error('The game has already started');
  if (activePlayers(g).length >= MAX_PLAYERS) throw new Error('The game is full');
  name = clean(name, 20);
  if (!name) throw new Error('Please type your name');
  const taken = new Set(activePlayers(g).map(p => p.name.toLocaleLowerCase()));
  let final = name, n = 2;
  while (taken.has(final.toLocaleLowerCase())) final = `${name.slice(0, 17)} ${n++}`;
  const p = {
    id: rid(6), token: rid(), name: final, avatar: AVATARS.includes(avatar) ? avatar : AVATARS[crypto.randomInt(0, AVATARS.length)],
    score: 0, streak: 0, bestStreak: 0, correctCount: 0, answers: {}, joinedAt: now(), prevRank: null, lastPoints: 0, lastCorrect: null,
  };
  g.players[p.id] = p; changed(g);
  return p;
}

function submitAnswer(g, p, qIndex, choice) {
  if (g.phase !== 'question' || qIndex !== g.qIndex) throw new Error('This question is closed');
  if (g.timer.paused) throw new Error('The game is paused');
  if (p.answers[qIndex]) return p.answers[qIndex]; // idempotent (safe retries after a network blip)
  const q = currentQ(g);
  choice = Number(choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new Error('Invalid answer');
  const remaining = Math.max(0, g.timer.endsAt - now());
  const elapsed = Math.max(0, g.timer.duration - remaining);
  const correct = q.correct.includes(choice);
  let points = 0;
  if (correct) {
    p.streak += 1; p.correctCount += 1; p.bestStreak = Math.max(p.bestStreak, p.streak);
    const speed = 1 - Math.min(1, elapsed / g.timer.duration) / 2;          // 1000 → 500 by speed
    points = Math.round(1000 * speed * q.points);
    if (q.points > 0 && p.streak >= 2) points += 100 * Math.min(p.streak - 1, 5); // streak bonus up to +500
  } else p.streak = 0;
  p.score += points;
  p.lastPoints = points; p.lastCorrect = correct;
  p.answers[qIndex] = { choice, correct, points, ms: elapsed };
  changed(g); maybeAllAnswered(g);
  return p.answers[qIndex];
}

/* ------------------------------------------------------------- snapshots */
function hostView(g) {
  const q = currentQ(g), qi = g.qIndex, ranks = rankMap(g);
  const players = ranked(g).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, score: p.score, rank: ranks[p.id], prevRank: p.prevRank,
    connected: isConnected(g, p.id), answered: !!p.answers[qi], lastPoints: p.lastPoints, lastCorrect: p.lastCorrect,
    streak: p.streak, correctCount: p.correctCount, bestStreak: p.bestStreak,
    answers: p.answers,
  }));
  const answeredN = players.filter(p => p.answered).length;
  const online = players.filter(p => p.connected || p.answered).length;
  let dist = null;
  if (q && ['reveal', 'leaderboard'].includes(g.phase)) {
    dist = q.options.map(() => 0);
    for (const p of activePlayers(g)) { const a = p.answers[qi]; if (a) dist[a.choice] += 1; }
  }
  return {
    role: 'host', pin: g.pin, joinBase: g.joinBase, joinUrl: `${g.joinBase}/play?pin=${g.pin}`,
    phase: g.phase, qIndex: qi, total: g.order.length, title: g.quiz.title, category: g.quiz.category || '', round: g.round,
    question: q ? { ...q } : null, timer: g.timer, serverNow: now(), settings: g.settings, locked: g.locked,
    players, counts: { players: players.length, connected: players.filter(p => p.connected).length, answered: answeredN, thinking: Math.max(0, online - answeredN) },
    dist, questions: g.quiz.questions.length,
  };
}

function playerView(g, p) {
  const q = currentQ(g), qi = g.qIndex, ranks = rankMap(g), order = ranked(g);
  const showQ = q && ['ready', 'question', 'reveal', 'leaderboard'].includes(g.phase);
  const myAns = p.answers[qi] || null;
  const reveal = ['reveal', 'leaderboard'].includes(g.phase);
  const instant = g.settings.feedback === 'instant';
  const myRank = ranks[p.id];
  const idx = order.findIndex(x => x.id === p.id);
  const ahead = idx > 0 ? order[idx - 1] : null;
  const answeredN = activePlayers(g).filter(x => x.answers[qi]).length;
  return {
    role: 'player', pin: g.pin, phase: g.phase, qIndex: qi, total: g.order.length, title: g.quiz.title, category: g.quiz.category || '', round: g.round,
    serverNow: now(), timer: g.timer, playerCount: order.length, answeredCount: answeredN,
    question: showQ ? {
      text: q.text, image: q.image, time: q.time, points: q.points,
      options: g.phase === 'ready' ? [] : q.options,
      correct: reveal ? q.correct : undefined,
      // explanation: after the reveal, or straight after her own answer when feedback is instant
      explain: q.explain && (reveal || (instant && myAns)) ? q.explain : undefined,
    } : null,
    me: {
      id: p.id, name: p.name, avatar: p.avatar, score: p.score, rank: myRank, prevRank: p.prevRank, streak: p.streak,
      correctCount: p.correctCount, bestStreak: p.bestStreak,
      answer: myAns ? (reveal || instant ? myAns : { choice: myAns.choice }) : null,
      behind: ahead ? { name: ahead.name, by: ahead.score - p.score } : null,
    },
    top: ['leaderboard', 'final'].includes(g.phase) ? order.slice(0, g.phase === 'final' ? 3 : 5).map(x => ({ name: x.name, avatar: x.avatar, score: x.score, rank: ranks[x.id] })) : null,
  };
}

/* ------------------------------------------------------------ broadcasting */
const pending = new Set();
function changed(g) {
  g.touchedAt = now();
  if (pending.has(g.pin)) return;
  pending.add(g.pin);
  setTimeout(() => { pending.delete(g.pin); broadcast(g.pin); }, 40);
  scheduleSave();
}
function sendEvent(res, type, data) { try { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} }
function broadcast(pin) {
  const g = games.get(pin); if (!g) return;
  let hv = null;
  for (const c of conns.get(pin) || []) {
    if (c.role === 'host') sendEvent(c.res, 'state', hv ||= hostView(g));
    else { const p = g.players[c.pid]; if (p) sendEvent(c.res, 'state', playerView(g, p)); }
  }
}
setInterval(() => { for (const set of conns.values()) for (const c of set) { try { c.res.write(': ping\n\n'); } catch {} } }, 15000);

/* ------------------------------------------------------------- persistence */
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = [...games.values()].map(g => g);
    fs.writeFile(SAVE_FILE + '.tmp', JSON.stringify(data), err => { if (!err) fs.rename(SAVE_FILE + '.tmp', SAVE_FILE, () => {}); });
  }, 1000);
}
function restore() {
  try {
    const list = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    for (const g of list) {
      if (now() - g.touchedAt > GAME_TTL_MS) continue;
      if (['ready', 'question'].includes(g.phase) && !g.timer.paused) {   // server restarted mid-question: pause it safely
        g.timer.remaining = Math.max(3000, g.timer.endsAt - now()); g.timer.paused = true;
      }
      games.set(g.pin, g);
    }
    if (games.size) console.log(`  Restored ${games.size} game(s) from the last session.`);
  } catch {}
}
setInterval(() => { for (const g of games.values()) if (now() - g.touchedAt > GAME_TTL_MS && !(conns.get(g.pin)?.size)) { games.delete(g.pin); scheduleSave(); } }, 3600e3);

/* ------------------------------------------------------------------- http */
const AVATARS = ['🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🦋', '🐢', '🐬', '🦉', '🐧', '🐰', '🐱', '🐶', '🐻', '🐝', '🦒', '🐳', '🐞', '🦜', '🐪', '🦩', '🐠', '🦔', '🐲', '🌻', '⭐', '🚀', '🌈'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 512 * 1024) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
}
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
function hostGame(body) {
  const g = games.get(String(body.pin));
  if (!g || g.hostToken !== body.token) { const e = new Error('Game not found'); e.code = 404; throw e; }
  return g;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    /* pages */
    if (req.method === 'GET') {
      if (p === '/' || p === '/teacher' || p === '/board') return serveFile(res, path.join(PUB, 'teacher.html'));
      if (p === '/play' || p === '/join' || p === '/p') return serveFile(res, path.join(PUB, 'play.html'));
      if (p === '/api/quizzes') return teacherOk(req) ? json(res, 200, { quizzes: listQuizzes() }) : denied(res);
      if (p.startsWith('/api/quizzes/')) return teacherOk(req) ? json(res, 200, { quiz: loadQuiz(p.split('/').pop()) }) : denied(res);
      if (p === '/api/info') return json(res, 200, { app: 'class-live', joinBase: joinBaseFor(req), avatars: AVATARS, needsPassword: !!TEACHER_PASSWORD, lanOk: !!PUBLIC_URL || lanAddress() !== 'localhost' });
      if (p === '/api/check') { const g = games.get(url.searchParams.get('pin') || ''); return json(res, g ? 200 : 404, g ? { ok: true, title: g.quiz.title, phase: g.phase, locked: g.locked } : { error: 'No game with that PIN. Check the board!' }); }
      if (p === '/api/events') return openStream(req, res, url);
      const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = path.join(PUB, safe);
      if (file.startsWith(PUB) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const body = await readBody(req);

    if (p === '/api/teacher/login') {
      if (teacherOk(req)) return json(res, 200, { ok: true });
      await new Promise(r => setTimeout(r, 800));          // slow down guessing
      return json(res, 401, { error: 'Wrong password' });
    }
    if ((p === '/api/quizzes' || p === '/api/host/create') && !teacherOk(req)) return denied(res);
    if (p === '/api/quizzes') return json(res, 200, { id: saveQuiz(body.quiz) });
    if (p === '/api/host/create') {
      const quiz = body.quiz ? validateQuiz(body.quiz) : loadQuiz(body.quizId);
      const g = createGame(quiz, body.settings, joinBaseFor(req)); changed(g);
      console.log(`  New game ${g.pin}: "${quiz.title}" (${quiz.questions.length} questions)`);
      return json(res, 200, { pin: g.pin, token: g.hostToken });
    }
    if (p === '/api/host/action') { const g = hostGame(body); hostAction(g, String(body.action), body); return json(res, 200, { ok: true }); }
    if (p === '/api/join') {
      const g = games.get(String(body.pin || ''));
      if (!g) return json(res, 404, { error: 'No game with that PIN. Check the board!' });
      const pl = joinGame(g, body.name, body.avatar);
      return json(res, 200, { pin: g.pin, pid: pl.id, token: pl.token, name: pl.name });
    }
    if (p === '/api/answer') {
      const g = games.get(String(body.pin || '')); const pl = g?.players[body.pid];
      if (!g || !pl || pl.token !== body.token) return json(res, 404, { error: 'You are not in this game' });
      const a = submitAnswer(g, pl, Number(body.qIndex), body.choice);
      const instantFb = g.settings.feedback === 'instant';
      return json(res, 200, { ok: true, answer: instantFb ? a : { choice: a.choice }, explain: instantFb ? (currentQ(g)?.explain || '') : '' });
    }
    res.writeHead(404); res.end();
  } catch (e) {
    json(res, e.code === 404 ? 404 : 400, { error: e.message || 'Something went wrong' });
  }
}

function openStream(req, res, url) {
  const pin = url.searchParams.get('pin') || '', role = url.searchParams.get('role'), token = url.searchParams.get('token') || '';
  const pid = url.searchParams.get('pid') || '';
  const g = games.get(pin);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1500\n\n');
  const ok = g && (role === 'host' ? g.hostToken === token : g.players[pid]?.token === token);
  if (!ok) { sendEvent(res, 'invalid', {}); return res.end(); }
  const c = { res, role: role === 'host' ? 'host' : 'player', pid };
  if (!conns.has(pin)) conns.set(pin, new Set());
  conns.get(pin).add(c);
  req.socket.setKeepAlive(true);
  req.socket.setTimeout(0);
  sendEvent(res, 'state', c.role === 'host' ? hostView(g) : playerView(g, g.players[pid]));
  if (c.role === 'player') changed(g);   // teacher sees the student come online
  req.on('close', () => {
    conns.get(pin)?.delete(c);
    const gg = games.get(pin);
    if (gg && c.role === 'player') { changed(gg); maybeAllAnswered(gg); }
  });
}

restore();
const server = http.createServer(handle);
server.keepAliveTimeout = 65000;
function openBrowser(url) {
  if (!OPEN_BROWSER) return;
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { const c = require('child_process').spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch {}
}
function alreadyRunning(p) {      // is Class Live itself already on this port?
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port: p, path: '/api/info', timeout: 1500 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).app === 'class-live'); } catch { resolve(false); } });
    });
    r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}
server.on('error', async err => {
  if (err.code === 'EADDRINUSE') {
    if (await alreadyRunning(port)) {
      console.log(`\n  ★ Class Live is already running — opening the teacher board.\n`);
      openBrowser(`http://localhost:${port}`);
      return process.exit(0);
    }
    if (port < PORT + 20 && !process.env.PORT) { port += 1; return server.listen(port, '0.0.0.0'); }
  }
  console.error(`\n  ✖ Could not start Class Live: ${err.message}\n`);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log('\n  ★ Class Live is running!\n');
  console.log(`  Teacher board (open on the interactive board):  http://localhost:${port}`);
  if (lan === 'localhost' && !PUBLIC_URL) console.log('  ⚠  This computer is not connected to Wi-Fi — connect it so students can join.');
  else console.log(`  Students join on the same Wi-Fi at:             http://${lan}:${port}/play`);
  if (PUBLIC_URL) console.log(`  Public address:                                 ${PUBLIC_URL}`);
  console.log(TEACHER_PASSWORD ? '  Teacher screen is protected by a password.' : '  No teacher password set (fine on your own laptop).');
  console.log('\n  Keep this window open during the lesson. Close it (or press Ctrl+C) to stop.\n');
  openBrowser(`http://localhost:${port}`);
});
module.exports = { server, games };
