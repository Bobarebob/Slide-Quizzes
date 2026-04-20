// ============================================================
// star-shared.js  –  Star Lifecycle Quiz  (Module 8A)
// Firebase config + quiz answer key + shared page logic
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
} catch (error) {
    console.warn('Firebase not available – running in standalone mode');
}

const QUIZ_PASSWORD = "coffee";

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Quiz Password' },
    restrictions: {
        timeLimit: 0, lowTimeWarning: 3,
        startDate: '', startTime: '', stopDate: '', stopTime: '',
        attemptsAllowed: 0, pointsPerQuestion: 1.0
    }
};

let studentData = {
    name:      sessionStorage.getItem('studentName')  || '',
    studentID: sessionStorage.getItem('studentID')    || '',
    sessionId: sessionStorage.getItem('sessionId')    || '',
    answers: {},
    score: 0
};

let timerInterval = null;
let timerEndTime = parseInt(sessionStorage.getItem('timerEndTime') || '0');

// ── Answer Key ─────────────────────────────────────────────
// 8 questions total: 2 per slide × 4 slides
// correctIndex is 0-based position in the options array
const starQuizData = {
    's1Q1': { dbNum: 1, correctLetter: 'C', correctIndex: 2 },   // Hydrogen & Helium
    's1Q2': { dbNum: 2, correctLetter: 'B', correctIndex: 1 },   // Population II
    's2Q1': { dbNum: 3, correctLetter: 'B', correctIndex: 1 },   // O B A F G K M
    's2Q2': { dbNum: 4, correctLetter: 'C', correctIndex: 2 },   // Temperature vs Luminosity
    's3Q1': { dbNum: 5, correctLetter: 'C', correctIndex: 2 },   // Neutron star
    's3Q2': { dbNum: 6, correctLetter: 'B', correctIndex: 1 },   // Electron degeneracy pressure
    's4Q1': { dbNum: 7, correctLetter: 'C', correctIndex: 2 },   // 80-100 billion years
    's4Q2': { dbNum: 8, correctLetter: 'B', correctIndex: 1 },   // Blue dwarf → white dwarf
};

const TOTAL_QUESTIONS = 8;

// ── Page initialisation ────────────────────────────────────
function initializePage() {
    const storedConfig = sessionStorage.getItem('quizConfig');
    if (storedConfig) quizConfig = JSON.parse(storedConfig);

    const isLoginPage = window.location.pathname.includes('index.html')
                     || window.location.pathname.endsWith('/');

    if (!isLoginPage) {
        if (!studentData.name || !studentData.studentID || !studentData.sessionId) {
            window.location.href = 'index.html';
            return;
        }
        studentData.answers = JSON.parse(sessionStorage.getItem('answers') || '{}');
        studentData.score   = parseFloat(sessionStorage.getItem('score') || '0');
        updateBanner();
        restoreAnswers();

        // Start timer if time limit is active
        if (timerEndTime > 0 && document.getElementById('timerDisplay')) {
            if (timerEndTime > Date.now()) {
                startTimerDisplay();
            } else {
                // Timer already expired — show TIME IS UP and lock everything
                sessionStorage.setItem('quizCompleted', 'true');
                const td = document.getElementById('timerDisplay');
                const tr = document.getElementById('timeRemaining');
                const wm = document.getElementById('timeWarningMessage');
                if (td) td.style.display = 'flex';
                if (tr) tr.textContent = '0:00';
                if (wm) { wm.textContent = 'TIME IS UP!'; wm.style.display = 'inline'; }
                document.querySelectorAll('.quiz-option').forEach(opt => {
                    opt.classList.add('locked');
                    opt.style.cursor = 'not-allowed';
                });
            }
        }
    }
}

