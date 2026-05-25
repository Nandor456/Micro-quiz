const QUIZZES = [
  { file: 'quiz2_uC.json', label: 'Quiz 2', topic: 'Mikrokontroller alapok' },
  { file: 'quiz3_uC_GPIO.json', label: 'Quiz 3', topic: 'GPIO' },
  { file: 'quiz4_uC_Timer.json', label: 'Quiz 4', topic: 'Timer / Időzítők' },
  { file: 'quiz5_uC_Timers2.json', label: 'Quiz 5', topic: 'Timerek 2' },
  { file: 'quiz6_uC_UART.json', label: 'Quiz 6', topic: 'UART' },
  { file: 'quiz7_uC_1W.json', label: 'Quiz 7', topic: '1-Wire busz' },
  { file: 'quiz8_uC_I2C.json', label: 'Quiz 8', topic: 'I²C busz' },
  { file: 'quiz9_uC_SPI.json', label: 'Quiz 9a', topic: 'SPI busz' },
  { file: 'quiz9_uC_SPI_LCD.json', label: 'Quiz 9b', topic: 'SPI + LCD' },
  { file: 'quiz10_uC_ADC.json', label: 'Quiz 10', topic: 'ADC' },
  { file: 'quiz11_uC_Motorok.json', label: 'Quiz 11', topic: 'Motorok' },
];

const MODE_META = {
  classic: {
    label: 'Gyakorló mód',
    note: 'Véletlenszerűen kiválasztott kérdések, azonnali visszajelzéssel.',
    caption: 'A kérdések egyesével jelennek meg.',
    summaryLabel: 'Pontszám',
  },
  sheet: {
    label: 'Minden kérdés mód',
    note: 'A kiválasztott kvíz összes kérdése egyszerre jelenik meg egy lapon.',
    caption: 'A teljes kérdéssor egy helyen tölthető ki.',
    summaryLabel: 'Kiválasztva',
  },
};

const quizCache = new Map();

let state = {
  questions: [],
  current: 0,
  answered: false,
  score: 0,
  maxScore: 0,
  history: [],
  currentFile: null,
  currentQuizMeta: null,
  quizTitle: '',
  mode: 'classic',
  selections: [],
};

const $ = id => document.getElementById(id);

const screens = {
  home: $('screen-home'),
  loading: $('screen-loading'),
  quiz: $('screen-quiz'),
  result: $('screen-result'),
};

const views = {
  classic: $('classic-quiz-view'),
  sheet: $('sheet-quiz-view'),
};

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(arr, count) {
  return shuffle(arr).slice(0, Math.min(count, arr.length));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function letterFor(index) {
  return String.fromCharCode(65 + index);
}

function loadModeMeta() {
  return MODE_META[state.mode] || MODE_META.classic;
}

function showScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[name].classList.add('active');
}

function showQuizView(mode) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle('active', key === mode);
  });
}

function buildQuestions(data, options = {}) {
  const { includeAll = false, preserveOrder = false } = options;
  const result = [];

  for (const group of data.questions || []) {
    const pool = Array.isArray(group.questions) ? group.questions : [];
    const points = Number(group.question_points) || 1;
    const pickCount = group.pick_count ?? pool.length;
    const selected = includeAll ? pool : pickRandom(pool, pickCount);

    for (const entry of selected) {
      const answers = shuffle(entry.answers || []);
      const correctIdx = answers.findIndex(answer => Number(answer.answer_weight) === 100);

      result.push({
        text: entry.question_text,
        answers: answers.map(answer => answer.answer_text),
        correctIdx: correctIdx >= 0 ? correctIdx : 0,
        points,
      });
    }
  }

  return preserveOrder ? result : shuffle(result);
}

async function fetchQuizData(file) {
  if (quizCache.has(file)) {
    return quizCache.get(file);
  }

  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  quizCache.set(file, data);
  return data;
}

