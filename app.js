/* PDE Exam Prep — app logic.
   Data lives in questions.json. Add questions there, no code changes needed.
*/

const EXAM_LENGTH = 50;
const EXAM_SECONDS = 120 * 60;
const DOMAIN_SHORT = {
  "Designing Data Processing Systems": "Designing",
  "Building and Operationalizing Data Pipelines": "Pipelines",
  "Operationalizing Machine Learning Models": "ML Models",
  "Ensuring Solution Quality (Security, Monitoring, Optimization)": "Solution Quality",
  "Data Governance, Compliance, and Scalability": "Governance",
};
const DOMAIN_COLORS = {
  "Designing Data Processing Systems": { accent: "#1a73e8", tint: "#e8f0fe", dark: "#174ea6", icon: "📐" },
  "Building and Operationalizing Data Pipelines": { accent: "#188038", tint: "#e6f4ea", dark: "#0d652d", icon: "🔧" },
  "Operationalizing Machine Learning Models": { accent: "#9334e6", tint: "#f3e8fd", dark: "#681da8", icon: "🤖" },
  "Ensuring Solution Quality (Security, Monitoring, Optimization)": { accent: "#d93025", tint: "#fce8e6", dark: "#a50e0e", icon: "🛡️" },
  "Data Governance, Compliance, and Scalability": { accent: "#ea8600", tint: "#fef3e0", dark: "#b06000", icon: "📋" },
};

let BANK = null;
const el = (id) => document.getElementById(id);

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = (v.id !== id); });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderInlineMarkdown(escapedText) {
  // text is already HTML-escaped; apply light **bold** / *italic* / _underline_ styling on top
  return escapedText
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<u>$1</u>');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function init() {
  try {
    const res = await fetch('questions.json');
    if (!res.ok) throw new Error(`questions.json returned HTTP ${res.status}`);
    BANK = await res.json();
    if (!BANK.questions || !BANK.questions.length) throw new Error('questions.json loaded but has no questions');
    renderHome();
    bindNav();
    bindNotesEvents();
    await loadNotes();
  } catch (err) {
    document.getElementById('viewHome').innerHTML =
      `<div style="max-width:640px;margin:60px auto;padding:0 24px;font-family:sans-serif;">
        <h2 style="color:#d93025;">Couldn't load the question bank</h2>
        <p>${err.message}</p>
        <p style="color:#5f6368;">Check that questions.json is uploaded in the same folder as index.html, and that it's valid JSON (try opening it directly in a browser tab to see if it loads).</p>
      </div>`;
    console.error('PDE Exam Prep failed to initialize:', err);
  }
}

/* ================= HOME ================= */

