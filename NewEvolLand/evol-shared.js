// ============================================================
// evol-shared.js  –  EvolLand: Colonization of Land Quiz
// Modeled directly on star-shared.js (ground truth)
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyApEcj1Gt_AgK9853JGWsyPuWuX1RyRQQA",
    authDomain: "astronomy-course.firebaseapp.com",
    projectId: "astronomy-course",
    storageBucket: "astronomy-course.firebasestorage.app",
    messagingSenderId: "84123424550",
    appId: "1:84123424550:web:f6eab6a447d480cedc13e7"
};

let db = null;
try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    }
} catch (e) {
    console.warn('Firebase not available – running in standalone mode');
}

const QUIZ_PASSWORD = "olive";
const TOTAL_QUESTIONS = 10;

let quizConfig = {
    className: null, quizName: null, databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Quiz Password' },
    restrictions: {
        timeLimit: 0, lowTimeWarning: 3,
        startDateTime: '', stopDateTime: '',
        attemptsAllowed: 0, pointsPerQuestion: 1.0
    }
};

let studentData = {
    name:      sessionStorage.getItem('studentName')  || '',
    studentID: sessionStorage.getItem('studentID')    || '',
    sessionId: sessionStorage.getItem('sessionId')    || '',
    answers:   {}, score: 0
};

let timerInterval = null;
let timerEndTime  = parseInt(sessionStorage.getItem('timerEndTime') || '0');

// ── Answer Key ───────────────────────────────────────────────
const evolQuizData = {
    1:  { correctIndex: 1, explanation: "Cooksonia (~430 Ma) was the first vascular plant with water-conducting tissues." },
    2:  { correctIndex: 1, explanation: "Archaeopteris developed deep root systems (>1 m) that created true soil." },
    3:  { correctIndex: 2, explanation: "Atmospheric O\u2082 reached 35%, enabling giant insects through diffusion-based respiration." },
    4:  { correctIndex: 2, explanation: "The Siberian Traps eruptions released massive CO\u2082, causing global warming and ocean acidification." },
    5:  { correctIndex: 1, explanation: "The first dinosaurs appeared around 230 million years ago in the Late Triassic." },
    6:  { correctIndex: 1, explanation: "Archaeopteryx (~150 Ma) showed clear transitional features between dinosaurs and birds." },
    7:  { correctIndex: 2, explanation: "Angiosperms co-evolved with pollinators, leading to explosive diversification." },
    8:  { correctIndex: 2, explanation: "Homo sapiens evolved approximately 300,000 years ago in Africa." },
    9:  { correctIndex: 1, explanation: "Oxygen accumulation and ozone layer formation blocked UV radiation, enabling terrestrial life." },
    10: { correctIndex: 1, explanation: "The amniotic egg (~325 Ma) freed vertebrates from needing water for reproduction." }
};

// ── Page initialisation ──────────────────────────────────────
function initializePage() {
    const storedConfig = sessionStorage.getItem('quizConfig');
    if (storedConfig) quizConfig = JSON.parse(storedConfig);

    const isLoginPage = window.location.pathname.includes('index.html')
                     || window.location.pathname.endsWith('/');

    if (!isLoginPage) {
        if (!studentData.name || !studentData.studentID || !studentData.sessionId) {
            window.location.href = 'index.html'; return;
        }
        studentData.answers = JSON.parse(sessionStorage.getItem('answers') || '{}');
        studentData.score   = parseFloat(sessionStorage.getItem('score') || '0');
        updateBanner();
        restoreQuizAnswers();

        if (timerEndTime > 0) {
            if (timerEndTime > Date.now()) {
                startTimerDisplay();
            } else {
                sessionStorage.setItem('quizCompleted', 'true');
                const td = document.getElementById('timerDisplay');
                const tr = document.getElementById('timeRemaining');
                const wm = document.getElementById('timeWarningMessage');
                if (td) td.style.display = 'flex';
                if (tr) tr.textContent = '0:00';
                if (wm) { wm.textContent = 'TIME IS UP!'; wm.style.display = 'inline'; }
                document.querySelectorAll('.quiz-option').forEach(opt => {
                    opt.classList.add('locked'); opt.style.cursor = 'not-allowed';
                });
            }
        }
    }

    initHoverContainers();

    // Populate voiceover script text from dynamically loaded slide script file
    const scriptTextEl = document.getElementById('scriptText');
    if (scriptTextEl && window.VOICEOVER_SCRIPT) {
        scriptTextEl.innerHTML = '<p>' + window.VOICEOVER_SCRIPT + '</p>';
        delete window.VOICEOVER_SCRIPT;
    }
}