function buildHomeCard(meta) {
  const card = document.createElement('article');
  card.className = 'quiz-card';

  const title = escapeHtml(meta.topic);
  const file = escapeHtml(meta.file);
  const label = escapeHtml(meta.label);

  card.innerHTML = `
    <div class="card-num">${label}</div>
    <h3 class="card-title">${title}</h3>
    <p class="card-copy">Választható gyors gyakorlás vagy teljes kérdéssor egyetlen lapon.</p>
    <div class="card-file">${file}</div>
    <div class="card-actions">
      <button class="primary-button" type="button" data-mode="classic">Gyakorlás</button>
      <button class="secondary-button" type="button" data-mode="sheet">Minden kérdés</button>
    </div>
  `;

  const [practiceBtn, sheetBtn] = card.querySelectorAll('button');
  practiceBtn.addEventListener('click', () => startQuiz(meta, 'classic'));
  sheetBtn.addEventListener('click', () => startQuiz(meta, 'sheet'));

  return card;
}

function renderHome() {
  showScreen('home');
  const grid = $('quiz-grid');
  grid.innerHTML = '';

  QUIZZES.forEach(meta => {
    grid.appendChild(buildHomeCard(meta));
  });
}

function updateQuizChrome() {
  const modeMeta = loadModeMeta();
  $('quiz-mode-pill').textContent = modeMeta.label;
  $('quiz-label').textContent = state.quizTitle;
  $('mode-note').textContent = modeMeta.note;
  $('mode-caption').textContent = modeMeta.caption;
  $('question-count-label').textContent = `${state.questions.length} kérdés`;
  $('summary-label').textContent = modeMeta.summaryLabel;
}