function renderHome() {
  const total = BANK.questions.length;
  el('studyCountLabel').textContent = total;

  const counts = {};
  BANK.questions.forEach((q) => { counts[q.domain] = (counts[q.domain] || 0) + 1; });

  const tbody = el('weightTableBody');
  tbody.innerHTML = '';
  BANK.domainOrder.forEach((domain) => {
    const n = counts[domain] || 0;
    const bankPct = Math.round((n / total) * 100);
    const officialPct = BANK.officialWeights[domain];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${domain}</td><td>${n} (${bankPct}%)</td><td>${officialPct}%</td>`;
    tbody.appendChild(tr);
  });
}

function bindNav() {
  el('goExamIntro').addEventListener('click', () => showView('viewExamIntro'));
  el('examIntroBack').addEventListener('click', () => showView('viewHome'));
  el('startExam').addEventListener('click', startExam);

  el('goStudy').addEventListener('click', () => { showView('viewStudy'); initStudyMode(); });
  el('studyBack').addEventListener('click', () => showView('viewHome'));

  el('endExamEarly').addEventListener('click', () => { if (confirm('Submit the exam now? You still have time remaining.')) finishExam(); });
  el('examPrev').addEventListener('click', () => examGoTo(examState.current - 1));
  el('examNext').addEventListener('click', () => examGoTo(examState.current + 1));
  el('examFlag').addEventListener('click', toggleFlag);

  el('backHomeFromResults').addEventListener('click', () => showView('viewHome'));
  el('reviewExamAnswers').addEventListener('click', renderExamReview);
  el('reviewBack').addEventListener('click', () => showView('viewExamResults'));

  el('studyPrev').addEventListener('click', studyGoPrev);
  el('studyReviewMissed').addEventListener('click', studyReviewMissed);
  el('studyBackToDomains').addEventListener('click', showStudyIntroTabs);
}

/* ================= SIMULATED EXAM ================= */

let examState = null; // { questions: [...], current, answers: {idx: {selected, flagged}}, secondsLeft, timerHandle }

function sampleExamQuestions() {
  const grouped = {};
  BANK.questions.forEach((q) => {
    if (!grouped[q.domain]) grouped[q.domain] = [];
    grouped[q.domain].push(q);
  });

  // proportional counts summing to EXAM_LENGTH, largest remainder method
  const raw = BANK.domainOrder.map((d) => (BANK.officialWeights[d] / 100) * EXAM_LENGTH);
  const base = raw.map(Math.floor);
  let remaining = EXAM_LENGTH - base.reduce((a, b) => a + b, 0);
  const remainders = raw.map((v, i) => ({ i, frac: v - base[i] })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remaining; k++) base[remainders[k].i] += 1;

  let selected = [];
  BANK.domainOrder.forEach((domain, i) => {
    const pool = shuffle(grouped[domain] || []);
    const need = Math.min(base[i], pool.length);
    selected = selected.concat(pool.slice(0, need));
  });
  return shuffle(selected);
}

function startExam() {
  examState = {
    questions: sampleExamQuestions(),
    current: 0,
    answers: {},
    secondsLeft: EXAM_SECONDS,
  };
  showView('viewExam');
  renderNavigatorGrid();
  renderExamQuestion();
  examState.timerHandle = setInterval(tickTimer, 1000);
}

function tickTimer() {
  examState.secondsLeft -= 1;
  updateTimerDisplay();
  if (examState.secondsLeft <= 0) {
    clearInterval(examState.timerHandle);
    finishExam();
  }
}

function updateTimerDisplay() {
  const s = Math.max(0, examState.secondsLeft);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const label = `${m}:${sec.toString().padStart(2, '0')}`;
  const timerEl = el('examTimer');
  timerEl.textContent = label;
  timerEl.classList.toggle('timer-warning', s <= 600);
}

function renderNavigatorGrid() {
  const grid = el('navigatorGrid');
  grid.innerHTML = '';
  examState.questions.forEach((q, i) => {
    const cell = document.createElement('button');
    cell.className = 'nav-cell';
    cell.textContent = i + 1;
    cell.addEventListener('click', () => examGoTo(i));
    grid.appendChild(cell);
  });
  refreshNavigatorState();
}

function refreshNavigatorState() {
  const cells = el('navigatorGrid').children;
  Array.from(cells).forEach((cell, i) => {
    cell.classList.remove('nav-current', 'nav-answered', 'nav-flagged');
    if (i === examState.current) cell.classList.add('nav-current');
    const ans = examState.answers[i];
    if (ans && ans.flagged) cell.classList.add('nav-flagged');
    else if (ans && ans.selected !== undefined && ans.selected !== null) cell.classList.add('nav-answered');
  });
}

function examGoTo(index) {
  if (index < 0 || index >= examState.questions.length) return;
  examState.current = index;
  renderExamQuestion();
}

function renderExamQuestion() {
  const q = examState.questions[examState.current];
  const idx = examState.current;
  el('examQPosition').textContent = `Question ${idx + 1} of ${examState.questions.length}`;
  el('examQText').textContent = q.question;
  el('examMultiHint').hidden = q.type !== 'multi';

  const prior = examState.answers[idx] || { selected: q.type === 'multi' ? [] : null, flagged: false };
  examState.answers[idx] = prior;

  const list = el('examChoices');
  list.innerHTML = '';
  q.choices.forEach((choiceText, ci) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.dataset.shape = q.type === 'multi' ? 'checkbox' : 'radio';
    const isSelected = q.type === 'multi' ? prior.selected.includes(ci) : prior.selected === ci;
    if (isSelected) btn.classList.add('selected');
    btn.innerHTML = `<span class="choice-radio"></span><span>${escapeHtml(choiceText)}</span>`;
    btn.addEventListener('click', () => {
      if (q.type === 'multi') {
        const set = new Set(prior.selected);
        if (set.has(ci)) set.delete(ci); else set.add(ci);
        prior.selected = [...set];
      } else {
        prior.selected = ci;
      }
      renderExamQuestion();
      refreshNavigatorState();
    });
    list.appendChild(btn);
  });

  el('examFlag').textContent = prior.flagged ? 'Unflag' : 'Flag for review';
  el('examPrev').disabled = idx === 0;
  el('examNext').textContent = idx === examState.questions.length - 1 ? 'Finish →' : 'Next →';
  refreshNavigatorState();
}

function toggleFlag() {
  const prior = examState.answers[examState.current];
  prior.flagged = !prior.flagged;
  renderExamQuestion();
}

function finishExam() {
  if (examState.timerHandle) clearInterval(examState.timerHandle);

  let correct = 0;
  const domainStats = {};
  examState.questions.forEach((q, i) => {
    const ans = examState.answers[i];
    const isCorrect = ans && ans.selected !== null && ans.selected !== undefined &&
      (q.type === 'multi'
        ? Array.isArray(ans.selected) && ans.selected.length === q.answer.length && q.answer.every((a) => ans.selected.includes(a))
        : ans.selected === q.answer);
    if (isCorrect) correct += 1;
    if (!domainStats[q.domain]) domainStats[q.domain] = { total: 0, correct: 0 };
    domainStats[q.domain].total += 1;
    if (isCorrect) domainStats[q.domain].correct += 1;
  });

  const total = examState.questions.length;
  const pct = Math.round((correct / total) * 100);
  el('scoreSummary').innerHTML = `${correct} / ${total}<span class="score-sub">${pct}% correct · time used ${formatUsedTime()}</span>`;

  const table = el('resultsDomainTable');
  table.innerHTML = '<thead><tr><th>Domain</th><th>Correct</th><th>%</th></tr></thead>';
  const tbody = document.createElement('tbody');
  BANK.domainOrder.forEach((d) => {
    const s = domainStats[d];
    if (!s) return;
    const p = Math.round((s.correct / s.total) * 100);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d}</td><td>${s.correct} / ${s.total}</td><td>${p}%</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  showView('viewExamResults');
}

function formatUsedTime() {
  const used = EXAM_SECONDS - Math.max(0, examState.secondsLeft);
  const m = Math.floor(used / 60);
  const s = used % 60;
  return `${m}m ${s}s`;
}

function renderExamReview() {
  const list = el('reviewList');
  list.innerHTML = '';

  let correct = 0;
  examState.questions.forEach((q, i) => {
    const ans = examState.answers[i] || { selected: null };
    const isCorrect = q.type === 'multi'
      ? Array.isArray(ans.selected) && ans.selected.length === q.answer.length && q.answer.every((a) => ans.selected.includes(a))
      : ans.selected === q.answer;
    if (isCorrect) correct += 1;

    const item = document.createElement('div');
    item.className = 'review-item';

    const num = document.createElement('div');
    num.className = 'review-item-num';
    num.textContent = `Question ${i + 1} · ${q.domain}${q.type === 'multi' ? ' · select all that apply' : ''}`;
    item.appendChild(num);

    const qText = document.createElement('h3');
    qText.className = 'question-text';
    qText.textContent = q.question;
    item.appendChild(qText);

    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';
    const correctSet = new Set(q.type === 'multi' ? q.answer : [q.answer]);
    const selectedSet = new Set(q.type === 'multi' ? (ans.selected || []) : (ans.selected !== null && ans.selected !== undefined ? [ans.selected] : []));

    q.choices.forEach((choiceText, ci) => {
      const c = document.createElement('div');
      c.className = 'choice locked';
      c.dataset.shape = q.type === 'multi' ? 'checkbox' : 'radio';
      if (correctSet.has(ci)) c.classList.add('correct');
      else if (selectedSet.has(ci)) c.classList.add('incorrect');
      c.innerHTML = `<span class="choice-radio"></span><span>${escapeHtml(choiceText)}</span>`;
      choicesDiv.appendChild(c);
    });
    item.appendChild(choicesDiv);

    const fb = document.createElement('div');
    fb.className = 'feedback';
    const verdict = document.createElement('div');
    verdict.className = 'feedback-verdict ' + (isCorrect ? 'is-correct' : 'is-incorrect');
    verdict.textContent = ans.selected === null || ans.selected === undefined || (Array.isArray(ans.selected) && ans.selected.length === 0)
      ? 'Not answered.' : (isCorrect ? 'Correct.' : 'Not quite.');
    fb.appendChild(verdict);
    const expl = document.createElement('p');
    expl.className = 'feedback-explanation';
    expl.textContent = q.explanation || '';
    fb.appendChild(expl);
    item.appendChild(fb);

    list.appendChild(item);
  });

  el('reviewScorePill').textContent = `${correct} / ${examState.questions.length} correct`;
  showView('viewExamReview');
}

/* ================= STUDY MODE ================= */

let studySet = [];
let studyIndex = 0;
let questionResults = {}; // persistent map: questionId -> true/false (most recent attempt)
let studyMissedIds = new Set();
let studySessionAnswers = {};
let studySelectedMulti = new Set();

function initStudyMode() {
  renderDomainTabs();
  loadQuestionResults();
  showStudyIntroTabs();
}

function loadQuestionResults() {
  const saved = localStorage.getItem('pde_question_results');
  questionResults = saved ? JSON.parse(saved) : {};
  studyMissedIds = new Set(Object.keys(questionResults).filter((id) => !questionResults[id]));
  updateStudyScorePill();
}

function persistQuestionResults() {
  localStorage.setItem('pde_question_results', JSON.stringify(questionResults));
}

function updateStudyScorePill() {
  const ids = Object.keys(questionResults);
  const correct = ids.filter((id) => questionResults[id]).length;
  el('studyScorePill').textContent = `${correct} / ${ids.length} correct`;
}

function renderDomainTabs() {
  const nav = el('domainTabs');
  nav.innerHTML = '';
  BANK.domainOrder.forEach((domain) => {
    const btn = document.createElement('button');
    btn.className = 'domain-tab';
    btn.textContent = DOMAIN_SHORT[domain] || domain;
    btn.addEventListener('click', () => studyStart(domain));
    nav.appendChild(btn);
  });
}

function setActiveDomainTab(label) {
  document.querySelectorAll('.domain-tab').forEach((t) => t.classList.toggle('active', t.textContent === label));
}

function showStudyIntroTabs() {
  // default to first domain if nothing selected yet
  studyStart(BANK.domainOrder[0]);
}

function studyStart(domain) {
  studySet = shuffle(BANK.questions.filter((q) => q.domain === domain));
  studyIndex = 0;
  studySessionAnswers = {};
  setActiveDomainTab(DOMAIN_SHORT[domain] || domain);
  el('studyQuizPanel').hidden = false;
  el('studyDonePanel').hidden = true;
  renderStudyNavigatorGrid();
  renderStudyQuestion();
}

function renderStudyNavigatorGrid() {
  const grid = el('studyNavigatorGrid');
  grid.innerHTML = '';
  studySet.forEach((q, i) => {
    const cell = document.createElement('button');
    cell.className = 'nav-cell';
    cell.textContent = i + 1;
    cell.addEventListener('click', () => studyGoTo(i));
    grid.appendChild(cell);
  });
  refreshStudyNavigatorState();
}

function refreshStudyNavigatorState() {
  const cells = el('studyNavigatorGrid').children;
  Array.from(cells).forEach((cell, i) => {
    cell.classList.remove('nav-current', 'nav-answered', 'nav-flagged', 'nav-user-flagged');
    if (i === studyIndex) cell.classList.add('nav-current');
    const q = studySet[i];
    const result = questionResults[q.id];
    if (result === true) cell.classList.add('nav-answered');
    else if (result === false) cell.classList.add('nav-flagged');
    if (studyFlags[q.id]) cell.classList.add('nav-user-flagged');
  });
}

function studyGoTo(index) {
  if (index < 0 || index >= studySet.length) return;
  studyIndex = index;
  renderStudyQuestion();
}

function renderStudyQuestion() {
  const q = studySet[studyIndex];
  el('studyDomainLabel').textContent = DOMAIN_SHORT[q.domain] || q.domain;
  el('studyPosition').textContent = `${studyIndex + 1} / ${studySet.length}`;
  el('studySource').textContent = `Source: ${q.source}`;
  el('studyQText').textContent = q.question;
  el('studyMultiHint').hidden = q.type !== 'multi';
  el('studyFeedback').hidden = true;
  studySelectedMulti = new Set();

  const list = el('studyChoices');
  list.innerHTML = '';
  list.classList.remove('locked-set');

  q.choices.forEach((choiceText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.dataset.shape = q.type === 'multi' ? 'checkbox' : 'radio';
    btn.innerHTML = `<span class="choice-radio"></span><span>${escapeHtml(choiceText)}</span>`;
    btn.addEventListener('click', () => handleStudyChoiceClick(q, idx));
    list.appendChild(btn);
  });

  el('studyPrev').disabled = studyIndex === 0;
  updateStudyFlagButton();
  refreshStudyNavigatorState();

  const prior = studySessionAnswers[studyIndex];
  if (prior) {
    list.classList.add('locked-set');
    Array.from(list.children).forEach((btn, idx) => {
      btn.classList.add('locked');
      const isAnswerIdx = q.type === 'multi' ? q.answer.includes(idx) : idx === q.answer;
      if (isAnswerIdx) btn.classList.add('correct');
      else if (q.type === 'multi' ? prior.chosen.includes(idx) : idx === prior.chosen) btn.classList.add('incorrect');
    });
    renderStudyFeedback(q, prior.isCorrect);
    el('studyNext').disabled = false;
    el('studyNext').textContent = studyIndex === studySet.length - 1 ? 'Finish set →' : 'Next question →';
    el('studyNext').onclick = null;
    el('studyNext').addEventListener('click', studyGoNext, { once: true });
  } else {
    el('studyNext').disabled = true;
    el('studyNext').textContent = studyIndex === studySet.length - 1 ? 'Finish set →' : 'Answer to continue →';
    el('studyNext').onclick = null;
  }
}

function renderStudyFeedback(q, isCorrect) {
  el('studyFeedback').hidden = false;
  const verdict = el('studyFeedbackVerdict');
  verdict.textContent = isCorrect ? 'Correct.' : 'Not quite.';
  verdict.className = 'feedback-verdict ' + (isCorrect ? 'is-correct' : 'is-incorrect');
  el('studyFeedbackExplanation').textContent = q.explanation || '';
}

function handleStudyChoiceClick(q, idx) {
  const list = el('studyChoices');
  if (list.classList.contains('locked-set') && studySessionAnswers[studyIndex]) return;

  if (q.type === 'single') {
    lockStudyAndReveal(q, idx);
  } else {
    const btnEl = list.children[idx];
    if (studySelectedMulti.has(idx)) { studySelectedMulti.delete(idx); btnEl.classList.remove('selected'); }
    else { studySelectedMulti.add(idx); btnEl.classList.add('selected'); }
    el('studyNext').disabled = studySelectedMulti.size === 0;
    el('studyNext').textContent = 'Check answer';
    el('studyNext').onclick = () => submitStudyMulti(q);
  }
}

function submitStudyMulti(q) {
  const list = el('studyChoices');
  list.classList.add('locked-set');
  const correctSet = new Set(q.answer);
  const isCorrect = correctSet.size === studySelectedMulti.size && [...correctSet].every((i) => studySelectedMulti.has(i));

  Array.from(list.children).forEach((btn, idx) => {
    btn.classList.add('locked');
    if (correctSet.has(idx)) btn.classList.add('correct');
    else if (studySelectedMulti.has(idx)) btn.classList.add('incorrect');
  });

  studySessionAnswers[studyIndex] = { chosen: [...studySelectedMulti], isCorrect };
  recordStudyScore(q, isCorrect);
  refreshStudyNavigatorState();
  renderStudyFeedback(q, isCorrect);
  el('studyNext').onclick = null;
  el('studyNext').textContent = studyIndex === studySet.length - 1 ? 'Finish set →' : 'Next question →';
  el('studyNext').disabled = false;
  el('studyNext').addEventListener('click', studyGoNext, { once: true });
}

function lockStudyAndReveal(q, chosenIdx) {
  const list = el('studyChoices');
  if (list.classList.contains('locked-set')) return;
  list.classList.add('locked-set');
  const isCorrect = chosenIdx === q.answer;

  Array.from(list.children).forEach((btn, idx) => {
    btn.classList.add('locked');
    if (idx === q.answer) btn.classList.add('correct');
    else if (idx === chosenIdx) btn.classList.add('incorrect');
  });

  studySessionAnswers[studyIndex] = { chosen: chosenIdx, isCorrect };
  recordStudyScore(q, isCorrect);
  refreshStudyNavigatorState();
  renderStudyFeedback(q, isCorrect);
  el('studyNext').disabled = false;
  el('studyNext').textContent = studyIndex === studySet.length - 1 ? 'Finish set →' : 'Next question →';
  el('studyNext').addEventListener('click', studyGoNext, { once: true });
}

function recordStudyScore(q, isCorrect) {
  questionResults[q.id] = isCorrect;
  if (isCorrect) studyMissedIds.delete(q.id);
  else studyMissedIds.add(q.id);
  persistQuestionResults();
  updateStudyScorePill();
}

function studyGoNext() {
  if (studyIndex < studySet.length - 1) { studyIndex += 1; renderStudyQuestion(); }
  else studyFinishSet();
}

function studyGoPrev() {
  if (studyIndex > 0) { studyIndex -= 1; renderStudyQuestion(); }
}

function studyFinishSet() {
  el('studyQuizPanel').hidden = true;
  el('studyDonePanel').hidden = false;
  const missedInSet = studySet.filter((q) => studyMissedIds.has(q.id)).length;
  el('studyDoneSummary').textContent = `You answered ${studySet.length} questions in this set. ${studySet.length - missedInSet} were right the first time.`;
}

function studyReviewMissed() {
  const missedQs = BANK.questions.filter((q) => studyMissedIds.has(q.id));
  if (missedQs.length === 0) {
    el('studyDoneSummary').textContent = 'Nothing missed to review, nice work.';
    return;
  }
  studySet = missedQs;
  studyIndex = 0;
  studySessionAnswers = {};
  el('studyDonePanel').hidden = true;
  el('studyQuizPanel').hidden = false;
  renderStudyNavigatorGrid();
  renderStudyQuestion();
}

/* ================= STUDY FLAGGING ================= */

let studyFlags = {}; // persistent: questionId -> true

function loadStudyFlags() {
  const saved = localStorage.getItem('pde_study_flags');
  studyFlags = saved ? JSON.parse(saved) : {};
}
function persistStudyFlags() {
  localStorage.setItem('pde_study_flags', JSON.stringify(studyFlags));
}
function toggleStudyFlag() {
  const q = studySet[studyIndex];
  if (studyFlags[q.id]) delete studyFlags[q.id];
  else studyFlags[q.id] = true;
  persistStudyFlags();
  updateStudyFlagButton();
  refreshStudyNavigatorState();
}
function updateStudyFlagButton() {
  const q = studySet[studyIndex];
  el('studyFlag').textContent = studyFlags[q.id] ? '🚩 Flagged' : '🚩 Flag';
  el('studyFlag').classList.toggle('flag-active', !!studyFlags[q.id]);
}

/* ================= NOTES FEATURE ================= */

let NOTES = null;
const DOMAIN_ICON = {}; // reserved for future use

async function loadNotes() {
  try {
    const res = await fetch('notes.json');
    if (!res.ok) return;
    NOTES = await res.json();
  } catch (e) {
    console.warn('Notes failed to load:', e);
    NOTES = null;
  }
}

function notesShortDomain(domain) {
  return DOMAIN_SHORT[domain] || domain;
}

// Build the sidebar + main content for either the full page or the drawer.
function renderNotesInto(sidebarEl, mainEl, searchTerm, context) {
  if (!NOTES) {
    mainEl.innerHTML = '<div class="notes-empty-state">Notes failed to load. Check that notes.json is uploaded alongside index.html.</div>';
    return;
  }
  const term = (searchTerm || '').trim().toLowerCase();

  const matches = (note) => {
    if (!term) return true;
    if (note.topic.toLowerCase().includes(term)) return true;
    return note.bullets.some((b) => b.toLowerCase().includes(term));
  };

  // Sidebar
  sidebarEl.innerHTML = '';
  const collapsedState = loadSidebarCollapsedState(context);
  NOTES.domainOrder.forEach((domain) => {
    const domainNotes = NOTES.notes.filter((n) => n.domain === domain);
    if (domainNotes.length === 0) return;
    const visible = domainNotes.filter(matches);
    if (term && visible.length === 0) return;

    const domainDiv = document.createElement('div');
    domainDiv.className = 'notes-sidebar-domain';
    const colors = DOMAIN_COLORS[domain] || {};
    const isCollapsed = !term && collapsedState[domain];
    if (isCollapsed) domainDiv.classList.add('collapsed');

    const title = document.createElement('button');
    title.className = 'notes-sidebar-domain-title';
    title.innerHTML = `<span class="dot" style="background:${colors.accent || '#999'}"></span><span class="notes-sidebar-domain-label">${escapeHtml(notesShortDomain(domain))}</span><span class="notes-sidebar-domain-count">${domainNotes.length}</span><span class="notes-sidebar-domain-chevron">›</span>`;
    title.addEventListener('click', () => {
      domainDiv.classList.toggle('collapsed');
      collapsedState[domain] = domainDiv.classList.contains('collapsed');
      saveSidebarCollapsedState(context, collapsedState);
    });
    domainDiv.appendChild(title);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'notes-sidebar-items';
    domainNotes.forEach((n) => {
      const btn = document.createElement('button');
      btn.className = 'notes-sidebar-item';
      if (term && !matches(n)) btn.classList.add('dimmed');
      btn.textContent = n.topic;
      btn.addEventListener('click', () => {
        const cardId = `${context}-card-${n.id}`;
        const cardEl = document.getElementById(cardId);
        if (cardEl) {
          cardEl.classList.add('expanded');
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          saveNotesSessionState(context, n.id);
        }
      });
      itemsWrap.appendChild(btn);
    });
    domainDiv.appendChild(itemsWrap);
    sidebarEl.appendChild(domainDiv);
  });

  if (NOTES.orphanImages && NOTES.orphanImages.length && !term) {
    const orphanTitle = document.createElement('div');
    orphanTitle.className = 'notes-sidebar-orphan-title';
    orphanTitle.textContent = 'Uncategorized images';
    sidebarEl.appendChild(orphanTitle);
    NOTES.orphanImages.forEach((o) => {
      const btn = document.createElement('button');
      btn.className = 'notes-sidebar-item';
      btn.textContent = o.label;
      btn.addEventListener('click', () => {
        const cardEl = document.getElementById(`${context}-orphan-${o.file}`);
        if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      sidebarEl.appendChild(btn);
    });
  }

  // Main content
  mainEl.innerHTML = '';
  const savedState = loadNotesSessionState(context);
  let anyVisible = false;

  NOTES.notes.forEach((n) => {
    if (term && !matches(n)) return;
    anyVisible = true;

    const card = document.createElement('div');
    card.className = 'notes-topic-card';
    card.id = `${context}-card-${n.id}`;
    const colors = DOMAIN_COLORS[n.domain] || {};
    card.style.setProperty('--notes-accent', colors.accent || '#1a73e8');
    card.style.setProperty('--notes-accent-tint', colors.tint || '#e8f0fe');
    card.style.setProperty('--notes-accent-dark', colors.dark || '#174ea6');
    if (savedState.expandedId === n.id || term) card.classList.add('expanded');

    const header = document.createElement('div');
    header.className = 'notes-topic-header';
    header.innerHTML = `<div class="notes-topic-header-left"><span class="notes-topic-icon">${colors.icon || '📄'}</span><div><h3>${escapeHtml(n.topic)}</h3><span class="notes-topic-domain-tag">${escapeHtml(notesShortDomain(n.domain))}</span></div></div><span class="notes-topic-toggle">Toggle</span>`;
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
      saveNotesSessionState(context, card.classList.contains('expanded') ? n.id : null);
    });
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'notes-topic-body';

    const list = document.createElement('ul');
    list.className = 'notes-bullet-list';
    n.bullets.forEach((b) => {
      const li = document.createElement('li');
      if (typeof b === 'string') {
        const colonIdx = b.indexOf(':');
        if (colonIdx > 0 && colonIdx < 60) {
          li.innerHTML = `<strong>${escapeHtml(b.slice(0, colonIdx))}:</strong>${escapeHtml(b.slice(colonIdx + 1))}`;
        } else {
          li.textContent = b;
        }
      } else {
        let html = `<strong>${escapeHtml(b.term)}:</strong>`;
        if (b.text) html += renderInlineMarkdown(escapeHtml(b.text));
        if (b.sub && b.sub.length) {
          html += '<ul class="notes-sub-list">' + b.sub.map((s) => `<li>${renderInlineMarkdown(escapeHtml(s))}</li>`).join('') + '</ul>';
        }
        li.innerHTML = html;
      }
      list.appendChild(li);
    });
    body.appendChild(list);

    if (n.table) {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'notes-table-wrap';
      if (n.table.caption) {
        const cap = document.createElement('div');
        cap.className = 'notes-table-caption';
        cap.textContent = n.table.caption;
        tableWrap.appendChild(cap);
      }
      const table = document.createElement('table');
      table.className = 'notes-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      n.table.headers.forEach((h) => {
        const th = document.createElement('th');
        th.textContent = h;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      n.table.rows.forEach((row) => {
        const tr = document.createElement('tr');
        row.forEach((cell) => {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
    }

    if (n.source) {
      const srcLine = document.createElement('p');
      srcLine.className = 'notes-source-line';
      srcLine.textContent = `Source: ${n.source}`;
      body.appendChild(srcLine);
    }

    if (n.images && n.images.length) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'notes-images';
      n.images.forEach((imgFile) => {
        const img = document.createElement('img');
        img.src = `images/${encodeURIComponent(imgFile)}`;
        img.alt = n.topic;
        img.loading = 'lazy';
        img.addEventListener('click', () => openLightbox(img.src, n.topic));
        imgWrap.appendChild(img);
      });
      body.appendChild(imgWrap);
    }

    card.appendChild(body);
    mainEl.appendChild(card);
  });

  if (NOTES.orphanImages && NOTES.orphanImages.length && !term) {
    NOTES.orphanImages.forEach((o) => {
      const card = document.createElement('div');
      card.className = 'notes-orphan-card';
      card.id = `${context}-orphan-${o.file}`;
      card.innerHTML = `<h4>${escapeHtml(o.label)}</h4><p>${escapeHtml(o.hint)}</p>`;
      const img = document.createElement('img');
      img.src = `images/${encodeURIComponent(o.file)}`;
      img.alt = o.label;
      img.loading = 'lazy';
      img.style.maxWidth = '380px';
      img.style.maxHeight = '260px';
      img.style.border = '1px solid var(--border)';
      img.style.borderRadius = '8px';
      img.style.padding = '6px';
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => openLightbox(img.src, o.label));
      card.appendChild(img);
      mainEl.appendChild(card);
    });
  }

  if (!anyVisible && term) {
    mainEl.innerHTML = '<div class="notes-empty-state">No notes match that search.</div>';
  }
}

function saveNotesSessionState(context, expandedId) {
  localStorage.setItem(`pde_notes_state_${context}`, JSON.stringify({ expandedId }));
}
function loadNotesSessionState(context) {
  const saved = localStorage.getItem(`pde_notes_state_${context}`);
  return saved ? JSON.parse(saved) : {};
}
function saveSidebarCollapsedState(context, state) {
  localStorage.setItem(`pde_notes_sidebar_${context}`, JSON.stringify(state));
}
function loadSidebarCollapsedState(context) {
  const saved = localStorage.getItem(`pde_notes_sidebar_${context}`);
  return saved ? JSON.parse(saved) : {};
}

function initScratchpad(textareaId, tagId) {
  const ta = el(textareaId);
  const tag = el(tagId);
  const saved = localStorage.getItem('pde_scratchpad');
  if (saved) ta.value = saved;
  let debounceHandle = null;
  ta.addEventListener('input', () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      localStorage.setItem('pde_scratchpad', ta.value);
      tag.textContent = 'Saved';
      setTimeout(() => { tag.textContent = ''; }, 1200);
    }, 400);
  });
}

function syncScratchpads(sourceId, targetId) {
  // keep both textareas (main view + drawer) showing the same content
  const source = el(sourceId);
  const target = el(targetId);
  source.addEventListener('input', () => { target.value = source.value; });
}

function openNotesView() {
  showView('viewNotes');
  el('notesSearch').value = '';
  renderNotesInto(el('notesSidebar'), el('notesMain'), '', 'full');
}

function openNotesDrawer() {
  el('notesDrawer').hidden = false;
  el('notesDrawerSearch').value = '';
  renderNotesInto(el('notesDrawerSidebar'), el('notesDrawerMain'), '', 'drawer');
  el('scratchpadTextDrawer').value = el('scratchpadText').value;
}
function closeNotesDrawer() {
  el('notesDrawer').hidden = true;
}

function openLightbox(src, caption) {
  el('lightboxImg').src = src;
  el('lightboxCaption').textContent = caption || '';
  el('lightbox').hidden = false;
}
function closeLightbox() {
  el('lightbox').hidden = true;
  el('lightboxImg').src = '';
}

function bindNotesEvents() {
  el('goNotes').addEventListener('click', openNotesView);
  el('notesBack').addEventListener('click', () => showView('viewHome'));
  el('notesSearch').addEventListener('input', (e) => {
    renderNotesInto(el('notesSidebar'), el('notesMain'), e.target.value, 'full');
  });

  el('studyNotesBtn').addEventListener('click', openNotesDrawer);
  el('notesDrawerClose').addEventListener('click', closeNotesDrawer);
  el('notesDrawerBackdrop').addEventListener('click', closeNotesDrawer);
  el('notesDrawerSearch').addEventListener('input', (e) => {
    renderNotesInto(el('notesDrawerSidebar'), el('notesDrawerMain'), e.target.value, 'drawer');
  });

  el('studyFlag').addEventListener('click', toggleStudyFlag);

  initScratchpad('scratchpadText', 'scratchpadSavedTag');
  initScratchpad('scratchpadTextDrawer', 'scratchpadSavedTagDrawer');
  syncScratchpads('scratchpadText', 'scratchpadTextDrawer');
  syncScratchpads('scratchpadTextDrawer', 'scratchpadText');

  loadStudyFlags();

  el('lightboxClose').addEventListener('click', closeLightbox);
  el('lightboxBackdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('lightbox').hidden) closeLightbox();
  });
}

init();