// ── Student Banner ───────────────────────────────────────────
function updateBanner() {
    const bannerEl         = document.getElementById('studentBanner');
    const nameEl           = document.getElementById('displayName');
    const idEl             = document.getElementById('displayID');
    const scoreEl          = document.getElementById('displayScore');
    const attemptDisplayEl = document.getElementById('attemptDisplay');
    const attemptNumEl     = document.getElementById('attemptNumber');

    if (bannerEl) bannerEl.style.display = 'flex';
    if (nameEl)   nameEl.textContent  = studentData.name;
    if (idEl)     idEl.textContent    = studentData.studentID;

    if (scoreEl) {
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        const maxPts  = TOTAL_QUESTIONS * ptsPerQ;
        const curPts  = studentData.score * ptsPerQ;
        const fmt = v => (v % 1 === 0) ? v.toFixed(0) : v.toFixed(1);
        scoreEl.textContent = `${fmt(curPts)} / ${fmt(maxPts)}`;
    }

    const storedAttempt = sessionStorage.getItem('attemptNumber');
    const maxAttempts   = sessionStorage.getItem('maxAttempts');
    if (maxAttempts && parseInt(maxAttempts) > 0 && attemptDisplayEl) {
        attemptDisplayEl.style.display = 'block';
        if (attemptNumEl) attemptNumEl.textContent = `${storedAttempt || '1'} / ${maxAttempts}`;
    }
}

// ── Quiz Answer Handling ─────────────────────────────────────
function handleQuizAnswer(questionNum, optionIndex) {
    if (sessionStorage.getItem('quizCompleted') === 'true' ||
        (timerEndTime > 0 && Date.now() > timerEndTime)) {
        document.querySelectorAll('.quiz-option').forEach(o => o.classList.add('locked'));
        return;
    }
    if (studentData.answers[questionNum] !== undefined) return;

    const q = evolQuizData[questionNum];
    const isCorrect = (optionIndex === q.correctIndex);
    studentData.answers[questionNum] = { selected: optionIndex, correct: isCorrect };
    if (isCorrect) studentData.score += 1;
    sessionStorage.setItem('answers', JSON.stringify(studentData.answers));
    sessionStorage.setItem('score',   studentData.score.toString());
    updateBanner();
    renderQuizFeedback(questionNum, optionIndex, isCorrect, q);
    saveAnswerToFirebase(questionNum, optionIndex, isCorrect);
}

function renderQuizFeedback(questionNum, selectedIndex, isCorrect, q) {
    const block = document.querySelector(`[data-question="${questionNum}"]`);
    if (!block) return;
    const options = block.querySelectorAll('.quiz-option');
    options.forEach((opt, idx) => {
        opt.classList.add('locked'); opt.style.pointerEvents = 'none';
        if (idx === q.correctIndex)               opt.classList.add('correct');
        else if (idx === selectedIndex && !isCorrect) opt.classList.add('incorrect');
    });
    const fb = block.querySelector('.quiz-feedback-box');
    if (fb) {
        fb.classList.add(isCorrect ? 'show-correct' : 'show-incorrect');
        fb.innerHTML = isCorrect ? `\u2713 Correct! ${q.explanation}` : `\u2717 Incorrect. ${q.explanation}`;
    }
}

function restoreQuizAnswers() {
    if (sessionStorage.getItem('quizCompleted') === 'true' ||
        (timerEndTime > 0 && Date.now() > timerEndTime)) {
        sessionStorage.setItem('quizCompleted', 'true');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.add('locked'); opt.style.cursor = 'not-allowed';
        });
    }
    document.querySelectorAll('[data-question]').forEach(block => {
        const qNum = parseInt(block.dataset.question);
        const saved = studentData.answers[qNum];
        if (saved !== undefined) renderQuizFeedback(qNum, saved.selected, saved.correct, evolQuizData[qNum]);
    });
}

