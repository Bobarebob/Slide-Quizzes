// laser-shared.js  -  Lab 3A Diffraction (QUIZ_ID LASER01)
// Firebase configuration (SAME as astronomy-course project)
const firebaseConfig = {
    apiKey: "AIzaSyApEcj1Gt_AgK9853JGWsyPuWuX1RyRQQA",
    authDomain: "astronomy-course.firebaseapp.com",
    projectId: "astronomy-course",
    storageBucket: "astronomy-course.firebasestorage.app",
    messagingSenderId: "84123424550",
    appId: "1:84123424550:web:f6eab6a447d480cedc13e7"
};

// Initialize Firebase safely
let db = null;
try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    }
} catch (error) {
    console.warn('Firebase not available, running in standalone mode');
}

// ============================================================
// QUIZ_ID — the permanent identifier baked into THIS quiz.
// It must EXACTLY match the "Quiz ID" typed in the dashboard.
// The password is NOT baked in: students type it and it is
// verified against this ID, so two quizzes open at once can
// never resolve to each other.
// ============================================================
const QUIZ_ID = "LASER01";

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Lab Password' },
    // reviewStopDateTime is the third availability date: ungraded review closes here.
    // Absent on quizzes saved before the three-date change, which means "same as stop".
    restrictions: { timeLimit: 0, lowTimeWarning: 3, startDate: '', startTime: '', stopDate: '', stopTime: '', reviewStopDateTime: null, attemptsAllowed: 0, pointsPerQuestion: 0.5 }
};

let studentData = {
    name: sessionStorage.getItem('studentName') || '',
    studentID: sessionStorage.getItem('studentID') || '',
    sessionId: sessionStorage.getItem('sessionId') || '',
    answers: {},
    score: 0
};

let timerInterval = null;
let timerEndTime = parseInt(sessionStorage.getItem('timerEndTime') || '0');

// ==========================================
// LAB SCORING MAP
// This lab has no multiple-choice questions. Its 12 graded items are the
// guided calculations (4 steps x 3 lasers). Each one is stored in the
// student's "answers" map exactly like a quiz question, under dbNum 1-12,
// so the dashboard sees a 12-question quiz. Step 1 (grating spacing d)
// is a shared warm-up and is not graded.
// Points per calculation come from the dashboard's "points per question"
// (0.5 gives a 6-point lab).
// ==========================================
const labCalcData = {
    'theta_red':      { dbNum: 1 },  'theta_green':    { dbNum: 2 },  'theta_blue':    { dbNum: 3 },
    'sintheta_red':   { dbNum: 4 },  'sintheta_green': { dbNum: 5 },  'sintheta_blue': { dbNum: 6 },
    'lambda_red':     { dbNum: 7 },  'lambda_green':   { dbNum: 8 },  'lambda_blue':   { dbNum: 9 },
    'pcterror_red':   { dbNum: 10 }, 'pcterror_green': { dbNum: 11 }, 'pcterror_blue': { dbNum: 12 }
};

const TOTAL_QUESTIONS = 12;

function pointsPerCalc() {
    const p = parseFloat(quizConfig.restrictions.pointsPerQuestion);
    return (p > 0) ? p : 0.5;
}
function fmtPoints(v) { return (v % 1 !== 0) ? v.toFixed(1) : String(v); }
function maxLabScore() { return TOTAL_QUESTIONS * pointsPerCalc(); }

function labIsLocked() {
    return sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && Date.now() > timerEndTime);
}

// Page-load (cosmetic): fetch this quiz's login field labels.
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
            .limit(1)
            .get();

        if (snap.empty) return false; // wrong password for THIS quiz

        const q = snap.docs[0].data();
        quizConfig.className = q.className;
        quizConfig.quizName = q.name;
        // One database per class-quiz, at a fixed id:
        quizConfig.databaseId = `${q.className}_${q.name}`;

        const settingsDoc = await db.collection('quizSettings').doc(quizConfig.databaseId).get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            if (settings.loginDescriptors) quizConfig.loginDescriptors = settings.loginDescriptors;
            if (settings.restrictions) quizConfig.restrictions = settings.restrictions;
            if (settings.idValidation) quizConfig.idValidation = settings.idValidation;
        }

        sessionStorage.setItem('quizConfig', JSON.stringify(quizConfig));
        return true;
    } catch (error) {
        console.error('Error resolving quiz configuration:', error);
        return false;
    }
}

function initializePage() {
    const storedConfig = sessionStorage.getItem('quizConfig');
    if (storedConfig) quizConfig = JSON.parse(storedConfig);

    const isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

    if (!isLoginPage) {
        if (!studentData.name || !studentData.studentID || !studentData.sessionId) {
            window.location.href = 'index.html';
            return;
        }

        studentData.answers = JSON.parse(sessionStorage.getItem('answers') || '{}');
        studentData.score = parseFloat(sessionStorage.getItem('score') || '0');

        updateBanner();

        if (timerEndTime > Date.now() && document.getElementById('timerDisplay')) {
            startTimerDisplay();
        }
    }
}

