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

const QUIZ_PASSWORD = "pasta";

let quizConfig = {
    className: null,
    quizName: null,
    databaseId: null,
    loginDescriptors: { name: 'Student Name', id: 'Student ID', pass: 'Quiz Password' },
    restrictions: { timeLimit: 0, lowTimeWarning: 3, startDate: '', startTime: '', stopDate: '', stopTime: '', attemptsAllowed: 0, pointsPerQuestion: 1.0 }
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
// 6 questions total: 2 on slide1, 2 on slide2, 1 on slide3, 1 on slide4
// ==========================================
const atmQuizData = {
    's1Q1': { dbNum: 1, correctLetter: 'C', correctIndex: 2 },  // force divided by area
    's1Q2': { dbNum: 2, correctLetter: 'B', correctIndex: 1 },  // decreases with altitude
    's2Q1': { dbNum: 3, correctLetter: 'D', correctIndex: 3 },  // Torricelli invented barometer
    's2Q2': { dbNum: 4, correctLetter: 'A', correctIndex: 0 },  // higher pressure = fairer weather
    's3Q1': { dbNum: 5, correctLetter: 'C', correctIndex: 2 },  // 1013.25 mb = 1 Atm
    's4Q1': { dbNum: 6, correctLetter: 'A', correctIndex: 0 }   // blood pressure in mm Hg
};

const TOTAL_QUESTIONS = 6;

async function loadQuizConfig() {
    try {
        if (!db) throw new Error('Database not available - running in standalone mode');
        const dbSnapshot = await db.collection('databases').where('password', '==', QUIZ_PASSWORD).where('active', '==', true).limit(1).get();
        if (dbSnapshot.empty) throw new Error('No active database found');
        
        const activeDb = dbSnapshot.docs[0].data();
        quizConfig.className = activeDb.className;
        quizConfig.quizName = activeDb.quizName;
        quizConfig.databaseId = dbSnapshot.docs[0].id;
        
        const settingsDoc = await db.collection('quizSettings').doc(`${quizConfig.className}_${quizConfig.quizName}`).get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            if (settings.loginDescriptors) quizConfig.loginDescriptors = settings.loginDescriptors;
            if (settings.restrictions) quizConfig.restrictions = settings.restrictions;
            if (settings.idValidation) quizConfig.idValidation = settings.idValidation;
        }
        
        sessionStorage.setItem('quizConfig', JSON.stringify(quizConfig));
        return true;
    } catch (error) {
        console.error('Error loading quiz configuration:', error);
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
        const maxScore = TOTAL_QUESTIONS * ptsPerQ;
        const scoreText = ptsPerQ === 0.5 ? studentData.score.toFixed(1) : Math.round(studentData.score);
        const maxText = ptsPerQ === 0.5 ? maxScore.toFixed(1) : maxScore;
        scoreEl.textContent = scoreText + ' / ' + maxText;
    }
    
    const attemptNumber = sessionStorage.getItem('attemptNumber');
    const maxAttempts = sessionStorage.getItem('maxAttempts');
    if (attemptNumber && maxAttempts && attemptEl && attemptDisplayEl) {
        if (maxAttempts === '0') {
            attemptEl.textContent = attemptNumber;
        } else {
            attemptEl.textContent = `${attemptNumber} of ${maxAttempts}`;
        }
        attemptDisplayEl.style.display = 'block';
    }
    
    if (bannerEl) bannerEl.style.display = 'flex';
}

// ==========================================
// UNIFIED QUIZ ANSWER HANDLER
// ==========================================
function handleQuizAnswer(questionId, selectedOptionElement, selectedLetter) {
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.add('locked'));
        return;
    }

    const qData = atmQuizData[questionId];
    if (!qData) return;

    const dbNum = qData.dbNum;

    if (studentData.answers[dbNum]) return;
    
    const optionsContainer = selectedOptionElement.parentElement;
    if (optionsContainer.classList.contains('answered')) return;

    optionsContainer.classList.add('answered');
    const allOptions = optionsContainer.querySelectorAll('.quiz-option');
    allOptions.forEach(opt => opt.classList.add('locked'));

    const isCorrect = (qData.correctLetter === selectedLetter);
    const letterToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
    const selectedIndex = letterToIndex[selectedLetter];

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
        const correctOption = optionsContainer.querySelector(`[data-letter="${qData.correctLetter}"]`);
        if (correctOption) correctOption.classList.add('correct');
    }
}

// ==========================================
// RESTORE ANSWERS ON PAGE LOAD
// ==========================================
function restoreAnswers() {
    const now = Date.now();
    if (sessionStorage.getItem('quizCompleted') === 'true' || (timerEndTime > 0 && now > timerEndTime)) {
        sessionStorage.setItem('quizCompleted', 'true');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.add('locked');
            opt.style.cursor = 'not-allowed';
        });
    }

    Object.keys(studentData.answers).forEach(dbNumStr => {
        const dbNum = parseInt(dbNumStr);
        const answer = studentData.answers[dbNum];
        
        let questionId = null;
        let correctLetter = null;
        for (const [key, value] of Object.entries(atmQuizData)) {
            if (value.dbNum === dbNum) {
                questionId = key;
                correctLetter = value.correctLetter;
                break;
            }
        }

        if (questionId) {
            const optionElements = document.querySelectorAll('.quiz-option');
            let targetContainer = null;
            optionElements.forEach(opt => {
                if (opt.getAttribute('onclick') && opt.getAttribute('onclick').includes(`'${questionId}'`)) {
                    targetContainer = opt.parentElement;
                }
            });

            if (targetContainer && !targetContainer.classList.contains('answered')) {
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
