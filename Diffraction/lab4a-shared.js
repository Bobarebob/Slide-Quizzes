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

// ============================================================
// VOICE  –  narration voice selection
//
// Web Speech API voices differ by browser and by machine, and no
// browser exposes a setting a page can read. So the choice lives
// here and persists in localStorage for this origin.
//
// Press Ctrl+Shift+V on any lab page to open the picker.
// Students never see it unless they know the combination.
// ============================================================
const LabVoice = (function () {
    const KEY_VOICE = 'mp_voice', KEY_RATE = 'mp_rate', KEY_PITCH = 'mp_pitch';
    const DEFAULT_RATE = 0.88, DEFAULT_PITCH = 1;

    // Tried in order when nothing has been saved yet.
    // Zira is the hard-wired default. Matched by pattern because the name
    // varies: Chrome/Edge report "Microsoft Zira - English (United States)",
    // Firefox usually reports "Microsoft Zira Desktop - English (United States)".
    // The rest are fallbacks for machines with no Zira installed (Mac, ChromeOS).
    const PREFERRED = [
        /^Microsoft Zira\b/,
        /^Google US English$/,
        /^Microsoft Aria Online \(Natural\)/,
        /^Samantha$/
    ];

    function byPreference(vs) {
        for (let i = 0; i < PREFERRED.length; i++) {
            const hit = vs.filter(v => PREFERRED[i].test(v.name))[0];
            if (hit) return hit;
        }
        return null;
    }

    let current = null, panel = null, sel = null;

    const ok = () => typeof speechSynthesis !== 'undefined';
    function read(k, def) {
        try { const v = localStorage.getItem(k); return v === null ? def : v; }
        catch (e) { return def; }
    }
    function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    function pick() {
        if (!ok()) return null;
        const vs = speechSynthesis.getVoices();
        if (!vs.length) return null;                 // Chrome loads these late

        const saved = read(KEY_VOICE, null);
        current =
            (saved && vs.filter(v => v.name === saved)[0]) ||
            byPreference(vs) ||
            vs.filter(v => v.lang.indexOf('en') === 0 && !v.localService)[0] ||
            vs.filter(v => v.lang.indexOf('en') === 0)[0] ||
            vs[0];

        if (panel) fillSelect();
        return current;
    }

    function browserName() {
        const ua = navigator.userAgent;
        if (/Firefox\//.test(ua)) return 'Firefox';
        if (/Edg\//.test(ua))     return 'Edge';
        if (/OPR\//.test(ua))     return 'Opera';
        if (/Chrome\//.test(ua))  return 'Chrome';
        if (/Safari\//.test(ua))  return 'Safari';
        return 'Browser';
    }

    function fillSelect() {
        if (!sel) return;
        const vs = speechSynthesis.getVoices();
        sel.innerHTML = vs.map(v =>
            '<option value="' + encodeURIComponent(v.name) + '"' +
            (current && v.name === current.name ? ' selected' : '') + '>' +
            v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' \u2601') +
            '</option>'
        ).join('');
        const head = panel.querySelector('[data-lv="head"]');
        if (head) head.textContent = browserName() + ' \u2014 ' + vs.length + ' voices';
    }

    function build() {
        panel = document.createElement('div');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Narration voice');
        panel.style.cssText =
            'position:fixed;bottom:14px;right:14px;z-index:99999;width:330px;' +
            'background:#fff;color:#16202b;border:1px solid #9aa7b5;border-radius:6px;' +
            'padding:12px 13px;box-shadow:0 6px 22px rgba(0,0,0,.32);' +
            'font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.45';

        panel.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px">' +
              '<strong style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Narration voice</strong>' +
              '<span data-lv="head" style="font:11px ui-monospace,Menlo,monospace;color:#64748b"></span>' +
            '</div>' +
            '<select data-lv="sel" style="width:100%;font:12px ui-monospace,Menlo,monospace;padding:6px;' +
              'border:1px solid #c7d0da;border-radius:3px;background:#fff;color:#16202b"></select>' +
            '<div style="display:flex;gap:12px;margin-top:10px">' +
              '<label style="flex:1;font-size:11px;color:#64748b">Rate <b data-lv="rv" style="color:#16202b"></b>' +
                '<input data-lv="rate" type="range" min="0.5" max="1.4" step="0.02" style="width:100%;margin-top:3px"></label>' +
              '<label style="flex:1;font-size:11px;color:#64748b">Pitch <b data-lv="pv" style="color:#16202b"></b>' +
                '<input data-lv="pitch" type="range" min="0" max="2" step="0.05" style="width:100%;margin-top:3px"></label>' +
            '</div>' +
            '<div style="display:flex;gap:7px;margin-top:11px">' +
              '<button data-lv="test" style="flex:1;padding:7px;border:1px solid #16202b;background:#16202b;' +
                'color:#fff;border-radius:3px;cursor:pointer;font-size:11.5px">Test</button>' +
              '<button data-lv="reset" style="flex:1;padding:7px;border:1px solid #16202b;background:transparent;' +
                'color:#16202b;border-radius:3px;cursor:pointer;font-size:11.5px">Defaults</button>' +
              '<button data-lv="close" style="flex:0 0 auto;padding:7px 11px;border:1px solid #16202b;' +
                'background:transparent;color:#16202b;border-radius:3px;cursor:pointer;font-size:11.5px">Close</button>' +
            '</div>' +
            '<div data-lv="msg" style="margin-top:9px;font-size:11px;color:#64748b">' +
              'Saved for this browser on this site. Ctrl+Shift+V closes.</div>';

        document.body.appendChild(panel);

        sel = panel.querySelector('[data-lv="sel"]');
        const rate  = panel.querySelector('[data-lv="rate"]');
        const pitch = panel.querySelector('[data-lv="pitch"]');
        const rv    = panel.querySelector('[data-lv="rv"]');
        const pv    = panel.querySelector('[data-lv="pv"]');
        const msg   = panel.querySelector('[data-lv="msg"]');

        rate.value  = api.rate();
        pitch.value = api.pitch();
        rv.textContent = parseFloat(rate.value).toFixed(2);
        pv.textContent = parseFloat(pitch.value).toFixed(2);

        sel.addEventListener('change', () => {
            write(KEY_VOICE, decodeURIComponent(sel.value));
            pick();
            msg.textContent = 'Voice set to ' + (current ? current.name : '?') + '.';
        });
        rate.addEventListener('input', () => {
            rv.textContent = parseFloat(rate.value).toFixed(2);
            write(KEY_RATE, rate.value);
        });
        pitch.addEventListener('input', () => {
            pv.textContent = parseFloat(pitch.value).toFixed(2);
            write(KEY_PITCH, pitch.value);
        });

        panel.querySelector('[data-lv="test"]').addEventListener('click', () => {
            if (typeof speak === 'function') {
                speak('Measure L, the horizontal distance from the grating to the wall. ' +
                      '[pause] L is 412 millimeters.');
            } else {
                api.say('Measure L, the horizontal distance from the grating to the wall.');
            }
        });
        panel.querySelector('[data-lv="reset"]').addEventListener('click', () => {
            try { localStorage.removeItem(KEY_VOICE); localStorage.removeItem(KEY_RATE);
                  localStorage.removeItem(KEY_PITCH); } catch (e) {}
            current = null; pick();
            rate.value = DEFAULT_RATE; pitch.value = DEFAULT_PITCH;
            rv.textContent = DEFAULT_RATE.toFixed(2); pv.textContent = DEFAULT_PITCH.toFixed(2);
            msg.textContent = 'Back to defaults: ' + (current ? current.name : 'browser default') + '.';
        });
        panel.querySelector('[data-lv="close"]').addEventListener('click', api.toggle);

        fillSelect();
    }

    const api = {
        voice: () => current,
        rate:  () => parseFloat(read(KEY_RATE, DEFAULT_RATE))  || DEFAULT_RATE,
        pitch: () => { const p = parseFloat(read(KEY_PITCH, DEFAULT_PITCH)); return isNaN(p) ? DEFAULT_PITCH : p; },

        // Applies the saved voice/rate/pitch to an utterance.
        apply: function (u) {
            if (!current) pick();
            if (current) { u.voice = current; u.lang = current.lang; }
            u.rate = api.rate();
            u.pitch = api.pitch();
            return u;
        },

        // One-off speech that does not depend on the page's own speak().
        say: function (txt) {
            if (!ok() || !txt) return;
            speechSynthesis.cancel();
            speechSynthesis.speak(api.apply(new SpeechSynthesisUtterance(txt)));
        },

        toggle: function () {
            if (!ok()) return;
            if (!panel) { build(); return; }
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            if (!open) fillSelect();
        }
    };

    if (ok()) {
        pick();
        speechSynthesis.onvoiceschanged = pick;
        // Chrome sometimes needs a few polls before getVoices() is populated.
        let tries = 0;
        const poll = setInterval(() => { if (pick() || ++tries > 20) clearInterval(poll); }, 250);

        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
                e.preventDefault();
                api.toggle();
            }
        });
    }

    return api;
})();
