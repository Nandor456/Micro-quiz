// ── quiz.js ──────────────────────────────────────────────────────────────────
// Microcontroller Quiz App for GitHub Pages
// Loads quiz JSON files from ./quizzes/, randomises questions each session.
// ─────────────────────────────────────────────────────────────────────────────

const QUIZZES = [
  { file: 'quiz2_uC.json',        label: 'Quiz 2',  topic: 'Mikrokontroller alapok' },
  { file: 'quiz3_uC_GPIO.json',   label: 'Quiz 3',  topic: 'GPIO' },
  { file: 'quiz4_uC_Timer.json',  label: 'Quiz 4',  topic: 'Timer / Időzítők' },
  { file: 'quiz5_uC_Timers2.json',label: 'Quiz 5',  topic: 'Timerek 2' },
  { file: 'quiz6_uC_UART.json',   label: 'Quiz 6',  topic: 'UART' },
  { file: 'quiz7_uC_1W.json',     label: 'Quiz 7',  topic: '1-Wire busz' },
  { file: 'quiz8_uC_I2C.json',    label: 'Quiz 8',  topic: 'I²C busz' },
  { file: 'quiz9_uC_SPI.json',    label: 'Quiz 9a', topic: 'SPI busz' },
  { file: 'quiz9_uC_SPI_LCD.json',label: 'Quiz 9b', topic: 'SPI + LCD' },
  { file: 'quiz10_uC_ADC.json',   label: 'Quiz 10', topic: 'ADC' },
  { file: 'quiz11_uC_Motorok.json',label:'Quiz 11', topic: 'Motorok' },
];

// ── State ──────────────────────────────────────────────────────────────────────
let state = {
  questions:    [],   // randomised question list for this session
  current:      0,
  answered:     false,
  score:        0,    // points earned
  maxScore:     0,    // total possible points
  history:      [],   // { questionText, answers, chosenIdx, correctIdx, correct }
  currentFile:  null,
  quizTitle:    '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

// Build flat question list from the JSON's question_group structure
function buildQuestions(data) {
  const result = [];
  for (const group of data.questions) {
    const pool      = group.questions;
    const pickCount = group.pick_count ?? pool.length;
    const pts       = Number(group.question_points) || 1;
    const picked    = pickRandom(pool, pickCount);

    for (const q of picked) {
      // Shuffle the two answers so correct isn't always at the same position
      const answers = shuffle(q.answers);
      const correctIdx = answers.findIndex(a => Number(a.answer_weight) === 100);
      result.push({
        text:       q.question_text,
        answers:    answers.map(a => a.answer_text),
        correctIdx,
        points:     pts,
      });
    }
  }
  return shuffle(result);
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = {
  home:    $('screen-home'),
  loading: $('screen-loading'),
  quiz:    $('screen-quiz'),
  result:  $('screen-result'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.remove('active');
    if (k !== 'home') el.style.display = 'none';
  });

  const el = screens[name];
  if (name === 'home') {
    el.style.display = 'block';
  } else {
    el.style.display = 'block';
    // small tick so display:block renders before animation
    requestAnimationFrame(() => el.classList.add('active'));
  }
}

// ── Home screen ───────────────────────────────────────────────────────────────
function renderHome() {
  showScreen('home');
  const grid = $('quiz-grid');
  grid.innerHTML = '';

  QUIZZES.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="card-num">${q.label}</div>
      <div class="card-title">${q.topic}</div>
      <div class="card-meta">quizzes/${q.file}</div>
    `;
    card.addEventListener('click', () => startQuiz(q));
    grid.appendChild(card);
  });
}

// ── Load & start quiz ──────────────────────────────────────────────────────────
async function startQuiz(quizMeta) {
  showScreen('loading');
  try {
    const resp = await fetch(`quizzes/${quizMeta.file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    state.questions   = buildQuestions(data);
    state.current     = 0;
    state.answered    = false;
    state.score       = 0;
    state.maxScore    = state.questions.reduce((s, q) => s + q.points, 0);
    state.history     = [];
    state.currentFile = quizMeta.file;
    state.quizTitle   = data.title || quizMeta.topic;

    renderQuiz();
  } catch (err) {
    alert('Hiba a kvíz betöltésekor: ' + err.message);
    renderHome();
  }
}

// ── Quiz screen ───────────────────────────────────────────────────────────────
function renderQuiz() {
  showScreen('quiz');
  $('quiz-label').textContent = state.quizTitle;
  renderQuestion();
}

function renderQuestion() {
  const q   = state.questions[state.current];
  const idx = state.current;
  const tot = state.questions.length;

  state.answered = false;

  // Progress
  const pct = Math.round((idx / tot) * 100);
  $('progress-fill').style.width = pct + '%';
  $('prog-text').textContent = `${idx + 1} / ${tot}`;
  $('score-live').textContent = `${state.score} / ${state.maxScore} pont`;

  // Question
  $('q-badge').textContent = `KÉRDÉS ${idx + 1}  ·  ${q.points} pont`;
  $('q-text').textContent  = q.text;

  // Answers
  const container = $('answers');
  container.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.answers.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.dataset.idx = i;
    btn.innerHTML = `<span class="answer-letter">${letters[i]}</span><span>${text}</span>`;
    btn.addEventListener('click', () => handleAnswer(i));
    container.appendChild(btn);
  });

  // Reset feedback / next
  const fb = $('feedback');
  fb.className = 'feedback';
  fb.textContent = '';

  const btnNext = $('btn-next');
  btnNext.classList.remove('show');
  btnNext.textContent = idx === tot - 1 ? 'Eredmény megtekintése ✓' : 'Következő kérdés →';
}

