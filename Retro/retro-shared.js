// Firebase configuration (SAME as EvolLand)
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

const QUIZ_PASSWORD = "banana";

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

const quizQuestions = {
    1: { correct: 3 }, 2: { correct: 1 },
    3: { correct: 0 }, 4: { correct: 0 },
    5: { correct: 1 }, 6: { correct: 3 }
};

async function loadQuizConfig() {
    try {
        if (!db) {
            throw new Error('Database not available - running in standalone mode');
        }
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
        const maxScore = 6 * ptsPerQ;
        const scoreText = ptsPerQ === 0.5 ? studentData.score.toFixed(1) : Math.round(studentData.score);
        const maxText = ptsPerQ === 0.5 ? maxScore.toFixed(1) : maxScore;
        scoreEl.textContent = scoreText + ' / ' + maxText;
    }
    
    // Show attempt number in "X of Y" format
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

function handleQuizAnswer(questionNumber, optionIndex) {
    const question = quizQuestions[questionNumber];
    if (!question || studentData.answers[questionNumber]) return;
    
    const isCorrect = optionIndex === question.correct;
    
    studentData.answers[questionNumber] = {
        selected: optionIndex,
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
    applyAnswerFeedback(questionNumber, optionIndex, question.correct);
    
    if (db) db.collection('students').doc(studentData.sessionId).update({
        answers: studentData.answers,
        score: studentData.score,
        lastUpdated: db ? firebase.firestore.Timestamp.now() : new Date()
    }).catch(e => console.error(e));
}

function applyAnswerFeedback(questionNumber, selectedOption, correctOption) {
    const questionBlocks = document.querySelectorAll('.quiz-question-block');
    let questionBlock = null;
    
    questionBlocks.forEach(block => {
        const firstOption = block.querySelector('.quiz-option');
        if (firstOption && firstOption.getAttribute('onclick').includes(`handleQuizAnswer(${questionNumber},`)) {
            questionBlock = block;
        }
    });
    
    if (!questionBlock) return;
    
    const options = questionBlock.querySelectorAll('.quiz-option');
    const feedbackDiv = questionBlock.querySelector('.quiz-feedback');
    
    options.forEach(opt => {
        opt.style.pointerEvents = 'none';
        opt.style.cursor = 'default';
    });
    
    options.forEach((opt, idx) => {
        if (idx === correctOption) {
            opt.style.background = 'rgba(76, 175, 80, 0.3)';
            opt.style.borderColor = '#4caf50';
        } else if (idx === selectedOption) {
            opt.style.background = 'rgba(244, 67, 54, 0.3)';
            opt.style.borderColor = '#f44336';
        }
    });
    
    if (feedbackDiv) {
        feedbackDiv.style.display = 'block';
        if (selectedOption === correctOption) {
            feedbackDiv.style.background = 'rgba(76, 175, 80, 0.2)';
            feedbackDiv.style.border = '1px solid #4caf50';
            feedbackDiv.style.color = '#81c784';
            feedbackDiv.innerHTML = '✓ Correct!';
        } else {
            feedbackDiv.style.background = 'rgba(244, 67, 54, 0.2)';
            feedbackDiv.style.border = '1px solid #f44336';
            feedbackDiv.style.color = '#e57373';
            feedbackDiv.innerHTML = '✗ Incorrect.';
        }
    }
}

function restoreAnswers() {
    Object.keys(studentData.answers).forEach(questionNum => {
        const answer = studentData.answers[questionNum];
        const question = quizQuestions[questionNum];
        if (question) applyAnswerFeedback(parseInt(questionNum), answer.selected, question.correct);
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
