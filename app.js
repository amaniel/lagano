/* =============================================
   LAGANO — App Logic
   ============================================= */

// ─── State ────────────────────────────────────
let dataset = {};
let state = {
  isPremium: false,          // TODO: connect to payment
  streak: 0,
  streakRecord: 0,
  streakDays: [],            // array of date strings 'YYYY-MM-DD'
  learnedWords: {},          // { "daily:0": true, ... }
  sessions: 0,
  currentCategoryKey: null,
  exerciseWords: [],
  batches: [],
  batchIndex: 0,
  batchPairs: [],
  batchOrder: [],
  stateL: {},
  stateR: {},
  selectedL: null,
  selectedR: null,
  batchMatched: 0,
  totalMatched: 0,
  locked: false,
  mistakes: [],              // words answered wrong this session
};

const BATCH_SIZE = 5;
const SESSION_SIZE = 20;
const FREE_LIMIT_DEFAULT = 5; // for profanity category

// ─── Init ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initTelegram();
  loadTheme();
  loadState();
  await loadDataset();
  await checkPremium();
  renderHome();
  updateStreak();
});

async function checkPremium() {
  try {
    const res = await fetch('premium_users.json');
    const data = await res.json();
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && data.premium_users.includes(tgUser.id)) {
      state.isPremium = true;
      saveState();
    }
  } catch(e) {
    console.log('Premium check skipped:', e);
  }
}

function initTelegram() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    // Apply dark/light theme based on Telegram theme
    if (tg.colorScheme === 'dark') {
      document.body.classList.add('dark');
    }
  }
}

async function loadDataset() {
  try {
    const res = await fetch('dataset.json');
    dataset = await res.json();
  } catch (e) {
    console.error('Failed to load dataset:', e);
  }
}

// ─── LocalStorage ─────────────────────────────
function saveState() {
  try {
    localStorage.setItem('lagano_state', JSON.stringify({
      isPremium: state.isPremium,
      streak: state.streak,
      streakRecord: state.streakRecord,
      streakDays: state.streakDays,
      learnedWords: state.learnedWords,
      sessions: state.sessions,
    }));
  } catch(e) {}
}

function loadState() {
  try {
    const saved = localStorage.getItem('lagano_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
    }
  } catch(e) {}
}

// ─── Streak logic ─────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function updateStreak() {
  const today = todayStr();
  if (!state.streakDays.includes(today)) {
    // Don't add today yet — only after completing a session
  }
  // Calculate current streak
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const s = d.toISOString().slice(0, 10);
    if (state.streakDays.includes(s)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  state.streak = streak;
  if (streak > state.streakRecord) state.streakRecord = streak;

  document.getElementById('streak-count').textContent = streak;
}

function recordToday() {
  const today = todayStr();
  if (!state.streakDays.includes(today)) {
    state.streakDays.push(today);
    updateStreak();
    saveState();
  }
}

// ─── Screen navigation ─────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  window.scrollTo(0, 0);

  if (name === 'profile') renderProfile();
  if (name === 'home') renderHome();
  if (name === 'settings') initSettings();
}

// ─── Home ──────────────────────────────────────
function renderHome() {
  if (!Object.keys(dataset).length) return;

  // Count totals
  let totalWords = 0;
  let freeCount = 0;
  Object.values(dataset).forEach(cat => {
    totalWords += cat.words.length;
    if (cat.free) freeCount++;
  });

  document.getElementById('total-words').textContent = totalWords;
  document.getElementById('all-words-count').textContent = `${totalWords} слов вперемешку`;
  document.getElementById('free-count').textContent = `${freeCount} категории`;

  // Learned count
  const learnedCount = Object.keys(state.learnedWords).length;
  document.getElementById('learned-words').textContent = learnedCount;

  // Render categories
  const freeEl = document.getElementById('free-categories');
  const premiumEl = document.getElementById('premium-categories');
  freeEl.innerHTML = '';
  premiumEl.innerHTML = '';

  Object.entries(dataset).forEach(([key, cat]) => {
    const card = buildCategoryCard(key, cat);
    if (cat.free) {
      freeEl.appendChild(card);
    } else {
      premiumEl.appendChild(card);
    }
  });
}

