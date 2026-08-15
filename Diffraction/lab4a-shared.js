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

// ============================================================
// QUIZ_ID — the permanent identifier baked into THIS lab.
// It must EXACTLY match the "Quiz ID" typed in the dashboard.
// The password is NOT baked in any more: students type it and it
// is verified against this ID, so two quizzes open at once can
// never resolve to each other. (Was: QUIZ_PASSWORD = "carrot")
// ============================================================
const QUIZ_ID = "DIFF01";

// 12 scored calculation cells; the per-cell award comes from the
// dashboard (pointsPerQuestion), so the max follows it.
const TOTAL_STEPS = 12;
function ptsPerQuestion() {
    return parseFloat(quizConfig.restrictions && quizConfig.restrictions.pointsPerQuestion) || 0.5;
}
function maxLabScore() { return TOTAL_STEPS * ptsPerQuestion(); }

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Lab Password' },
    restrictions: {
        timeLimit: 0, lowTimeWarning: 3,
        startDateTime: '', stopDateTime: '', reviewStopDateTime: null,
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

// ── Login: resolve this lab against the dashboard ───────────
// Page-load (cosmetic): fetch this lab's login field labels.
// Resolves by QUIZ_ID alone, so it is best-effort and never blocks login.
async function loadLoginDescriptors() {
    try {
        if (!db) return false;
        const snap = await db.collection('quizzes').where('quizId', '==', QUIZ_ID).limit(1).get();
        if (snap.empty) return false;
        const q = snap.docs[0].data();
        const settingsDoc = await db.collection('quizSettings').doc(`${q.className}_${q.name}`).get();
        if (settingsDoc.exists && settingsDoc.data().loginDescriptors) {
            quizConfig.loginDescriptors = settingsDoc.data().loginDescriptors;
        }
        return true;
    } catch (e) {
        console.warn('Could not preload login descriptors:', e);
        return false;
    }
}

// Login-time: verify QUIZ_ID + the password the student typed.
// True only when exactly one class-quiz matches — no cross-contamination.
async function resolveQuizConfig(enteredPassword) {
    try {
        if (!db) throw new Error('Database not available - running in standalone mode');
        const snap = await db.collection('quizzes')
            .where('quizId', '==', QUIZ_ID)
            .where('password', '==', enteredPassword)
            .limit(1).get();
        if (snap.empty) return false;          // wrong password for THIS lab

        const q = snap.docs[0].data();
        quizConfig.className  = q.className;
        quizConfig.quizName   = q.name;
        quizConfig.databaseId = `${q.className}_${q.name}`;

        const settingsDoc = await db.collection('quizSettings').doc(quizConfig.databaseId).get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            if (settings.loginDescriptors) quizConfig.loginDescriptors = settings.loginDescriptors;
            if (settings.restrictions)     quizConfig.restrictions     = settings.restrictions;
            if (settings.idValidation)     quizConfig.idValidation     = settings.idValidation;
        }
        sessionStorage.setItem('quizConfig', JSON.stringify(quizConfig));
        return true;
    } catch (error) {
        console.error('Error resolving quiz configuration:', error);
        return false;
    }
}

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
        scoreEl.textContent = pts.toFixed(1) + ' / ' + maxLabScore().toFixed(1) + ' pts';
    }
    if (bannerEl) bannerEl.style.display = 'flex';

    // Attempts field. Normally "X / Y"; during an ungraded review session it says
    // so instead, because there is no attempt number to report. reviewMode is set
    // at login:  'attempts' — all attempts used   'closed' — graded window shut.
    const storedAttempt = sessionStorage.getItem('attemptNumber');
    const maxAttempts   = sessionStorage.getItem('maxAttempts');
    const reviewMode    = sessionStorage.getItem('reviewMode');
    if (attemptEl && attemptDisplayEl && reviewMode === 'attempts') {
        attemptEl.textContent = (maxAttempts && maxAttempts !== '0')
            ? `used (${maxAttempts} of ${maxAttempts}) — reviewing, not graded`
            : 'Reviewing — not graded';
        attemptDisplayEl.style.display = 'block';
    } else if (attemptEl && attemptDisplayEl && reviewMode === 'closed') {
        const closedOn = sessionStorage.getItem('creditCloseLabel');
        attemptEl.textContent = closedOn
            ? `closed ${closedOn} — reviewing, not graded`
            : 'closed — reviewing, not graded';
        attemptDisplayEl.style.display = 'block';
    } else if (maxAttempts && parseInt(maxAttempts) > 0 && attemptDisplayEl) {
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
    if (scoreEl) scoreEl.textContent = pts.toFixed(1) + ' / ' + maxLabScore().toFixed(1) + ' pts';
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

                // Lock the page immediately — don't wait for the redirect
                if (typeof lockLab === 'function') lockLab();

                // Auto-submit — 'score' field matches teacher.html
                if (db && studentData.sessionId) {
                    db.collection('students').doc(studentData.sessionId).update({
                        completed: true,
                        completedTime: firebase.firestore.Timestamp.now(),
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

    // Review sessions still show a score — it just doesn't count for anything.

    if (submitBtn)  submitBtn.disabled = true;
    if (confirmMsg) { confirmMsg.style.display = 'block'; confirmMsg.textContent = 'Submitting…'; }

    const finalScore = parseFloat(sessionStorage.getItem('labScore') || '0');

    const reviewMode = sessionStorage.getItem('reviewMode');

    if (db && studentData.sessionId) {
        try {
            // 'score' is the field teacher.html reads from the students collection
            await db.collection('students').doc(studentData.sessionId).update({
                completed: true,
                completedTime: firebase.firestore.Timestamp.now(),
                score: finalScore
            });
            if (confirmMsg) confirmMsg.textContent = reviewMode
                ? '✓ Review finished. Nothing was graded.'
                : '✓ Lab submitted successfully!';
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