// ── Student banner ─────────────────────────────────────────
function updateBanner() {
    const nameEl    = document.getElementById('displayName');
    const idEl      = document.getElementById('displayID');
    const scoreEl   = document.getElementById('displayScore');
    const bannerEl  = document.getElementById('studentBanner');
    const attemptEl = document.getElementById('attemptNumber');
    const attemptDisplayEl = document.getElementById('attemptDisplay');

    if (nameEl)  nameEl.textContent  = studentData.name;
    if (idEl)    idEl.textContent    = studentData.studentID;
    if (scoreEl) {
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        const maxPts  = TOTAL_QUESTIONS * ptsPerQ;
        const curPts  = studentData.score * ptsPerQ;
        scoreEl.textContent = `${curPts % 1 === 0 ? curPts.toFixed(0) : curPts.toFixed(1)} / ${maxPts % 1 === 0 ? maxPts.toFixed(0) : maxPts.toFixed(1)}`;
    }
    if (bannerEl) bannerEl.style.display = 'flex';

    const storedAttempt = sessionStorage.getItem('attemptNumber');
    const maxAttempts   = sessionStorage.getItem('maxAttempts');
    if (storedAttempt && parseInt(storedAttempt) > 1 && attemptEl && attemptDisplayEl) {
        attemptEl.textContent = storedAttempt;
        attemptDisplayEl.style.display = 'block';
    }
    if (maxAttempts && parseInt(maxAttempts) > 0 && attemptDisplayEl) {
        attemptDisplayEl.style.display = 'block';
        if (attemptEl) {
            attemptEl.textContent = `${storedAttempt || '1'} / ${maxAttempts}`;
        }
    }
}

// ── Quiz answering ─────────────────────────────────────────
function handleQuizAnswer(questionId, clickedEl, selectedLetter) {
    // Block if time expired or quiz already completed
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.add('locked'));
        return;
    }

    const questionData = starQuizData[questionId];
    if (!questionData) return;

    const block   = clickedEl.closest('.quiz-question-block');
    const options  = block.querySelectorAll('.quiz-option');
    const feedback = block.querySelector('.quiz-feedback-box');

    // Prevent re-answering
    if (studentData.answers[questionId] !== undefined) return;
    options.forEach(o => o.classList.add('locked'));

    const isCorrect = (selectedLetter === questionData.correctLetter);
    clickedEl.classList.add(isCorrect ? 'correct' : 'incorrect');

    if (!isCorrect) {
        options[questionData.correctIndex].classList.add('correct');
    }

    if (feedback) {
        feedback.classList.add(isCorrect ? 'show-correct' : 'show-incorrect');
        feedback.textContent = isCorrect
            ? '✓ Correct! Well done.'
            : `✗ Not quite. The correct answer is ${questionData.correctLetter}.`;
    }

    studentData.answers[questionId] = selectedLetter;
    if (isCorrect) studentData.score++;

    sessionStorage.setItem('answers', JSON.stringify(studentData.answers));
    sessionStorage.setItem('score',   studentData.score.toString());

    updateBanner();
    saveAnswerToFirebase(questionId, selectedLetter, isCorrect, questionData.dbNum);
}

// ── Restore previously-answered questions on page load ─────
function restoreAnswers() {
    // If time expired or quiz completed, lock ALL unanswered questions
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        sessionStorage.setItem('quizCompleted', 'true');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.add('locked');
            opt.style.cursor = 'not-allowed';
        });
    }

    Object.keys(studentData.answers).forEach(qId => {
        const qData      = starQuizData[qId];
        if (!qData) return;
        const selectedLetter = studentData.answers[qId];
        const block = document.querySelector(`[onclick*="${qId}"]`)?.closest('.quiz-question-block');
        if (!block) return;

        const options  = block.querySelectorAll('.quiz-option');
        const feedback = block.querySelector('.quiz-feedback-box');
        options.forEach(o => o.classList.add('locked'));

        const isCorrect = (selectedLetter === qData.correctLetter);
        options.forEach(o => {
            if (o.getAttribute('data-letter') === selectedLetter)
                o.classList.add(isCorrect ? 'correct' : 'incorrect');
        });
        if (!isCorrect) options[qData.correctIndex].classList.add('correct');

        if (feedback) {
            feedback.classList.add(isCorrect ? 'show-correct' : 'show-incorrect');
            feedback.textContent = isCorrect
                ? '✓ Correct! Well done.'
                : `✗ Not quite. The correct answer was ${qData.correctLetter}.`;
        }
    });
}

// ── Firebase save ──────────────────────────────────────────
async function saveAnswerToFirebase(questionId, letter, correct, dbNum) {
    if (!db || !studentData.sessionId) return;
    try {
        const updateData = {
            [`q${dbNum}_answer`]: letter,
            [`q${dbNum}_correct`]: correct,
            lastUpdated: firebase.firestore.Timestamp.now()
        };
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        updateData.score = studentData.score * ptsPerQ;
        await db.collection('students').doc(studentData.sessionId).update(updateData);
    } catch (e) {
        console.warn('Firebase save error:', e);
    }
}