function buildCategoryCard(key, cat) {
  const div = document.createElement('div');
  const isLocked = !cat.free && !state.isPremium;

  // For profanity: show limited free
  const isFreeWithLimit = cat.free && cat.free_limit;
  const wordCount = cat.words.length;
  const countText = isFreeWithLimit
    ? `${cat.free_limit} слов · потом 🔒`
    : `${wordCount} слов`;

  div.className = `cat-card${isLocked ? ' locked' : ''}`;
  div.innerHTML = `
    <div class="ibox ${isLocked ? 'cool' : 'warm'}">
      <i class="ti ${cat.icon}"></i>
    </div>
    <div class="cat-info">
      <div class="cat-name">${cat.title}</div>
      <div class="cat-count">${countText}</div>
    </div>
    ${isLocked
      ? '<i class="ti ti-lock cat-lock"></i>'
      : '<i class="ti ti-chevron-right cat-arrow"></i>'
    }
  `;

  div.addEventListener('click', () => {
    if (isLocked) {
      openPaywall(key, cat);
    } else {
      startExercise(key, cat);
    }
  });

  return div;
}

// ─── Paywall ───────────────────────────────────
function openPaywall(key, cat) {
  document.getElementById('paywall-icon').className = `ti ${cat.icon}`;
  document.getElementById('paywall-cat-name').textContent = cat.title;
  document.getElementById('paywall-overlay').classList.add('active');
}

function closePaywall() {
  document.getElementById('paywall-overlay').classList.remove('active');
}

function onSubscribe() {
  // TODO: integrate with payment system (Telegram Stars or Stripe)
  alert('Оплата будет доступна в ближайшее время!');
  closePaywall();
}

function onAllWordsClick() {
  if (!state.isPremium) {
    document.getElementById('paywall-icon').className = 'ti ti-books';
    document.getElementById('paywall-cat-name').textContent = 'Все слова';
    document.getElementById('paywall-overlay').classList.add('active');
  } else {
    startAllWords();
  }
}

function startAllWords() {
  const allWords = [];
  Object.entries(dataset).forEach(([key, cat]) => {
    cat.words.forEach((w, i) => {
      allWords.push({ ...w, _key: `${key}:${i}` });
    });
  });
  startExerciseFromWords('Все слова', 'all', allWords);
}

// ─── Exercise ──────────────────────────────────
function startExercise(key, cat) {
  state.currentCategoryKey = key;
  let words = cat.words.map((w, i) => ({ ...w, _key: `${key}:${i}` }));

  // For profanity: limit to free_limit if not premium
  if (cat.free_limit && !state.isPremium) {
    words = words.slice(0, cat.free_limit);
  }

  startExerciseFromWords(cat.title, key, words);
}

function startExerciseFromWords(title, key, words) {
  // Shuffle and take up to SESSION_SIZE
  const shuffled = shuffle([...words]);
  const sessionWords = shuffled.slice(0, SESSION_SIZE);

  state.exerciseWords = sessionWords;
  state.mistakes = [];
  state.totalMatched = 0;
  state.currentCategoryKey = key;

  // Split into batches
  state.batches = [];
  for (let i = 0; i < sessionWords.length; i += BATCH_SIZE) {
    state.batches.push(sessionWords.slice(i, i + BATCH_SIZE));
  }
  state.batchIndex = 0;

  document.getElementById('exercise-title').textContent = title;
  showScreen('exercise');
  loadBatch();
}

function loadBatch() {
  state.batchPairs = state.batches[state.batchIndex];
  state.batchOrder = shuffle([...state.batchPairs]);
  state.stateL = {};
  state.stateR = {};
  state.batchPairs.forEach(p => {
    state.stateL[p._key] = 'def';
    state.stateR[p._key] = 'def';
  });
  state.selectedL = null;
  state.selectedR = null;
  state.batchMatched = 0;
  state.locked = false;
  renderExercise();
}