function updateClassicProgress() {
  const total = state.questions.length;
  const completed = state.current + (state.answered ? 1 : 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  $('prog-text').textContent = `${state.current + 1}. kérdés / ${total}`;
  $('progress-fill').style.width = `${percent}%`;
  $('score-live').textContent = `${state.score} / ${state.maxScore} pont`;
}

function updateSheetProgress() {
  const answeredCount = state.selections.filter(choice => Number.isInteger(choice)).length;
  const total = state.questions.length;
  const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const unansweredCount = total - answeredCount;

  $('prog-text').textContent = `${answeredCount} / ${total} megválaszolva`;
  $('progress-fill').style.width = `${percent}%`;
  $('score-live').textContent = `${answeredCount} / ${total}`;
  $('sheet-summary').textContent = `${answeredCount} kérdés kész`;
  $('sheet-note').textContent = unansweredCount > 0
    ? `Még ${unansweredCount} kérdés vár válaszra.`
    : 'Minden kérdéshez választottál opciót.';
}

function renderQuiz() {
  showScreen('quiz');
  showQuizView(state.mode);
  updateQuizChrome();

  if (state.mode === 'classic') {
    renderQuestion();
    return;
  }

  renderSheetQuiz();
}

function renderQuestion() {
  const question = state.questions[state.current];
  const total = state.questions.length;

  state.answered = false;
  updateClassicProgress();

  $('q-badge').textContent = `Kérdés ${state.current + 1} / ${total}  |  ${question.points} pont`;
  $('q-text').textContent = question.text;

  const answers = $('answers');
  answers.innerHTML = '';

  question.answers.forEach((answerText, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answer-btn';
    btn.dataset.idx = index;
    btn.innerHTML = `
      <span class="answer-token">${letterFor(index)}</span>
      <span class="answer-copy">${escapeHtml(answerText)}</span>
    `;
    btn.addEventListener('click', () => handleAnswer(index));
    answers.appendChild(btn);
  });

  const feedback = $('feedback');
  feedback.className = 'feedback';
  feedback.textContent = '';

  const nextBtn = $('btn-next');
  nextBtn.classList.remove('show');
  nextBtn.textContent = state.current === total - 1
    ? 'Eredmény megtekintése'
    : 'Következő kérdés';
}

function handleAnswer(chosenIdx) {
  if (state.answered) {
    return;
  }

  state.answered = true;

  const question = state.questions[state.current];
  const correct = chosenIdx === question.correctIdx;
  const buttons = $('answers').querySelectorAll('.answer-btn');

  buttons.forEach(button => {
    const answerIndex = Number(button.dataset.idx);
    button.disabled = true;

    if (answerIndex === question.correctIdx) {
      button.classList.add('reveal-correct');
    }

    if (answerIndex === chosenIdx) {
      button.classList.add(correct ? 'correct' : 'wrong');
    }

    if (answerIndex === question.correctIdx && correct) {
      button.classList.remove('reveal-correct');
      button.classList.add('correct');
    }
  });

  if (correct) {
    state.score += question.points;
  }

  state.history.push({
    text: question.text,
    answers: question.answers,
    correctIdx: question.correctIdx,
    chosenIdx,
    correct,
    points: question.points,
  });

  const feedback = $('feedback');
  feedback.className = `feedback show ${correct ? 'ok' : 'err'}`;
  feedback.textContent = correct
    ? `Helyes válasz. +${question.points} pont.`
    : `Nem ez a helyes megoldás. A helyes válasz: ${question.answers[question.correctIdx]}`;

  updateClassicProgress();
  $('btn-next').classList.add('show');
}

function renderSheetQuiz() {
  updateSheetProgress();

  const container = $('sheet-questions');
  container.innerHTML = '';

  state.questions.forEach((question, questionIndex) => {
    const card = document.createElement('section');
    card.className = 'sheet-card';
    card.id = `sheet-question-${questionIndex}`;

    const answersMarkup = question.answers.map((answerText, answerIndex) => `
      <button
        class="answer-btn"
        type="button"
        data-q-index="${questionIndex}"
        data-idx="${answerIndex}"
      >
        <span class="answer-token">${letterFor(answerIndex)}</span>
        <span class="answer-copy">${escapeHtml(answerText)}</span>
      </button>
    `).join('');

    card.innerHTML = `
      <div class="sheet-card__head">
        <span class="sheet-card__index">Kérdés ${questionIndex + 1}</span>
        <span class="sheet-card__points">${question.points} pont</span>
      </div>
      <div class="sheet-card__question">${escapeHtml(question.text)}</div>
      <div class="sheet-card__answers">${answersMarkup}</div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('.answer-btn').forEach(button => {
    button.addEventListener('click', () => {
      const questionIndex = Number(button.dataset.qIndex);
      const answerIndex = Number(button.dataset.idx);
      handleSheetAnswer(questionIndex, answerIndex);
    });
  });

  state.questions.forEach((_, questionIndex) => {
    updateSheetQuestionState(questionIndex);
  });
}

function handleSheetAnswer(questionIndex, chosenIdx) {
  state.selections[questionIndex] = chosenIdx;
  updateSheetQuestionState(questionIndex);
  updateSheetProgress();
}

function updateSheetQuestionState(questionIndex) {
  const card = document.getElementById(`sheet-question-${questionIndex}`);
  if (!card) {
    return;
  }

  const selectedIdx = state.selections[questionIndex];
  card.classList.toggle('sheet-card--answered', Number.isInteger(selectedIdx));

  card.querySelectorAll('.answer-btn').forEach(button => {
    const answerIndex = Number(button.dataset.idx);
    button.classList.toggle('selected', answerIndex === selectedIdx);
  });
}

function compileSheetResults() {
  state.score = 0;
  state.history = state.questions.map((question, index) => {
    const chosenIdx = state.selections[index];
    const correct = chosenIdx === question.correctIdx;

    if (correct) {
      state.score += question.points;
    }

    return {
      text: question.text,
      answers: question.answers,
      correctIdx: question.correctIdx,
      chosenIdx,
      correct,
      points: question.points,
    };
  });
}

function submitSheetQuiz() {
  const unansweredCount = state.selections.filter(choice => !Number.isInteger(choice)).length;
  if (unansweredCount > 0) {
    const proceed = window.confirm(`Még ${unansweredCount} kérdésre nem válaszoltál. Így is leadod?`);
    if (!proceed) {
      return;
    }
  }

  compileSheetResults();
  renderResult();
}

function renderResult() {
  showScreen('result');

  const percent = state.maxScore > 0
    ? Math.round((state.score / state.maxScore) * 100)
    : 0;

  const resultScore = $('result-pct');
  resultScore.textContent = `${percent}%`;
  resultScore.className = `result-score ${percent >= 80 ? '' : percent >= 50 ? 'mid' : 'fail'}`.trim();

  $('result-mode').textContent = loadModeMeta().label;
  $('result-pts').textContent = `${state.score} / ${state.maxScore} pont`;

  const resultMessages = [
    [90, 'Kiemelkedő eredmény. Magabiztosan kezeled az anyagot.'],
    [75, 'Nagyon jó munka. Már csak néhány részletet kell finomítani.'],
    [50, 'Megvan az alap, de érdemes még egyszer végigmenni a témán.'],
    [0, 'Most még van benne hiányosság, de a részletes átnézés segít a következő körre.'],
  ];
  $('result-msg').textContent = resultMessages.find(([limit]) => percent >= limit)[1];

  const reviewList = $('review-list');
  reviewList.innerHTML = '';

  state.history.forEach((entry, index) => {
    const card = document.createElement('article');
    const unanswered = !Number.isInteger(entry.chosenIdx);
    const status = entry.correct ? 'Helyes' : unanswered ? 'Kihagyva' : 'Hibás';
    const stateClass = entry.correct ? 'is-correct' : 'is-wrong';
    const stateLabel = entry.correct ? `+${entry.points} pont` : `0 / ${entry.points} pont`;

    card.className = `review-item ${stateClass}`;
    card.innerHTML = `
      <div class="review-item__meta">
        <span>${index + 1}. kérdés</span>
        <span class="review-item__state">${status} · ${stateLabel}</span>
      </div>
      <div class="review-q">${escapeHtml(entry.text)}</div>
      <div class="review-answers">${buildReviewAnswers(entry, unanswered)}</div>
    `;

    reviewList.appendChild(card);
  });
}

function buildReviewAnswers(entry, unanswered) {
  const rows = [];

  if (unanswered) {
    rows.push(`
      <div class="review-answer missed-answer">
        <span class="review-answer__tag">Nincs válasz</span>
        Erre a kérdésre nem választottál opciót.
      </div>
    `);
  }

  entry.answers.forEach((answerText, answerIndex) => {
    let cssClass = '';
    let tag = '';

    if (answerIndex === entry.correctIdx && answerIndex === entry.chosenIdx) {
      cssClass = 'chosen-correct';
      tag = 'A te válaszod';
    } else if (answerIndex === entry.chosenIdx && answerIndex !== entry.correctIdx) {
      cssClass = 'chosen-wrong';
      tag = 'A te válaszod';
    } else if (answerIndex === entry.correctIdx) {
      cssClass = 'was-correct';
      tag = 'Helyes válasz';
    }

    if (!cssClass) {
      return;
    }

    rows.push(`
      <div class="review-answer ${cssClass}">
        <span class="review-answer__tag">${tag}</span>
        ${escapeHtml(answerText)}
      </div>
    `);
  });

  return rows.join('');
}

async function startQuiz(quizMeta, mode) {
  showScreen('loading');

  try {
    const data = await fetchQuizData(quizMeta.file);
    const includeAll = mode === 'sheet';

    state.questions = buildQuestions(data, {
      includeAll,
      preserveOrder: includeAll,
    });
    state.current = 0;
    state.answered = false;
    state.score = 0;
    state.maxScore = state.questions.reduce((sum, question) => sum + question.points, 0);
    state.history = [];
    state.currentFile = quizMeta.file;
    state.currentQuizMeta = quizMeta;
    state.quizTitle = data.title || quizMeta.topic;
    state.mode = mode;
    state.selections = Array(state.questions.length).fill(null);

    renderQuiz();
  } catch (error) {
    window.alert(`Hiba a kvíz betöltésekor: ${error.message}`);
    renderHome();
  }
}

$('btn-next').addEventListener('click', () => {
  state.current += 1;

  if (state.current < state.questions.length) {
    renderQuestion();
    return;
  }

  renderResult();
});

$('btn-back').addEventListener('click', () => {
  const leavingSheet = state.mode === 'sheet'
    ? state.selections.some(choice => Number.isInteger(choice))
    : state.history.length > 0;
  const message = leavingSheet
    ? 'Biztosan visszalépsz? Az aktuális kitöltés elvész.'
    : 'Visszamész a főoldalra?';

  if (window.confirm(message)) {
    renderHome();
  }
});

$('btn-submit-sheet').addEventListener('click', submitSheetQuiz);

$('btn-retry').addEventListener('click', () => {
  if (state.currentQuizMeta) {
    startQuiz(state.currentQuizMeta, state.mode);
  }
});

$('btn-home-from-result').addEventListener('click', renderHome);

renderHome();