function updateBanner() {
    const nameEl = document.getElementById('displayName');
    const idEl = document.getElementById('displayID');
    const scoreEl = document.getElementById('displayScore');
    const bannerEl = document.getElementById('studentBanner');
    const attemptEl = document.getElementById('attemptNumber');
    const attemptDisplayEl = document.getElementById('attemptDisplay');

    if (nameEl) nameEl.textContent = studentData.name;
    if (idEl) idEl.textContent = studentData.studentID;
    if (scoreEl) {
        const ptsPerQ = pointsPerCalc();
        const maxScore = TOTAL_QUESTIONS * ptsPerQ;
        const scoreText = ptsPerQ === 0.5 ? studentData.score.toFixed(1) : Math.round(studentData.score);
        const maxText = ptsPerQ === 0.5 ? maxScore.toFixed(1) : maxScore;
        scoreEl.textContent = scoreText + ' / ' + maxText;
    }

    // Attempts field. Normally "X of Y"; during an ungraded review session it says so
    // instead, because there is no attempt number to report. reviewMode is set at login:
    //   'attempts' — the student used all their attempts
    //   'closed'   — the graded window closed (any unused attempts are forfeit)
    const attemptNumber = sessionStorage.getItem('attemptNumber');
    const maxAttempts = sessionStorage.getItem('maxAttempts');
    const reviewMode = sessionStorage.getItem('reviewMode');
    if (attemptEl && attemptDisplayEl) {
        if (reviewMode === 'attempts') {
            attemptEl.textContent = (maxAttempts && maxAttempts !== '0')
                ? `Attempts used (${maxAttempts} of ${maxAttempts}) — reviewing, not graded`
                : 'Reviewing — not graded';
            attemptDisplayEl.style.display = 'block';
        } else if (reviewMode === 'closed') {
            const closedOn = sessionStorage.getItem('creditCloseLabel');
            attemptEl.textContent = closedOn
                ? `Assignment closed ${closedOn} — reviewing, not graded`
                : 'Assignment closed — reviewing, not graded';
            attemptDisplayEl.style.display = 'block';
        } else if (attemptNumber && maxAttempts) {
            if (maxAttempts === '0') {
                attemptEl.textContent = attemptNumber;
            } else {
                attemptEl.textContent = `${attemptNumber} of ${maxAttempts}`;
            }
            attemptDisplayEl.style.display = 'block';
        }
    }

    if (bannerEl) bannerEl.style.display = 'flex';
}

// ==========================================
// RECORD LAB RESULTS
// Called by lab.html whenever the set of finished calculations changes.
// "calcs" is the lab's completion table: key -> { done, score } where a
// score above zero means the calculation came out right. Because students
// may redo a calculation, the whole answers map is rebuilt each time.
// ==========================================
function recordLabResults(calcs) {
    if (labIsLocked()) return studentData.score;

    const previous = studentData.answers || {};
    const answers = {};
    let numCorrect = 0;
    Object.keys(labCalcData).forEach(key => {
        const c = calcs[key];
        if (!c || !c.done) return;
        const dbNum = labCalcData[key].dbNum;
        const isCorrect = (c.score || 0) > 0;
        if (isCorrect) numCorrect++;
        const old = previous[dbNum];
        answers[dbNum] = (old && old.correct === isCorrect) ? old : {
            selected: 0,
            correct: isCorrect,
            timestamp: db ? firebase.firestore.Timestamp.now() : new Date()
        };
    });

    const score = numCorrect * pointsPerCalc();
    const signature = JSON.stringify(Object.keys(answers).map(k => [k, answers[k].correct])) + '|' + score;
    const changed = signature !== sessionStorage.getItem('labSig');

    studentData.answers = answers;
    studentData.score = score;
    sessionStorage.setItem('answers', JSON.stringify(answers));
    sessionStorage.setItem('score', score.toString());
    sessionStorage.setItem('labSig', signature);
    updateBanner();

    if (changed && db && studentData.sessionId) {
        db.collection('students').doc(studentData.sessionId).update({
            answers: answers,
            score: score,
            lastUpdated: firebase.firestore.Timestamp.now()
        }).catch(e => console.error(e));
    }
    return score;
}

function startTimerDisplay() {
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.style.display = 'flex';

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const now = Date.now();
        const remainingMs = timerEndTime - now;
        const timeRemainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

        const minutes = Math.floor(timeRemainingSeconds / 60);
        const seconds = timeRemainingSeconds % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        const timeElement = document.getElementById('timeRemaining');
        if (timeElement) timeElement.textContent = timeString;

        const warningMinutes = quizConfig.restrictions.lowTimeWarning || 3;
        const warningMsg = document.getElementById('timeWarningMessage');
        if (warningMsg) {
            if (timeRemainingSeconds <= 0) {
                sessionStorage.setItem('quizCompleted', 'true');
                warningMsg.textContent = 'TIME IS UP!';
                warningMsg.style.display = 'inline';
                clearInterval(timerInterval);
                setTimeout(() => {
                    if (db) db.collection('students').doc(studentData.sessionId).update({
                        completed: true,
                        completedTime: db ? firebase.firestore.Timestamp.now() : new Date(),
                        autoSubmitted: true
                    }).catch(e => console.error(e));
                    window.location.href = 'outro.html';
                }, 100);
            } else if (timeRemainingSeconds <= 59) {
                warningMsg.textContent = 'Less than 1 minute left!';
                warningMsg.style.display = 'inline';
            } else if (timeRemainingSeconds <= 119) {
                warningMsg.textContent = 'Two minutes left!';
                warningMsg.style.display = 'inline';
            } else if (timeRemainingSeconds <= 179) {
                warningMsg.textContent = 'Three minutes left!';
                warningMsg.style.display = 'inline';
            } else if (minutes <= warningMinutes && minutes > 3) {
                warningMsg.textContent = `${minutes} minutes left!`;
                warningMsg.style.display = 'inline';
            } else {
                warningMsg.style.display = 'none';
            }
        }
    }, 1000);
}

function submitQuiz() {
    sessionStorage.setItem('quizCompleted', 'true');
    if (db) db.collection('students').doc(studentData.sessionId).update({
        completed: true,
        completedTime: db ? firebase.firestore.Timestamp.now() : new Date()
    }).then(() => {
        window.location.href = 'outro.html';
    }).catch(e => {
        console.error(e);
        alert('Error submitting. Please try again.');
    });
    else window.location.href = 'outro.html';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}