function renderExercise() {
  const total = state.exerciseWords.length;
  document.getElementById('exercise-progress').textContent = `${state.totalMatched} из ${total}`;
  document.getElementById('exercise-progress-bar').style.width = `${(state.totalMatched / total) * 100}%`;

  // Done
  if (state.totalMatched >= total) {
    showResults();
    return;
  }

  // Dots
  const dots = state.batches.map((_, i) => {
    const cls = i < state.batchIndex ? 'done' : i === state.batchIndex ? 'active' : '';
    return `<div class="rdot ${cls}"></div>`;
  }).join('');

  // Left column (Serbian)
  const leftCards = state.batchPairs.map(p => {
    const cls = cardClass(state.stateL[p._key], 'L', p._key);
    return `<div class="wcard ${cls}" data-side="L" data-key="${p._key}">${p.sr}</div>`;
  }).join('');

  // Right column (Russian) — shuffled
  const rightCards = state.batchOrder.map(p => {
    const cls = cardClass(state.stateR[p._key], 'R', p._key);
    return `<div class="wcard ${cls}" data-side="R" data-key="${p._key}">${p.ru}</div>`;
  }).join('');

  document.getElementById('exercise-body').innerHTML = `
    <div class="round-dots">${dots}</div>
    <div class="col-labels">
      <span class="col-lbl">сербский</span>
      <span class="col-lbl">русский</span>
    </div>
    <div class="game-grid">
      <div class="game-col">${leftCards}</div>
      <div class="game-col">${rightCards}</div>
    </div>
  `;

  // Attach click handlers
  document.querySelectorAll('.wcard').forEach(el => {
    el.addEventListener('click', () => onCardClick(el.dataset.side, el.dataset.key));
  });
}

function cardClass(status, side, key) {
  if (status === 'ok') return 'ok';
  if (status === 'err') return 'err';
  if (side === 'L' && state.selectedL === key) return 'sel';
  if (side === 'R' && state.selectedR === key) return 'sel';
  return '';
}

function onCardClick(side, key) {
  if (state.locked) return;
  const st = side === 'L' ? state.stateL : state.stateR;
  if (st[key] === 'ok' || st[key] === 'err') return;

  if (side === 'L') {
    state.selectedL = state.selectedL === key ? null : key;
  } else {
    state.selectedR = state.selectedR === key ? null : key;
  }

  renderExercise();

  if (state.selectedL && state.selectedR) checkMatch();
}

function checkMatch() {
  state.locked = true;
  const l = state.selectedL;
  const r = state.selectedR;
  state.selectedL = null;
  state.selectedR = null;

  if (l === r) {
    // Correct!
    state.stateL[l] = 'ok';
    state.stateR[r] = 'ok';
    state.batchMatched++;
    state.totalMatched++;

    // Mark as learned only if not already in mistakes this session
    const isAlreadyMistake = state.mistakes.find(m => m._key === l);
    if (!isAlreadyMistake) {
      state.learnedWords[l] = true;
    }
    saveState();

    renderExercise();

    if (state.batchMatched === state.batchPairs.length) {
      // Batch done — wait then load next
      setTimeout(() => {
        state.batchIndex++;
        if (state.batchIndex < state.batches.length) {
          loadBatch();
        } else {
          renderExercise(); // will call showResults
        }
      }, 700);
    } else {
      state.locked = false;
    }
  } else {
    // Wrong
    state.stateL[l] = 'err';
    state.stateR[r] = 'err';

    // Track mistake (only once per word)
    const word = state.batchPairs.find(p => p._key === l);
    if (word && !state.mistakes.find(m => m._key === l)) {
      state.mistakes.push(word);
    }

    renderExercise();

    setTimeout(() => {
      if (state.stateL[l] === 'err') state.stateL[l] = 'def';
      if (state.stateR[r] === 'err') state.stateR[r] = 'def';
      state.locked = false;
      renderExercise();
    }, 420);
  }
}

function exitExercise() {
  showScreen('home');
}

// ─── Results ───────────────────────────────────
function showResults() {
  // Record session
  state.sessions++;
  recordToday();
  saveState();

  const total = state.exerciseWords.length;
  const wrong = state.mistakes.length;
  const correct = total - wrong;

  // Find category title
  let title = 'Тема';
  if (state.currentCategoryKey && dataset[state.currentCategoryKey]) {
    title = dataset[state.currentCategoryKey].title;
  } else if (state.currentCategoryKey === 'all') {
    title = 'Все слова';
  }

  document.getElementById('results-title').textContent = title;
  document.getElementById('results-correct').textContent = correct;
  document.getElementById('results-wrong').textContent = wrong;
  document.getElementById('results-sub').textContent = 'Тренировка завершена. Эти слова теперь твои.';

  // Mistakes list
  const section = document.getElementById('mistakes-section');
  const list = document.getElementById('mistakes-list');

  if (state.mistakes.length > 0) {
    section.style.display = 'block';
    list.innerHTML = state.mistakes.map(w => `
      <div class="mistake-card">
        <span class="mistake-sr">${w.sr}</span>
        <div class="mistake-arrow"><i class="ti ti-arrow-right"></i></div>
        <span class="mistake-ru">${w.ru}</span>
      </div>
    `).join('');
  } else {
    section.style.display = 'none';
  }

  showScreen('results');
}

