// Firebase configuration (SAME as retro_FINAL)
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
const QUIZ_ID = "KEPLER01";

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Quiz Password' },
    // reviewStopDateTime is the third availability date: ungraded review closes here.
    // Absent on quizzes saved before the three-date change, which means "same as stop".
    restrictions: { timeLimit: 0, lowTimeWarning: 3, startDate: '', startTime: '', stopDate: '', stopTime: '', reviewStopDateTime: null, attemptsAllowed: 0, pointsPerQuestion: 1.0 }
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
// MERGED ANSWER KEY & DATABASE MAPPING
// ==========================================
const keplerQuizData = {
    'bioQ1':  { dbNum: 1, correctLetter: 'D', correctIndex: 3 }, // Brahe
    'law1Q1': { dbNum: 2, correctLetter: 'A', correctIndex: 0 }, // It spreads out horizontally
    'law1Q2': { dbNum: 3, correctLetter: 'B', correctIndex: 1 }, // Speeds up closer to sun
    'law2Q1': { dbNum: 4, correctLetter: 'C', correctIndex: 2 }, // Venus
    'law2Q2': { dbNum: 5, correctLetter: 'A', correctIndex: 0 }, // Aphelion
    'law3Q1': { dbNum: 6, correctLetter: 'D', correctIndex: 3 }  // Mercury
};

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
    } catch (error) {
        console.warn('Could not preload login descriptors:', error);
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
        restoreAnswers();
        
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
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        const maxScore = 6 * ptsPerQ;
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
// UNIFIED QUIZ ANSWER HANDLER
// ==========================================
function handleQuizAnswer(questionId, selectedOptionElement, selectedLetter) {
    // --- NEW STRICT TIMEOUT/COMPLETION GATE ---
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        // If time is up, lock all remaining options silently and ignore the click
        document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.add('locked'));
        return; 
    }

    const qData = keplerQuizData[questionId];
    if (!qData) return;

    const dbNum = qData.dbNum;

    // Prevent changing answers if already answered in session/db
    if (studentData.answers[dbNum]) return;
    
    const optionsContainer = selectedOptionElement.parentElement;
    if (optionsContainer.classList.contains('answered')) return;

    // Lock UI
    optionsContainer.classList.add('answered');
    const allOptions = optionsContainer.querySelectorAll('.quiz-option');
    allOptions.forEach(opt => opt.classList.add('locked'));

    // Determine correctness and index
    const isCorrect = (qData.correctLetter === selectedLetter);
    const letterToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
    const selectedIndex = letterToIndex[selectedLetter];

    // Update Database / Session state
    studentData.answers[dbNum] = {
        selected: selectedIndex,
        correct: isCorrect,
        timestamp: db ? firebase.firestore.Timestamp.now() : new Date()
    };
    
    if (isCorrect) {
        const ptsPerQ = parseFloat(quizConfig.restrictions.pointsPerQuestion) || 1.0;
        studentData.score += ptsPerQ;
    }
    
    sessionStorage.setItem('answers', JSON.stringify(studentData.answers));
    sessionStorage.setItem('score', studentData.score.toString());
    
    updateBanner();
    
    if (db) {
        db.collection('students').doc(studentData.sessionId).update({
            answers: studentData.answers,
            score: studentData.score,
            lastUpdated: db ? firebase.firestore.Timestamp.now() : new Date()
        }).catch(e => console.error(e));
    }

    // Apply Visual Styling
    const feedbackBox = optionsContainer.nextElementSibling;
    
    if (isCorrect) {
        selectedOptionElement.classList.add('correct');
        if (feedbackBox) {
            feedbackBox.textContent = "✓ Correct!";
            feedbackBox.classList.add('show-correct');
        }
    } else {
        selectedOptionElement.classList.add('incorrect');
        if (feedbackBox) {
            feedbackBox.textContent = "✗ Incorrect.";
            feedbackBox.classList.add('show-incorrect');
        }
        
        // Highlight actual correct answer in green
        const correctOption = optionsContainer.querySelector(`[data-letter="${qData.correctLetter}"]`);
        if (correctOption) {
            correctOption.classList.add('correct');
        }
    }
}

// ==========================================
// RESTORE ANSWERS ON PAGE LOAD
// ==========================================
function restoreAnswers() {
    // --- NEW VISUAL LOCKOUT ON LOAD ---
    // If the student navigates back to this page after the timer is up, 
    // immediately lock all options so they don't even try to click them.
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        sessionStorage.setItem('quizCompleted', 'true');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.add('locked');
            opt.style.cursor = 'not-allowed'; // Adds an extra visual cue that it's dead
        });
    }

    Object.keys(studentData.answers).forEach(dbNumStr => {
        const dbNum = parseInt(dbNumStr);
        const answer = studentData.answers[dbNum];
        
        // Find corresponding string ID (e.g. 'bioQ1')
        let questionId = null;
        let correctLetter = null;
        for (const [key, value] of Object.entries(keplerQuizData)) {
            if (value.dbNum === dbNum) {
                questionId = key;
                correctLetter = value.correctLetter;
                break;
            }
        }

        if (questionId) {
            // Find the option container on the current page
            const optionElements = document.querySelectorAll('.quiz-option');
            let targetContainer = null;
            optionElements.forEach(opt => {
                if (opt.getAttribute('onclick') && opt.getAttribute('onclick').includes(`'${questionId}'`)) {
                    targetContainer = opt.parentElement;
                }
            });

            if (targetContainer && !targetContainer.classList.contains('answered')) {
                // Lock the container
                targetContainer.classList.add('answered');
                const allOptions = targetContainer.querySelectorAll('.quiz-option');
                allOptions.forEach(opt => opt.classList.add('locked'));

                const feedbackBox = targetContainer.nextElementSibling;
                const indexToLetter = {0: 'A', 1: 'B', 2: 'C', 3: 'D'};
                const selectedLetter = indexToLetter[answer.selected];

                const selectedElement = targetContainer.querySelector(`[data-letter="${selectedLetter}"]`);
                const correctElement = targetContainer.querySelector(`[data-letter="${correctLetter}"]`);

                if (answer.correct) {
                    if (selectedElement) selectedElement.classList.add('correct');
                    if (feedbackBox) {
                        feedbackBox.textContent = "✓ Correct!";
                        feedbackBox.classList.add('show-correct');
                    }
                } else {
                    if (selectedElement) selectedElement.classList.add('incorrect');
                    if (correctElement) correctElement.classList.add('correct');
                    if (feedbackBox) {
                        feedbackBox.textContent = "✗ Incorrect.";
                        feedbackBox.classList.add('show-incorrect');
                    }
                }
            }
        }
    });
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
                // Set completion flag so questions immediately lock down globally
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
    // When manually submitted, lock the quiz
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}