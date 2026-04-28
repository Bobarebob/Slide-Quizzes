// ============================================================
// lab4a-shared.js  –  Lab 4A Diffraction Lab
// Firebase config + shared page logic (session, timer, banner)
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

const QUIZ_PASSWORD = "carrot";
const MAX_LAB_SCORE = 6.0;

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Lab Password' },
    restrictions: {
        timeLimit: 0, lowTimeWarning: 3,
        startDateTime: '', stopDateTime: '',
        attemptsAllowed: 0, pointsPerQuestion: 0.5
    }
};

let studentData = {
    name:      sessionStorage.getItem('studentName')  || '',
    studentID: sessionStorage.getItem('studentID')    || '',
    sessionId: sessionStorage.getItem('sessionId')    || '',
    score:     parseFloat(sessionStorage.getItem('labScore') || '0')
};

let timerInterval = null;
let timerEndTime = parseInt(sessionStorage.getItem('timerEndTime') || '0');

// ── Page initialisation ─────────────────────────────────────
function initializePage() {
    const storedConfig = sessionStorage.getItem('quizConfig');
    if (storedConfig) quizConfig = JSON.parse(storedConfig);

    const isLoginPage = window.location.pathname.includes('index.html')
                     || window.location.pathname.endsWith('/')
                     || window.location.pathname.endsWith('/lab4a');

    if (!isLoginPage) {
        if (!studentData.name || !studentData.studentID || !studentData.sessionId) {
            window.location.href = 'index.html';
            return;
        }
        studentData.score = parseFloat(sessionStorage.getItem('labScore') || '0');
        updateBanner();

        if (timerEndTime > 0 && document.getElementById('timerDisplay')) {
            if (timerEndTime > Date.now()) {
                startTimerDisplay();
            } else {
                sessionStorage.setItem('labCompleted', 'true');
                const td = document.getElementById('timerDisplay');
                const tr = document.getElementById('timeRemaining');
                const wm = document.getElementById('timeWarningMessage');
                if (td) td.style.display = 'flex';
                if (tr) tr.textContent = '0:00';
                if (wm) { wm.textContent = 'TIME IS UP!'; wm.style.display = 'inline'; }
            }
        }
    }
}

// ── Student banner ──────────────────────────────────────────
function updateBanner() {
    const nameEl   = document.getElementById('displayName');
    const idEl     = document.getElementById('displayID');
    const scoreEl  = document.getElementById('displayScore');
    const bannerEl = document.getElementById('studentBanner');
    const attemptEl        = document.getElementById('attemptNumber');
    const attemptDisplayEl = document.getElementById('attemptDisplay');

    if (nameEl)   nameEl.textContent  = studentData.name;
    if (idEl)     idEl.textContent    = studentData.studentID;
    if (scoreEl) {
        const pts = parseFloat(sessionStorage.getItem('labScore') || '0');
        scoreEl.textContent = pts.toFixed(1) + ' / ' + MAX_LAB_SCORE.toFixed(1) + ' pts';
    }
    if (bannerEl) bannerEl.style.display = 'flex';

    const storedAttempt = sessionStorage.getItem('attemptNumber');
    const maxAttempts   = sessionStorage.getItem('maxAttempts');
    if (maxAttempts && parseInt(maxAttempts) > 0 && attemptDisplayEl) {
        attemptDisplayEl.style.display = 'block';
        if (attemptEl) attemptEl.textContent = `${storedAttempt || '1'} / ${maxAttempts}`;
    } else if (storedAttempt && parseInt(storedAttempt) > 1 && attemptEl && attemptDisplayEl) {
        attemptEl.textContent = storedAttempt;
        attemptDisplayEl.style.display = 'block';
    }
}