// ── Timer display ──────────────────────────────────────────
function startTimerDisplay() {
    const timerDisplay  = document.getElementById('timerDisplay');
    const timeRemaining = document.getElementById('timeRemaining');
    const warningMsg    = document.getElementById('timeWarningMessage');
    if (!timerDisplay || !timeRemaining) return;
    timerDisplay.style.display = 'flex';

    if (timerInterval) clearInterval(timerInterval);

    // Immediate first tick so there's no 1-second blank
    tickTimer();

    timerInterval = setInterval(tickTimer, 1000);

    function tickTimer() {
        const now = Date.now();
        const remainingMs = timerEndTime - now;
        const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        timeRemaining.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (warningMsg) {
            if (totalSec <= 0) {
                // ── TIME IS UP ──
                sessionStorage.setItem('quizCompleted', 'true');
                warningMsg.textContent = 'TIME IS UP!';
                warningMsg.style.display = 'inline';
                clearInterval(timerInterval);

                // Lock all quiz options on this page
                document.querySelectorAll('.quiz-option').forEach(opt => {
                    opt.classList.add('locked');
                    opt.style.cursor = 'not-allowed';
                });

                // Auto-submit to Firebase
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

                // Show "TIME IS UP!" for 3 seconds, then redirect to outro
                setTimeout(() => {
                    if (!window.location.pathname.includes('outro')) {
                        window.location.href = 'outro.html';
                    }
                }, 3000);

                // If already on outro, gray out the submit button immediately
                const submitBtn = document.getElementById('submitBtn');
                const submitMsg = document.getElementById('submitConfirmMsg');
                if (submitBtn) submitBtn.disabled = true;
                if (submitMsg) {
                    submitMsg.style.display = 'block';
                    submitMsg.textContent = '✓ Quiz auto-submitted (time expired).';
                }

            } else if (totalSec <= 59) {
                warningMsg.textContent = 'Less than 1 minute left!';
                warningMsg.style.display = 'inline';
            } else if (totalSec <= 119) {
                warningMsg.textContent = 'Two minutes left!';
                warningMsg.style.display = 'inline';
            } else if (totalSec <= 179) {
                warningMsg.textContent = 'Three minutes left!';
                warningMsg.style.display = 'inline';
            } else {
                warningMsg.style.display = 'none';
            }
        }
    }
}

// ── Final submit ───────────────────────────────────────────
async function submitQuiz() {
    const submitBtn = document.getElementById('submitBtn');
    const confirmMsg = document.getElementById('submitConfirmMsg');

    // If already auto-submitted by timer, just show the state
    if (sessionStorage.getItem('quizCompleted') === 'true') {
        if (submitBtn) submitBtn.disabled = true;
        if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = '✓ Quiz already submitted.'; }
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = 'Submitting…'; }

    if (db && studentData.sessionId) {
        try {
            const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
            await db.collection('students').doc(studentData.sessionId).update({
                completed: true,
                completionTime: firebase.firestore.Timestamp.now(),
                score: studentData.score * ptsPerQ,
                answers: studentData.answers
            });
            if (confirmMsg) confirmMsg.textContent = '✓ Quiz submitted successfully!';
        } catch (e) {
            console.warn('Submit error:', e);
            if (confirmMsg) confirmMsg.textContent = '✓ Answers recorded locally.';
        }
    } else {
        if (confirmMsg) confirmMsg.textContent = '✓ Answers recorded locally.';
    }

    // ── Lock down the quiz (same behavior as auto-submit on timeout) ──
    sessionStorage.setItem('quizCompleted', 'true');

    // Stop the countdown timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Lock all quiz options on this page (other pages pick it up via restoreAnswers)
    document.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.add('locked');
        opt.style.cursor = 'not-allowed';
    });

    // Update timer display to show submitted state
    const warningMsg = document.getElementById('timeWarningMessage');
    if (warningMsg) {
        warningMsg.textContent = 'Submitted';
        warningMsg.style.display = 'inline';
        warningMsg.style.color = '#4dffb8';
    }
}

// ── Auto-init on DOMContentLoaded ──────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    // Inject clock-stabilization CSS (prevent jitter from changing digit widths)
    const clockFix = document.createElement('style');
    clockFix.textContent = `
        #timeRemaining {
            display: inline-block;
            min-width: 4.2em;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-feature-settings: "tnum";
            letter-spacing: 0.03em;
        }
    `;
    document.head.appendChild(clockFix);
    initializePage();
});