function handleAnswer(chosenIdx) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.current];
  const correct = chosenIdx === q.correctIdx;

  // Style buttons
  const btns = $('answers').querySelectorAll('.answer-btn');
  btns.forEach(btn => {
    btn.disabled = true;
    const i = Number(btn.dataset.idx);
    if (i === q.correctIdx && !correct) btn.classList.add('reveal-correct');
    if (i === chosenIdx && correct)     btn.classList.add('correct');
    if (i === chosenIdx && !correct)    btn.classList.add('wrong');
    if (i === q.correctIdx && correct)  btn.classList.add('correct');
  });

  // Score
  if (correct) state.score += q.points;

  // Feedback banner
  const fb = $('feedback');
  if (correct) {
    fb.className = 'feedback show ok';
    fb.textContent = '✓ Helyes válasz! +' + q.points + ' pont';
  } else {
    fb.className = 'feedback show err';
    fb.textContent = '✗ Hibás válasz. A helyes: ' + q.answers[q.correctIdx];
  }

  // History
  state.history.push({
    text:       q.text,
    answers:    q.answers,
    correctIdx: q.correctIdx,
    chosenIdx,
    correct,
    points:     q.points,
  });

  // Update live score display
  $('score-live').textContent = `${state.score} / ${state.maxScore} pont`;

  $('btn-next').classList.add('show');
}

$('btn-next').addEventListener('click', () => {
  state.current++;
  if (state.current < state.questions.length) {
    renderQuestion();
  } else {
    renderResult();
  }
});

$('btn-back').addEventListener('click', () => {
  if (confirm('Biztosan megszakítod a kvízt?')) renderHome();
});

// ── Result screen ─────────────────────────────────────────────────────────────
function renderResult() {
  showScreen('result');

  const pct = state.maxScore > 0
    ? Math.round((state.score / state.maxScore) * 100)
    : 0;

  const pctEl = $('result-pct');
  pctEl.textContent = pct + '%';
  pctEl.className = 'result-score ' + (pct >= 80 ? '' : pct >= 50 ? 'mid' : 'fail');

  $('result-pts').textContent = `${state.score} / ${state.maxScore} pont`;

  const msgs = [
    [90, '🏆 Kiváló! Mester szinten teljesítettél!'],
    [75, '✅ Nagyon jó! Még egy kis gyakorlás és tökéletes lesz.'],
    [50, '⚠️ Megfelelt, de érdemes újra átnézni az anyagot.'],
    [0,  '❌ Sajnos nem sikerült. Ne add fel, próbáld újra!'],
  ];
  $('result-msg').textContent = msgs.find(([t]) => pct >= t)[1];

  // Review list
  const list = $('review-list');
  list.innerHTML = '';
  state.history.forEach((h, i) => {
    const div = document.createElement('div');
    div.className = 'review-item ' + (h.correct ? 'correct-item' : 'wrong-item');

    const answersHtml = h.answers.map((a, ai) => {
      let cls = '';
      if (ai === h.chosenIdx && h.correct)  cls = 'chosen-correct';
      if (ai === h.chosenIdx && !h.correct) cls = 'chosen-wrong';
      if (ai === h.correctIdx && !h.correct) cls = 'was-correct';
      if (!cls) return '';
      const label = ai === h.chosenIdx
        ? (h.correct ? '✓ Helyes választásod' : '✗ Te ezt választottad')
        : '✓ Helyes válasz';
      return `<div class="review-answer ${cls}"><span class="review-status">${label}</span>${a}</div>`;
    }).filter(Boolean).join('');

    div.innerHTML = `
      <div class="review-q"><strong>${i + 1}.</strong> ${h.text}</div>
      <div class="review-answers">${answersHtml}</div>
    `;
    list.appendChild(div);
  });
}

$('btn-retry').addEventListener('click', () => {
  const q = QUIZZES.find(q => q.file === state.currentFile);
  if (q) startQuiz(q);
});

$('btn-home-from-result').addEventListener('click', renderHome);

// ── Init ──────────────────────────────────────────────────────────────────────
renderHome();