// ── Called by lab page each time a calc step is scored ──────
function updateBannerScore(pts) {
    studentData.score = pts;
    sessionStorage.setItem('labScore', pts.toFixed(1));
    const scoreEl = document.getElementById('displayScore');
    if (scoreEl) scoreEl.textContent = pts.toFixed(1) + ' / ' + MAX_LAB_SCORE.toFixed(1) + ' pts';
    // Live-save to Firebase — field name 'score' matches teacher.html reads
    if (db && studentData.sessionId) {
        db.collection('students').doc(studentData.sessionId).update({
            score: pts,
            lastUpdated: firebase.firestore.Timestamp.now()
        }).catch(e => console.warn('Score live-save error:', e));
    }
}

// ── Timer display ───────────────────────────────────────────
function startTimerDisplay() {
    const timerDisplay  = document.getElementById('timerDisplay');
    const timeRemaining = document.getElementById('timeRemaining');
    const warningMsg    = document.getElementById('timeWarningMessage');
    if (!timerDisplay || !timeRemaining) return;
    timerDisplay.style.display = 'flex';

    if (timerInterval) clearInterval(timerInterval);
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
                sessionStorage.setItem('labCompleted', 'true');
                warningMsg.textContent = 'TIME IS UP!';
                warningMsg.style.display = 'inline';
                clearInterval(timerInterval);

                // Auto-submit — 'score' field matches teacher.html
                if (db && studentData.sessionId) {
                    db.collection('students').doc(studentData.sessionId).update({
                        completed: true,
                        completionTime: firebase.firestore.Timestamp.now(),
                        autoSubmitted: true,
                        score: parseFloat(sessionStorage.getItem('labScore') || '0')
                    }).catch(e => console.warn('Auto-submit error:', e));
                }

                setTimeout(() => {
                    if (!window.location.pathname.includes('outro')) {
                        window.location.href = 'outro.html';
                    }
                }, 3000);

                const submitBtn = document.getElementById('submitBtn');
                const submitMsg = document.getElementById('submitConfirmMsg');
                if (submitBtn) submitBtn.disabled = true;
                if (submitMsg) { submitMsg.style.display = 'block'; submitMsg.textContent = '✓ Lab auto-submitted (time expired).'; }

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

// ── Final submit (called from outro) ───────────────────────
async function submitLab() {
    const submitBtn  = document.getElementById('submitBtn');
    const confirmMsg = document.getElementById('submitConfirmMsg');

    if (sessionStorage.getItem('labCompleted') === 'true') {
        if (submitBtn)  submitBtn.disabled = true;
        if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = '✓ Lab already submitted.'; }
        return;
    }

    if (submitBtn)  submitBtn.disabled = true;
    if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = 'Submitting…'; }

    const finalScore = parseFloat(sessionStorage.getItem('labScore') || '0');

    if (db && studentData.sessionId) {
        try {
            // 'score' is the field teacher.html reads from the students collection
            await db.collection('students').doc(studentData.sessionId).update({
                completed: true,
                completionTime: firebase.firestore.Timestamp.now(),
                score: finalScore
            });
            if (confirmMsg) confirmMsg.textContent = '✓ Lab submitted successfully!';
        } catch (e) {
            console.warn('Submit error:', e);
            if (confirmMsg) confirmMsg.textContent = '✓ Score recorded locally.';
        }
    } else {
        if (confirmMsg) confirmMsg.textContent = '✓ Score recorded locally.';
    }

    sessionStorage.setItem('labCompleted', 'true');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    const warningMsg = document.getElementById('timeWarningMessage');
    if (warningMsg) { warningMsg.textContent = 'Submitted'; warningMsg.style.display = 'inline'; warningMsg.style.color = '#4dffb8'; }
}

// ── Auto-init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const clockFix = document.createElement('style');
    clockFix.textContent = `
        #timeRemaining {
            display: inline-block; min-width: 4.2em; text-align: right;
            font-variant-numeric: tabular-nums;
            font-feature-settings: "tnum"; letter-spacing: 0.03em;
        }
    `;
    document.head.appendChild(clockFix);
    initializePage();
});