async function saveAnswerToFirebase(questionNum, selectedIndex, isCorrect) {
    if (!db || !studentData.sessionId) return;
    try {
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        await db.collection('students').doc(studentData.sessionId).update({
            [`q${questionNum}_answer`]: selectedIndex,
            [`q${questionNum}_correct`]: isCorrect,
            score: studentData.score * ptsPerQ,
            lastUpdated: firebase.firestore.Timestamp.now()
        });
    } catch (e) { console.warn('Firebase save error:', e); }
}

// ── Timer Display ────────────────────────────────────────────
function startTimerDisplay() {
    const timerDisplay  = document.getElementById('timerDisplay');
    const timeRemaining = document.getElementById('timeRemaining');
    const warningMsg    = document.getElementById('timeWarningMessage');
    if (!timerDisplay || !timeRemaining) return;
    timerDisplay.style.display = 'flex';

    if (timerInterval) clearInterval(timerInterval);

    // Build warning thresholds from lowTimeWarning (minutes) down to 1
    const lowWarnMin = parseInt(quizConfig.restrictions.lowTimeWarning) || 3;
    const warnThresholds = [];
    for (let m = 1; m <= lowWarnMin; m++) {
        warnThresholds.push({
            secs:  m * 60 - 1,   // 59, 119, 179 … trigger at X:59
            label: `${m} minute${m !== 1 ? 's' : ''} left!`
        });
    }

    tickTimer();
    timerInterval = setInterval(tickTimer, 1000);

    function tickTimer() {
        const totalSec = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
        const minutes  = Math.floor(totalSec / 60);
        const seconds  = totalSec % 60;
        timeRemaining.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (!warningMsg) return;

        if (totalSec <= 0) {
            clearInterval(timerInterval);
            sessionStorage.setItem('quizCompleted', 'true');
            warningMsg.textContent = 'TIME IS UP!';
            warningMsg.style.display = 'inline';
            warningMsg.style.color   = '#ff4444';

            document.querySelectorAll('.quiz-option').forEach(opt => {
                opt.classList.add('locked'); opt.style.cursor = 'not-allowed';
            });

            if (db && studentData.sessionId) {
                const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
                db.collection('students').doc(studentData.sessionId).update({
                    completed: true,
                    completionTime: firebase.firestore.Timestamp.now(),
                    autoSubmitted: true,
                    score: studentData.score * ptsPerQ,
                    answers: studentData.answers
                }).catch(e => console.warn('Auto-submit error:', e));
            }

            setTimeout(() => {
                if (!window.location.pathname.includes('outro')) window.location.href = 'outro.html';
            }, 3000);

            const submitBtn = document.getElementById('submitBtn');
            const submitMsg = document.getElementById('submitConfirmMsg');
            if (submitBtn) submitBtn.disabled = true;
            if (submitMsg) { submitMsg.style.display = 'block'; submitMsg.textContent = '\u2713 Quiz auto-submitted (time expired).'; }

        } else {
            let shown = false;
            for (const t of warnThresholds) {
                if (totalSec <= t.secs) {
                    warningMsg.textContent   = t.label;
                    warningMsg.style.display = 'inline';
                    warningMsg.style.color   = '#ff4444';
                    shown = true; break;
                }
            }
            if (!shown) warningMsg.style.display = 'none';
        }
    }
}