function repeatExercise() {
  if (state.currentCategoryKey && dataset[state.currentCategoryKey]) {
    startExercise(state.currentCategoryKey, dataset[state.currentCategoryKey]);
  } else if (state.currentCategoryKey === 'all') {
    startAllWords();
  } else {
    showScreen('home');
  }
}

function nextCategory() {
  const keys = Object.keys(dataset);
  const currentIndex = keys.indexOf(state.currentCategoryKey);
  const nextKey = keys[currentIndex + 1];

  if (nextKey) {
    const nextCat = dataset[nextKey];
    if (!nextCat.free && !state.isPremium) {
      showScreen('home');
      openPaywall(nextKey, nextCat);
    } else {
      startExercise(nextKey, nextCat);
    }
  } else {
    showScreen('home');
  }
}

// ─── Profile ───────────────────────────────────
function renderProfile() {
  const totalWords = Object.values(dataset).reduce((s, c) => s + c.words.length, 0);
  const learnedCount = Object.keys(state.learnedWords).length;
  const startedCats = new Set(
    Object.keys(state.learnedWords).map(k => k.split(':')[0])
  ).size;

  document.getElementById('profile-streak-num').innerHTML =
    `${state.streak}<span class="accent">.</span>`;
  document.getElementById('profile-streak-record').textContent = state.streakRecord;
  document.getElementById('profile-total').innerHTML =
    `${totalWords}<span class="accent">.</span>`;
  document.getElementById('profile-learned').textContent = learnedCount;
  document.getElementById('profile-sessions').textContent = state.sessions;
  document.getElementById('profile-cats').textContent = startedCats;

  // Week row
  renderWeek();

  // Category progress
  renderCategoryProgress();
}

function renderWeek() {
  const days = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const today = new Date();
  // Find Monday of current week
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek);

  const weekEl = document.getElementById('week-row');
  weekEl.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const isToday = ds === todayStr();
    const isDone = state.streakDays.includes(ds);
    const isFuture = d > today && !isToday;

    let cls = 'empty';
    let content = `<span class="day-lbl">${days[i]}</span>`;

    if (isDone) {
      cls = 'done';
      content = `<span class="day-icon">🔥</span><span class="day-lbl">${days[i]}</span>`;
    } else if (isToday) {
      cls = 'today';
      content = `<span class="day-lbl">${days[i]}</span>`;
    } else if (isFuture) {
      cls = 'empty';
    }

    const sq = document.createElement('div');
    sq.className = `day-sq ${cls}`;
    sq.innerHTML = content;
    weekEl.appendChild(sq);
  }
}

function renderCategoryProgress() {
  const container = document.getElementById('profile-progress');
  container.innerHTML = '';

  Object.entries(dataset).forEach(([key, cat]) => {
    const total = cat.words.length;
    const learned = cat.words.filter((_, i) =>
      state.learnedWords[`${key}:${i}`]
    ).length;

    if (learned === 0 && !cat.free) return; // hide not-started premium

    const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
    const isDone = learned === total;

    const row = document.createElement('div');
    row.className = 'progress-row';
    row.innerHTML = `
      <div class="progress-row-top">
        <div class="progress-cat-name">
          <div class="ibox ${isDone ? 'green' : 'warm'}" style="width:24px;height:24px;border-radius:7px;font-size:12px;">
            <i class="ti ${cat.icon}"></i>
          </div>
          ${cat.title}
        </div>
        <span class="progress-cat-count">${learned}/${total}</span>
      </div>
      <div class="pbar-bg">
        <div class="pbar-fill ${isDone ? 'done' : ''}" style="width:${pct}%"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ─── Utilities ─────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Settings ──────────────────────────────────
function initSettings() {
  // Set toggle to current theme
  const isDark = document.body.classList.contains('dark');
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = isDark;
}

function toggleDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark');
    localStorage.setItem('lagano_theme', 'dark');
  } else {
    document.body.classList.remove('dark');
    localStorage.setItem('lagano_theme', 'light');
  }
}

function loadTheme() {
  // Priority: saved preference > Telegram theme
  const saved = localStorage.getItem('lagano_theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
  } else if (saved === 'light') {
    document.body.classList.remove('dark');
  }
  // If no saved preference, Telegram theme is already applied by initTelegram()
}