// ── Final Submit ─────────────────────────────────────────────
async function submitQuiz() {
    const submitBtn  = document.getElementById('submitBtn');
    const confirmMsg = document.getElementById('submitConfirmMsg');

    if (sessionStorage.getItem('quizCompleted') === 'true') {
        if (submitBtn)  submitBtn.disabled = true;
        if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = '\u2713 Quiz already submitted.'; }
        return;
    }

    if (submitBtn)  submitBtn.disabled = true;
    if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = 'Submitting\u2026'; }
    sessionStorage.setItem('quizCompleted', 'true');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    if (db && studentData.sessionId) {
        try {
            const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
            await db.collection('students').doc(studentData.sessionId).update({
                completed: true,
                completionTime: firebase.firestore.Timestamp.now(),
                score: studentData.score * ptsPerQ,
                answers: studentData.answers
            });
            if (confirmMsg) confirmMsg.textContent = '\u2713 Quiz submitted successfully!';
        } catch (e) {
            console.warn('Submit error:', e);
            if (confirmMsg) confirmMsg.textContent = '\u2713 Answers recorded locally.';
        }
    } else {
        if (confirmMsg) confirmMsg.textContent = '\u2713 Answers recorded locally.';
    }

    document.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.add('locked'); opt.style.cursor = 'not-allowed';
    });

    const warningMsg = document.getElementById('timeWarningMessage');
    if (warningMsg) { warningMsg.textContent = 'Submitted'; warningMsg.style.display = 'inline'; warningMsg.style.color = '#4dffb8'; }
}

// ── Voiceover Audio Panel ────────────────────────────────────
let voiceoverPaused = false;

function startInstructions() {
    const audio     = document.getElementById('pageAudio');
    const scriptBox = document.getElementById('instructionScriptBox');
    const scriptText= document.getElementById('scriptText');
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    voiceoverPaused = false;
    if (scriptBox)  scriptBox.classList.add('expanded');
    if (scriptText) scriptText.classList.add('show');
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.classList.remove('play-blink');
    // Play click = user gesture → enable hover audio
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

function resumeInstructions() {
    const audio = document.getElementById('pageAudio');
    if (!audio) return;
    if (audio.paused) { audio.play().catch(() => {}); voiceoverPaused = false; }
    else              { audio.pause(); voiceoverPaused = true; }
}

function stopInstructions() {
    const audio     = document.getElementById('pageAudio');
    const scriptBox = document.getElementById('instructionScriptBox');
    const scriptText= document.getElementById('scriptText');
    if (!audio) return;
    audio.pause(); audio.currentTime = 0; voiceoverPaused = false;
    if (scriptBox)  scriptBox.classList.remove('expanded');
    if (scriptText) scriptText.classList.remove('show');
}

// ── Hover-over Animation Feature ────────────────────────────
function initHoverContainers() {
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const containers = document.querySelectorAll('.hover-container');
    if (!containers.length) return;

    containers.forEach(el => {
        const hint = el.querySelector('.hint');
        if (hint) hint.textContent = isMobile ? 'tap to animate' : 'hover to animate';
        const vid = el.querySelector('video');
        if (vid) vid.load();
    });

    if (isMobile) {
        containers.forEach(el => {
            const vid = el.querySelector('video');
            if (!vid) return;
            el.addEventListener('touchend', function(e) {
                e.preventDefault();
                if (el.classList.contains('playing')) {
                    vid.pause(); vid.currentTime = 0; el.classList.remove('playing');
                } else {
                    containers.forEach(other => {
                        if (other !== el && other.classList.contains('playing')) {
                            const ov = other.querySelector('video');
                            ov.pause(); ov.currentTime = 0; other.classList.remove('playing');
                        }
                    });
                    el.classList.add('playing');
                    vid.muted = false;
                    vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
                }
            }, { passive: false });
        });
        return;
    }

    let pageActivated = false;
    document.addEventListener('mousedown', () => {
        if (pageActivated) return;
        pageActivated = true;
        containers.forEach(el => {
            const vid = el.querySelector('video');
            if (vid && !vid.paused && vid.muted) vid.muted = false;
        });
    });

    containers.forEach(el => {
        const vid = el.querySelector('video');
        if (!vid) return;
        el.classList.add('desktop');
        el.addEventListener('mouseenter', () => {
            vid.muted = !pageActivated;
            vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
        });
        el.addEventListener('mouseleave', () => {
            vid.pause(); vid.currentTime = 0; vid.muted = false;
        });
    });
}

// ── Auto-init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const clockFix = document.createElement('style');
    clockFix.textContent = `
        #timeRemaining {
            display: inline-block; min-width: 4.2em;
            text-align: right; font-variant-numeric: tabular-nums;
            font-feature-settings: "tnum"; letter-spacing: 0.03em;
        }`;
    document.head.appendChild(clockFix);
    initializePage();
});
