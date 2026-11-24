// js/main.js
import { SPREADSHEET_CSV_URL, LEADERBOARD_CSV_URL, APPS_SCRIPT_URL, GAMEMODE_RANKS_CSV_URL } from './config.js';
import { noteNames, midiNoteToName, noteToPitch, pitchToNote, autoTransposeSong, getNoteFrequency, parsePianoPad, getDiatonicStepAndShift } from './musicTheory.js';
import { drawSheetMusicStaff, drawStemlessNote, drawLedgerLines } from './sheetMusic.js';
import { audioCtx, initAudio, playErrorClackSound, playTone, bufferToWavBlob } from './audio.js';
import { arcadeState, initMiniGamesBridge, stopBattlePolling, openArcadeHub, returnToPlayerHome, exitActiveMiniGame, handleMiniGameNoteInput, handleMiniGameNoteRelease, drawSimonStaircase, openSongBattleSelector, closeSprintOptionModal, syncSongBattlePlayerStats, markSongBattleLocalFinished } from './miniGames.js';
import { koState, initKnockoutBridge, initSwissTournamentUI, dealKnockoutEmoteDeck, sendKnockoutQuickEmote, selectKnockoutTeam, triggerStreakSabotage, resetKnockoutRoundEffects, joinClassKnockoutStudent, syncKnockoutLiveScore, submitKnockoutRoundFinish, leaveClassKnockout } from './knockout.js';
import { initFinaleBridge, showGrandFinale, closeGrandFinale, toggleFanfareMute } from './finale.js';
import { initEyesFront, stopEyesFront, isEyesFrontFrozen, openEyesFrontPrompt } from './eyesFront.js';
import { awardNoteCraftSongReward } from './games/noteCraft/notecraft.js';
import { initDailyChallengeBridge, promptDailyChallenge, notifyDailySongComplete, notifyDailyStreak, notifyDailyTick, notifyDailyRecording } from './dailyChallenge.js';


let songList = [];
let currentSong = [];
let currentSongTitle = "Wipeout";

let isPlaying = false;
let isPaused = false;
let isStepMode = false;
let isLooping = false;
let isRecording = false;
let isGameMode = true;
let currentTheme = 'default';
let bonusSoundsUnlocked = false;

let localStudentId = "stu_" + Math.random().toString(36).substr(2, 9);
let localTabSwitches = 0;
let tabSwitchAwayTimestamp = null; 
let currentRoom = "";
let currentStudentClass = "";
let sessionStartTime = Date.now();
let breakMarkerPositions = [];
let sessionStudentAvatar = "🏃";

let showSheetMusic = localStorage.getItem('pianopad_sheet_music') !== 'false';
const btnSheetToggle = document.getElementById('btn-sheet-toggle');

if (btnSheetToggle) {
    btnSheetToggle.addEventListener('click', () => {
        showSheetMusic = !showSheetMusic;
        localStorage.setItem('pianopad_sheet_music', showSheetMusic ? 'true' : 'false');
        updateSheetToggleButton();
    });
    updateSheetToggleButton();
}

function updateSheetToggleButton() {
    if (!btnSheetToggle) return;
    if (showSheetMusic) {
        btnSheetToggle.textContent = ' Sheet: ON';
        btnSheetToggle.style.backgroundColor = '#0d9488';
    } else {
        btnSheetToggle.textContent = ' Sheet: OFF';
        btnSheetToggle.style.backgroundColor = '#4b5563';
    }
}

let micStream = null;
let micAnalyser = null;
let isMicListening = false;
let pitchDetectionFrameId = null;
let lastDetectedNote = null;
let noteHoldCounter = 0;

let gameStats = { perfect: 0, earlyLate: 0, miss: 0 };
let sessionSongHistory = {};
let currentPerfectStreak = 0;
let sessionStudentName = "";

let currentStepIndex = 0;
let smoothStepElapsed = 0;

let animationFrameId = null;
let playbackStartTime = 0;
let pauseStartTime = 0;
let accumulatedPauseMs = 0;
let lastFrameTime = 0;
let noteTimeline = [];

let recordedNotes = [];
let recordedRests = [];
let lastRecordNoteTime = 0;
let generatedHaycode = "";

let isCalibrating = false;
let calibStep = 1;
let calibLowestRawMIDI = 36;
let calibHighestRawMIDI = 96;
let midiOctaveOffset = 0;

let pendingMidiData = null;
let confettiParticles = [];

function spawnConfetti(x, y, baseColor) {
    for (let i = 0; i < 30; i++) {
        confettiParticles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() * -10) - 2,
            size: Math.random() * 6 + 4,
            color: Math.random() > 0.3 ? baseColor : (Math.random() > 0.5 ? '#facc15' : '#ec4899'),
            life: 1.0,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.4
        });
    }
}

function updateMonitorWidget() {
    const studentEl = document.getElementById('mon-student-name');
    const avatarEl = document.getElementById('mon-student-avatar');
    const classEl = document.getElementById('mon-class-badge');
    const breaksEl = document.getElementById('mon-breaks-badge');
    const timeEl = document.getElementById('mon-time-text');
    const songEl = document.getElementById('mon-song-text');
    const fillEl = document.getElementById('mon-bar-fill');
    const trackEl = document.getElementById('mon-bar-track');
    const badgeEl = document.getElementById('mon-level-badge');

    const activeClass = currentStudentClass || localStorage.getItem('pianopad_class') || "7G";

    if (studentEl) studentEl.textContent = sessionStudentName || localStorage.getItem('pianopad_name') || "Mr H";
    if (avatarEl) avatarEl.textContent = sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || "🏃";
    if (classEl) classEl.textContent = activeClass;
    if (breaksEl) breaksEl.textContent = `Breaks: ${localTabSwitches}`;
    
    const elapsedMs = Date.now() - sessionStartTime;
    const totalSecs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    const elapsedMins = Math.floor(elapsedMs / 60000);
    
    if (timeEl) timeEl.textContent = `${mins}:${secs} / 60:00min`;
    if (songEl) songEl.textContent = ` ${currentSongTitle || 'Wipeout'}`;

    let barColor = '#22c55e';

    if (badgeEl) {
        let badgeHtml = '';
        let displayBadge = false;
        const isDouble = (localTabSwitches === 0);
        const x2Tag = isDouble ? '<span style="color:#ef4444; font-weight:900; margin-left:4px;">X2</span>' : '';

        if (elapsedMins >= 30) {
            displayBadge = true;
            badgeHtml = `<span style="color:#facc15;"> Gold Level</span>${x2Tag}`;
            barColor = '#facc15';
        } else if (elapsedMins >= 20) {
            displayBadge = true;
            badgeHtml = `<span style="color:#cbd5e1;"> Silver Level</span>${x2Tag}`;
            barColor = '#cbd5e1';
        } else if (elapsedMins >= 10) {
            displayBadge = true;
            badgeHtml = `<span style="color:#f97316;"> Bronze Level</span>${x2Tag}`;
            barColor = '#f97316';
        }

        if (displayBadge) {
            badgeEl.style.display = 'inline-flex';
            badgeEl.innerHTML = badgeHtml;
        } else {
            badgeEl.style.display = 'none';
            badgeEl.innerHTML = '';
        }
    }

    if (fillEl) {
        const fillPct = Math.min(100, Math.max(1, (elapsedMins / 60) * 100));
        fillEl.style.width = `${fillPct}%`;
        fillEl.style.backgroundColor = barColor;
    }

    if (trackEl) {
        trackEl.querySelectorAll('.monitor-break-marker').forEach(m => m.remove());
        breakMarkerPositions.forEach(posPct => {
            const marker = document.createElement('div');
            marker.className = 'monitor-break-marker';
            marker.style.left = `${posPct}%`;
            trackEl.appendChild(marker);
        });
    }
    notifyDailyTick({
        elapsedMs,
        tabSwitches: localTabSwitches,
        isPlaying,
        isLooping,
        isStepMode,
        stepFinished: isStepMode && noteTimeline.length > 0 && currentStepIndex >= noteTimeline.length,
        currentSongTitle,
        speed: parseInt(speedSlider?.value, 10) || 100
    });
}

function syncStudentToFirebase(statusOverride = null) {
    if (!window.firebaseSet || !window.firebaseRef || !window.firebaseDb) return;
    
    const activeName = sessionStudentName || localStorage.getItem('pianopad_name') || "Student";
    const activeAvatar = sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || "🏃";
    const activeRoom = currentRoom || "Outside";
    const activeClass = currentStudentClass || localStorage.getItem('pianopad_class') || "7G";
    const activeStatus = statusOverride || (document.hidden ? "away" : "active");

    const myRef = window.firebaseRef(window.firebaseDb, `pianopad_roster/${localStudentId}`);
    window.firebaseSet(myRef, {
        name: activeName,
        studentName: activeName,
        avatar: activeAvatar,
        room: activeRoom,
        class: activeClass,
        studentClass: activeClass,
        song: currentSongTitle || "Wipeout",
        status: activeStatus,
        tabSwitches: localTabSwitches,
        sessionStartTime: sessionStartTime,
        lastActive: Date.now()
    });
    window.firebaseOnDisconnect(myRef).remove();
}

function isAuthorizedTeacher() {
    const activeName = (sessionStudentName || localStorage.getItem('pianopad_name') || '').trim();
    return /^mr\.?\s*[hbt]$/i.test(activeName);
}

document.getElementById('btn-join-room').addEventListener('click', () => {
    const name = document.getElementById('student-join-name').value.trim();
    const avatar = document.getElementById('student-join-avatar').value;
    const chosenClass = document.getElementById('student-join-class').value;
    const roomSelect = document.getElementById('student-join-room');
    const room = (roomSelect && roomSelect.style.display === 'none') ? "Outside" : (roomSelect ? roomSelect.value : "Outside");
    
    if (!name || !chosenClass || (roomSelect && roomSelect.style.display !== 'none' && !room)) {
        alert('Please enter your Name and select your Class.');
        return;
    }
    
    sessionStudentName = sanitizeName(name);
    sessionStudentAvatar = avatar;
    currentStudentClass = chosenClass;
    currentRoom = room;

    localStorage.setItem('pianopad_name', sessionStudentName);
    localStorage.setItem('pianopad_avatar', sessionStudentAvatar);
    localStorage.setItem('pianopad_class', currentStudentClass);
    localStorage.setItem('pianopad_room', currentRoom);

    // Initialize Eyes Front listener now that we have the room code and student name
    initEyesFront(currentRoom, { isHost: isAuthorizedTeacher() });

    document.getElementById('room-join-modal').classList.remove('open');
    
    syncStudentToFirebase("active");
    updateMonitorWidget();
    loadStudentTickerStats(sessionStudentName);
    promptDailyChallenge();
});

function checkIsOutsideSchoolHours() {
    const now = new Date();
    const day = now.getDay();
    const timeMins = now.getHours() * 60 + now.getMinutes();
    return (day === 0 || day === 6) || (timeMins < 8 * 60) || (timeMins >= 14 * 60 + 5);
}

document.addEventListener("visibilitychange", () => {
    const isOOS = checkIsOutsideSchoolHours();

    if (document.hidden) {
        if (!isOOS) {
            localTabSwitches++;
            tabSwitchAwayTimestamp = new Date();
            
            const elapsedMs = Date.now() - sessionStartTime;
            const posPct = Math.min(100, (elapsedMs / (60 * 60000)) * 100);
            breakMarkerPositions.push(posPct);
        }
        syncStudentToFirebase("away");
    } else {
        syncStudentToFirebase("active");

        if (!isOOS && tabSwitchAwayTimestamp) {
            const returnTimestamp = new Date();
            const durationSec = Math.round((returnTimestamp - tabSwitchAwayTimestamp) / 1000);

            if (durationSec >= 1) {
                const formatSec = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;
                const sessionElapsed = Math.round((Date.now() - sessionStartTime) / 1000);

                const payload = {
                    action: "LOG_BREAK",
                    studentName: sessionStudentName || localStorage.getItem('pianopad_name') || "Student",
                    year: "", 
                    class: currentStudentClass || localStorage.getItem('pianopad_class') || currentRoom || "",
                    awayTime: tabSwitchAwayTimestamp.toLocaleTimeString(),
                    returnTime: returnTimestamp.toLocaleTimeString(),
                    durationSec: durationSec,
                    durationFormatted: formatSec(durationSec),
                    breakCount: localTabSwitches,
                    songTitle: currentSongTitle || "Free Play",
                    sessionTime: formatSec(sessionElapsed)
                };

                fetch(APPS_SCRIPT_URL, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify(payload)
                }).catch(e => console.log("Sheet log error:", e));
            }
            tabSwitchAwayTimestamp = null;
        }

        if (!isOOS && localTabSwitches > 0) {
            const fName = (sessionStudentName || localStorage.getItem('pianopad_name') || "Student").split(' ')[0];
            document.getElementById('tab-switch-title').textContent = `${fName.toUpperCase()} - TAB SWITCH RECORDED!`;
            document.getElementById('tab-switch-modal').classList.add('open');
        }
    }
    updateMonitorWidget();
});

function updateRosterSong() {
    syncStudentToFirebase();
    updateMonitorWidget();
}

document.getElementById('btn-open-arcade').addEventListener('click', openArcadeHub);
document.getElementById('btn-home-screen').addEventListener('click', () => {
    stopEyesFront();
    returnToPlayerHome();
});
document.getElementById('btn-stop-arcade').addEventListener('click', exitActiveMiniGame);
document.getElementById('btn-song-battle').addEventListener('click', openSongBattleSelector);
document.getElementById('btn-mic-toggle').addEventListener('click', toggleMicrophoneListening);

document.getElementById('btn-game-results-close').addEventListener('click', () => {
    gameResultsModal.classList.remove('open');
    stopBattlePolling();
    if (koState.isClassKnockout) {
        const koModal = document.getElementById('knockout-modal');
        if (koModal) koModal.classList.add('open');
    }
});

document.getElementById('btn-game-arcade-menu').addEventListener('click', () => {
    gameResultsModal.classList.remove('open');
    stopBattlePolling();
    if (koState.isClassKnockout) leaveClassKnockout();
    openArcadeHub();
});

document.getElementById('btn-game-try-again').addEventListener('click', () => {
    gameResultsModal.classList.remove('open');
    stopBattlePolling();
    
    if (koState.isClassKnockout) {
        const koModal = document.getElementById('knockout-modal');
        if (koModal) koModal.classList.add('open');
        return;
    }
    
    // Clean the title just in case there are trailing spaces
    const title = currentSongTitle.trim();
    
    if (title === "Mystery Note" && window.startMysteryNote) window.startMysteryNote();
    else if (title === "Simon Taps" && window.startSimonTaps) window.startSimonTaps();
    else if (title === "Drop Dodge" && window.startDropDodge) window.startDropDodge();
    else if (title === "Combo Strike" && window.startComboStrike) window.startComboStrike();
    else if (title === "Finger Sprint" && window.openSprintModeSelector) window.openSprintModeSelector();
    else if (title === "Rhythm Echo" && window.launchRhythmEcho) window.launchRhythmEcho();
    else if ((title === "Note Name Sniper" || title === "Note Sniper") && window.launchNoteSniper) window.launchNoteSniper();
    else if (title === "Flappy Pitch" && window.launchFlappyPitch) window.launchFlappyPitch();
    else if (title === "Gridiron Groove" && window.launchGridironGroove) window.launchGridironGroove();
    else if (title === "Sharp Shooter" && window.launchSharpShooter) window.launchSharpShooter();
    else if (title === "ClefHook" || title === "Clef Hook") {
        if (window.startClefHook) window.startClefHook();
        else if (window.launchClefHook) window.launchClefHook();
        else playSong();
    }
    else if (title === "3D Ski Slalom" || title === "Ski Slalom") {
        if (window.launchSkiSlalom) window.launchSkiSlalom();
        else if (window.startSkiSlalom) window.startSkiSlalom();
        else playSong();
    }
    else if (title === "Staff Surfers" || title === "Scale Surfers") {
        if (window.launchStaffSurfers) window.launchStaffSurfers();
        else if (window.startStaffSurfers) window.startStaffSurfers();
        else playSong();
    }
    else if (typeof window.replayLastCustomMiniGame === 'function') {
        window.replayLastCustomMiniGame();
    }
    else playSong();
});

function sanitizeName(str) {
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}`;
}

function ensureStudentName() {
    if (!sessionStudentName || sessionStudentName === "Student" || !sessionStudentName.trim()) {
        const inputName = prompt("Great job! Please enter your First Name and Last Initial for the leaderboard (e.g., Alex M.):", "Student A");
        if (inputName && inputName.trim()) {
            sessionStudentName = sanitizeName(inputName);
            localStorage.setItem('pianopad_name', sessionStudentName);
            loadStudentTickerStats(sessionStudentName);
            syncStudentToFirebase();
        } else {
            sessionStudentName = "Anonymous";
        }
    }
    updateMonitorWidget();
    return sessionStudentName;
}

function sendJSONP(url, callbackName) {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        const cbName = callbackName || 'jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        window[cbName] = function(data) {
            delete window[cbName];
            if (document.body.contains(script)) document.body.removeChild(script);
            resolve(data);
        };

        const del = url.includes('?') ? '&' : '?';
        script.src = `${url}${del}callback=${cbName}`;
        script.onerror = function() {
            delete window[cbName];
            if (document.body.contains(script)) document.body.removeChild(script);
            resolve({ error: "SCRIPT_LOAD_ERROR" });
        };
        document.body.appendChild(script);
    });
}

async function toggleMicrophoneListening() {
    initAudio();
    const btn = document.getElementById('btn-mic-toggle');

    if (isMicListening) {
        stopMicrophoneListening();
        btn.textContent = ' MIC INPUT: OFF';
        btn.classList.remove('btn-mic-active');
        btn.classList.add('btn-secondary');
        document.getElementById('status').textContent = 'Microphone Pitch Detection stopped.';
    } else {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const micSource = audioCtx.createMediaStreamSource(micStream);
            micAnalyser = audioCtx.createAnalyser();
            micAnalyser.fftSize = 2048;
            micSource.connect(micAnalyser);

            isMicListening = true;
            btn.textContent = ' MIC INPUT: ON';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-mic-active');
            document.getElementById('status').textContent = ' Listening to acoustic piano notes... Play near your computer microphone!';

            processMicrophonePitch();
        } catch (err) {
            console.error("Microphone access error:", err);
            alert("Unable to access microphone. Please allow microphone permissions in your browser.");
        }
    }
}

function stopMicrophoneListening() {
    isMicListening = false;
    if (pitchDetectionFrameId) cancelAnimationFrame(pitchDetectionFrameId);
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
}

function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
        let val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.015) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function frequencyToNoteName(freq) {
    if (freq < 50 || freq > 2000) return null;
    let midi = Math.round(69 + 12 * Math.log2(freq / 440));
    return midiNoteToName(midi);
}

function processMicrophonePitch() {
    if (!isMicListening || !micAnalyser) return;

    let buf = new Float32Array(micAnalyser.fftSize);
    micAnalyser.getFloatTimeDomainData(buf);
    let freq = autoCorrelate(buf, audioCtx.sampleRate);

    if (freq !== -1) {
        let note = frequencyToNoteName(freq);
        if (note) {
            if (note === lastDetectedNote) {
                noteHoldCounter++;
                if (noteHoldCounter === 3) {
                    playManualNote(note);
                }
            } else {
                lastDetectedNote = note;
                noteHoldCounter = 0;
            }
        }
    } else {
        lastDetectedNote = null;
        noteHoldCounter = 0;
    }

    pitchDetectionFrameId = requestAnimationFrame(processMicrophonePitch);
}

function checkFirstTimeCalibration() {
    const calibDone = localStorage.getItem('pianopad_calib_done');
    if (!calibDone) {
        startCalibration();
    }
}

function startCalibration() {
    settingsModal.classList.remove('open');
    buildCalibrationKeyboard();
    
    isCalibrating = true;
    calibStep = 1; 
    calibLowestRawMIDI = null;
    calibHighestRawMIDI = null;

    document.querySelectorAll('.calib-key').forEach(k => k.classList.remove('blue-highlight'));

    document.getElementById('btn-calib-skip').style.display = 'inline-flex';
    document.getElementById('btn-calib-cancel').style.display = 'none';
    document.getElementById('calib-instructions').innerHTML = "Step 1: Press the LOWEST 'C' key on your external MIDI Keyboard...";
    calibModal.classList.add('open');
}

function skipCalibration() {
    isCalibrating = false;
    localStorage.setItem('pianopad_calib_done', 'true');
    calibModal.classList.remove('open');
    document.getElementById('status').textContent = 'Calibration skipped. Default key map active.';
}

function cancelCalibration() {
    isCalibrating = false;
    calibModal.classList.remove('open');
}

function processCalibrationNote(rawMidi) {
    if (!isCalibrating) return;

    if (calibStep === 1) {
        calibLowestRawMIDI = rawMidi;
        midiOctaveOffset = 36 - rawMidi;

        const lowCKey = document.querySelector('.calib-key[data-calib-note="c1"]');
        if (lowCKey) lowCKey.classList.add('blue-highlight');

        calibStep = 2;
        document.getElementById('calib-instructions').innerHTML = 'Recognized Lowest C! Step 2: Now press the <span style="color: #22c55e; font-weight: 800;">HIGHEST</span> \'C\' key on your external MIDI Keyboard...';
    } else if (calibStep === 2) {
        calibHighestRawMIDI = rawMidi;

        const rawDiff = calibHighestRawMIDI - calibLowestRawMIDI;
        const octaveDistance = Math.round(rawDiff / 12);
        
        const targetOctave = Math.min(7, 1 + octaveDistance);
        const highCKey = document.querySelector(`.calib-key[data-calib-note="c${targetOctave}"]`);
        if (highCKey) highCKey.classList.add('blue-highlight');

        document.getElementById('calib-instructions').textContent = `Calibration Complete! Detected a ${octaveDistance}-Octave Keyboard (${octaveDistance * 12 + 1} keys).`;
        setTimeout(() => {
            isCalibrating = false;
            calibStep = 1;
            localStorage.setItem('pianopad_calib_done', 'true');
            calibModal.classList.remove('open');
            updateKeyPositions();
            document.getElementById('status').textContent = `MIDI Keyboard calibrated! Lowest key now maps directly to C1 on-screen.`;
        }, 1200);
    }
}

function unlockBonusSounds(reasonText) {
    if (bonusSoundsUnlocked) return;
    bonusSoundsUnlocked = true;

    const instSelect = document.getElementById('instrument-select');
    const bonusOptions = [
        { val: 'epiano', text: ' Electric Piano' },
        { val: 'harpsichord', text: ' Harpsichord' },
        { val: 'synth80s', text: ' 80s Synth Lead' },
        { val: 'xylophone', text: ' Xylophone' },
        { val: 'accordion', text: ' Accordion' }
    ];

    bonusOptions.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.val;
        optionEl.textContent = opt.text;
        instSelect.appendChild(optionEl);
    });
}

function closeUnlockModal() {
    const m = document.getElementById('unlock-modal');
    if (m) m.classList.remove('open');
}

function initMIDIHardware() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    }
}

function handleQuickRestartMidiMessage(event) {
    const resultsModal = document.getElementById('game-results-modal');
    // Only intercept if the Game Results screen is actively open
    if (!resultsModal || !resultsModal.classList.contains('open')) return;

    const status = event.data[0];
    const command = status & 0xF0;
    const velocity = event.data.length > 2 ? event.data[2] : 0;

    // If it's a "Note On" message with velocity > 0, trigger restart
    if (command === 144 && velocity > 0) {
        const playAgainBtn = document.getElementById('btn-game-try-again');
        if (playAgainBtn && playAgainBtn.style.display !== 'none') {
            playAgainBtn.click();
        }
    }
}

function onMIDISuccess(midiAccess) {
    const inputs = midiAccess.inputs.values();
    for (let input of inputs) {
        // Register the standard note player callback
        input.onmidimessage = handleMIDIMessage;
        
        // Also register the quick-restart listener (it will self-filter if the modal is closed)
        input.addEventListener('midimessage', handleQuickRestartMidiMessage);
    }
    midiAccess.onstatechange = (e) => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
            e.port.onmidimessage = handleMIDIMessage;
            e.port.addEventListener('midimessage', handleQuickRestartMidiMessage);
        }
    };
}

function onMIDIFailure() {
    console.warn("Web MIDI API access denied or unsupported in this browser.");
}

function handleMIDIMessage(event) {
    const status = event.data[0];
    const channel = status & 0x0F;
    if (channel === 9) return;

    const command = status & 0xF0;
    const rawNoteNumber = event.data[1];
    const velocity = event.data.length > 2 ? event.data[2] : 0;

    if (command === 144 && velocity > 0) {
        if (isCalibrating) {
            processCalibrationNote(rawNoteNumber);
        } else {
            const correctedNoteNumber = rawNoteNumber + midiOctaveOffset;
            const noteStr = midiNoteToName(correctedNoteNumber);
            if (noteStr) {
                playManualNote(noteStr);
            }
        }
    } else if (command === 128 || (command === 144 && velocity === 0)) {
        if (!isCalibrating) {
            const correctedNoteNumber = rawNoteNumber + midiOctaveOffset;
            const noteStr = midiNoteToName(correctedNoteNumber);
            if (noteStr) {
                handleMiniGameNoteRelease(noteStr);
            }
        }
    }
}

document.getElementById('midi-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    initAudio();
    try {
        const arrayBuffer = await file.arrayBuffer();
        const midi = new Midi(arrayBuffer);
        const fileName = file.name.replace(/\.[^/.]+$/, "");

        const channelMap = new Map();
        midi.tracks.forEach((track, tIdx) => {
            if (!track.notes || track.notes.length === 0) return;
            const ch = track.channel;
            if (!channelMap.has(ch)) {
                channelMap.set(ch, { channel: ch, noteCount: 0, trackNames: [] });
            }
            const info = channelMap.get(ch);
            info.noteCount += track.notes.length;
            const tName = track.name || (track.instrument && track.instrument.name ? track.instrument.name : '') || `Track ${tIdx + 1}`;
            if (tName && !info.trackNames.includes(tName)) info.trackNames.push(tName);
        });

        if (channelMap.size === 0) {
            document.getElementById('status').textContent = 'No playable notes found in MIDI file.';
            e.target.value = '';
            return;
        }

        pendingMidiData = { midi, fileName };

        const channelSelect = document.getElementById('midi-channel-select');
        channelSelect.innerHTML = '';

        const sortedChannels = Array.from(channelMap.values()).sort((a, b) => a.channel - b.channel);

        sortedChannels.forEach(info => {
            const opt = document.createElement('option');
            opt.value = info.channel;
            const chNumDisplay = info.channel + 1;
            const trackDesc = info.trackNames.length > 0 ? info.trackNames.join(', ') : 'Track';
            const isDrums = info.channel === 9 ? ' [Drums/Percussion]' : '';
            opt.textContent = `Channel ${chNumDisplay}${isDrums}: ${trackDesc} (${info.noteCount} notes)`;

            if (info.channel !== 9) {
                opt.selected = true;
            }
            channelSelect.appendChild(opt);
        });

        document.getElementById('midi-channel-modal').classList.add('open');

    } catch (err) {
        console.error(err);
        document.getElementById('status').textContent = 'Failed to parse MIDI file.';
    }

    e.target.value = '';
});

document.getElementById('btn-midi-channel-cancel').addEventListener('click', () => {
    document.getElementById('midi-channel-modal').classList.remove('open');
    pendingMidiData = null;
});

document.getElementById('btn-midi-channel-confirm').addEventListener('click', () => {
    if (!pendingMidiData) return;
    const selectedChannel = parseInt(document.getElementById('midi-channel-select').value, 10);
    const { midi, fileName } = pendingMidiData;
    document.getElementById('midi-channel-modal').classList.remove('open');

    let allNotes = [];
    midi.tracks.forEach(track => {
        if (track.channel !== selectedChannel) return;
        track.notes.forEach(n => {
            allNotes.push({
                time: n.time,
                note: midiNoteToName(n.midi)
            });
        });
    });

    if (allNotes.length === 0) {
        document.getElementById('status').textContent = 'No playable notes in selected channel.';
        pendingMidiData = null;
        return;
    }

    allNotes.sort((a, b) => a.time - b.time);

    const hayNotes = [];
    const hayRests = [];

    let currentChord = [];
    let lastTime = 0;

    for (let i = 0; i < allNotes.length; i++) {
        const n = allNotes[i];
        if (i === 0) {
            currentChord.push(n.note.toUpperCase());
            hayRests.push(0);
            lastTime = n.time;
        } else {
            const timeDiff = Math.round((n.time - lastTime) * 1000);
            if (timeDiff <= 20) {
                currentChord.push(n.note.toUpperCase());
            } else {
                hayNotes.push(currentChord.join('+'));
                currentChord = [n.note.toUpperCase()];
                hayRests.push(timeDiff);
                lastTime = n.time;
            }
        }
    }
    if (currentChord.length > 0) {
        hayNotes.push(currentChord.join('+'));
    }

    const midiHayCode = `${hayNotes.join(',')},RESTS,${hayRests.join(',')}`;

    currentSongTitle = fileName;
    const parsed = parsePianoPad(midiHayCode);

    if (parsed.length > 0) {
        currentSong = autoTransposeSong(parsed);
        generatedHaycode = midiHayCode;
        btnShare.style.display = 'inline-flex';
        songSelect.value = '';
        document.getElementById('status').textContent = `Loaded MIDI Channel ${selectedChannel + 1}: "${fileName}". Converted successfully!`;
        updateRosterSong();
        playSong();
    } else {
        document.getElementById('status').textContent = 'Error parsing converted MIDI sequence.';
    }

    pendingMidiData = null;
});

const themePalettes = {
    default: { pending: '#38bdf8', normal: '#22c55e', shadowActive: 'rgba(56, 189, 248, 0.6)', shadowNormal: 'rgba(34, 197, 94, 0.4)' },
    cyberpunk: { pending: '#00f0ff', normal: '#ff007f', shadowActive: 'rgba(0, 240, 255, 0.8)', shadowNormal: 'rgba(255, 0, 127, 0.6)' },
    synthwave: { pending: '#fcee0a', normal: '#ff7700', shadowActive: 'rgba(252, 238, 10, 0.8)', shadowNormal: 'rgba(255, 119, 0, 0.6)' },
    matrix: { pending: '#00cc66', normal: '#00ff41', shadowActive: 'rgba(0, 204, 102, 0.8)', shadowNormal: 'rgba(0, 255, 65, 0.6)' },
    gold: { pending: '#fbbf24', normal: '#eab308', shadowActive: 'rgba(251, 191, 36, 0.8)', shadowNormal: 'rgba(234, 179, 8, 0.6)' }
};

const keyboardMap = {
    'z': 'c1', 's': 'c#1', 'x': 'd1', 'd': 'd#1', 'c': 'e1', 'v': 'f1', 'g': 'f#1', 'b': 'g1', 'h': 'g#1', 'n': 'a1', 'j': 'a#1', 'm': 'b1',
    ',': 'c2', 'l': 'c#2', '.': 'd2', '1': 'd#2', 'q': 'e2', 'w': 'f2', '3': 'f#2', 'e': 'g2', '4': 'g#2', 'r': 'a2', '5': 'a#2', 't': 'b2',
    'y': 'c3', '7': 'c#3', 'u': 'd3', '8': 'd#3', 'i': 'e3', 'o': 'f3', '0': 'f#3', 'p': 'g3'
};

const FALL_TIME_MS = 1800;
const PRE_FALL_PAUSE = 500;

const canvas = document.getElementById('waterfall-canvas');
const ctx = canvas.getContext('2d');

const speedSlider = document.getElementById('speed-slider');
const speedInput = document.getElementById('speed-input');

function updateSpeed(newVal, restartPlayback = true) {
    if (arcadeState.isSongBattle || koState.isClassKnockout) {
        document.getElementById('status').textContent = ' Tempo is locked at 100% during battles!';
        speedSlider.value = 100;
        if (speedInput) speedInput.value = 100;
        return;
    }

    let val = Math.max(10, Math.min(500, Math.round(Number(newVal) || 100)));
    speedSlider.value = val;
    if (speedInput) speedInput.value = val;
    if (restartPlayback && isPlaying && !isPaused && !isStepMode) {
        playSong();
    }
}

if (speedSlider) {
    speedSlider.addEventListener('input', () => {
        updateSpeed(speedSlider.value, true);
    });
}

if (speedInput) {
    speedInput.addEventListener('change', () => {
        updateSpeed(speedInput.value, true);
    });
    speedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            speedInput.blur();
        }
    });
}

const songSelect = document.getElementById('song-select');
const themeSelect = document.getElementById('theme-select');
const btnStep = document.getElementById('btn-step');
const btnGame = document.getElementById('btn-game');
const btnPause = document.getElementById('btn-pause');
const btnLoop = document.getElementById('btn-loop');
const btnRecord = document.getElementById('btn-record');
const recordBtnText = document.getElementById('record-btn-text');
const btnShare = document.getElementById('btn-share');

const loopStartSlider = document.getElementById('loop-start');
const loopEndSlider = document.getElementById('loop-end');
const loopRangeLabel = document.getElementById('loop-range-label');

const teacherModal = document.getElementById('teacher-modal');
const teacherPassInput = document.getElementById('teacher-pass');
const teacherTitleInput = document.getElementById('teacher-title');
const teacherCodeTextarea = document.getElementById('teacher-code');
const teacherErrorDiv = document.getElementById('teacher-error');

const settingsModal = document.getElementById('settings-modal');
const calibModal = document.getElementById('calib-modal');
const gameResultsModal = document.getElementById('game-results-modal');

document.getElementById('btn-settings').addEventListener('click', () => {
    initAudio();
    settingsModal.classList.add('open');
});
document.getElementById('btn-settings-close').addEventListener('click', () => settingsModal.classList.remove('open'));
document.getElementById('btn-start-calib').addEventListener('click', startCalibration);
document.getElementById('btn-calib-cancel').addEventListener('click', cancelCalibration);

themeSelect.addEventListener('change', (e) => {
    currentTheme = e.target.value;
    if (currentTheme === 'default') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', currentTheme);
    }
});

btnStep.addEventListener('click', toggleStepMode);
btnGame.addEventListener('click', toggleGameMode);
btnPause.addEventListener('click', togglePause);
btnLoop.addEventListener('click', toggleLoopMode);
btnRecord.addEventListener('click', toggleRecording);
document.getElementById('btn-add-teacher-song').addEventListener('click', openTeacherModal);
btnShare.addEventListener('click', shareHaycode);

document.getElementById('btn-teacher-cancel').addEventListener('click', () => teacherModal.classList.remove('open'));
document.getElementById('btn-teacher-submit').addEventListener('click', submitTeacherSong);

loopStartSlider.addEventListener('input', updateLoopRange);
loopEndSlider.addEventListener('input', updateLoopRange);

function updateLoopRange() {
    let start = parseInt(loopStartSlider.value, 10);
    let end = parseInt(loopEndSlider.value, 10);

    if (start >= end) {
        start = Math.max(0, end - 1);
        loopStartSlider.value = start;
    }
    loopRangeLabel.textContent = `${start}% - ${end}% Region`;
}

function buildCalibrationKeyboard() {
    const container = document.getElementById('calib-keyboard');
    container.innerHTML = '';
    for (let oct = 1; oct <= 6; oct++) {
        const octNotes = [
            { note: `c${oct}`, type: 'white', label: oct === 1 ? 'C' : '' },
            { note: `c#${oct}`, type: 'black' },
            { note: `d${oct}`, type: 'white' },
            { note: `d#${oct}`, type: 'black' },
            { note: `e${oct}`, type: 'white' },
            { note: `f${oct}`, type: 'white' },
            { note: `f#${oct}`, type: 'black' },
            { note: `g${oct}`, type: 'white' },
            { note: `g#${oct}`, type: 'black' },
            { note: `a${oct}`, type: 'white' },
            { note: `a#${oct}`, type: 'black' },
            { note: `b${oct}`, type: 'white' }
        ];
        octNotes.forEach(k => {
            const div = document.createElement('div');
            div.className = `calib-key ${k.type}`;
            div.dataset.calibNote = k.note;
            if (k.label) div.textContent = k.label;
            container.appendChild(div);
        });
    }
    const topC = document.createElement('div');
    topC.className = 'calib-key white';
    topC.dataset.calibNote = 'c7';
    topC.textContent = 'C';
    container.appendChild(topC);
}

function openTeacherModal() {
    initAudio();
    teacherPassInput.value = '';
    teacherTitleInput.value = '';
    teacherErrorDiv.style.display = 'none';
    teacherCodeTextarea.value = generatedHaycode ? generatedHaycode : '';
    teacherModal.classList.add('open');
    setTimeout(() => teacherPassInput.focus(), 100);
}

async function submitTeacherSong() {
    const pass = teacherPassInput.value;
    const title = teacherTitleInput.value.trim();
    const code = teacherCodeTextarea.value.trim();

    if (pass !== "ERC") {
        teacherErrorDiv.textContent = "Incorrect Teacher Password!";
        teacherErrorDiv.style.display = "block";
        return;
    }

    if (!title) {
        teacherErrorDiv.textContent = "Please enter a Song Title / Piece Name!";
        teacherErrorDiv.style.display = "block";
        return;
    }

    if (!code) {
        teacherErrorDiv.textContent = "Please enter or record a HayCode string!";
        teacherErrorDiv.style.display = "block";
        return;
    }

    const parsed = parsePianoPad(code);
    if (parsed.length === 0) {
        teacherErrorDiv.textContent = "Invalid HayCode format!";
        teacherErrorDiv.style.display = "block";
        return;
    }

    songList.push({ title: title, code: code, difficulty: 'Medium' });
    localStorage.setItem('pianopad_sheet_songs', JSON.stringify(songList));
    renderSongSelect();
    
    songSelect.value = code;
    currentSongTitle = title;
    currentSong = autoTransposeSong(parsed);

    teacherModal.classList.remove('open');
    document.getElementById('status').textContent = `Adding "${title}" to PianoPad & Google Sheet...`;

    if (APPS_SCRIPT_URL) {
        try {
            const addUrl = `${APPS_SCRIPT_URL}?action=ADD_SONG&title=${encodeURIComponent(title)}&code=${encodeURIComponent(code)}&t=${Date.now()}`;
            await sendJSONP(addUrl);
            document.getElementById('status').textContent = ` "${title}" successfully added to PianoPad & Google Sheet!`;
        } catch (e) {
            console.warn("Could not post to Apps Script endpoint.", e);
            document.getElementById('status').textContent = ` "${title}" loaded into PianoPad!`;
        }
    } else {
        document.getElementById('status').textContent = ` "${title}" loaded into PianoPad!`;
    }
    
    updateRosterSong();
    playSong();
}

function toggleGameMode() {
    initAudio();
    isGameMode = !isGameMode;
    if (isGameMode) {
        btnGame.textContent = 'Game Mode: ON';
        btnGame.classList.remove('btn-secondary');
        btnGame.classList.add('btn-game-active');

        if (isStepMode) toggleStepMode();
        resetGameStats();
        document.getElementById('status').textContent = ' GAME MODE ACTIVE! Press Play and hit falling notes in time.';
    } else {
        btnGame.textContent = 'Game Mode: OFF';
        btnGame.classList.remove('btn-game-active');
        btnGame.classList.add('btn-secondary');
        document.getElementById('status').textContent = 'Game Mode OFF. Normal play active.';
    }
}

function resetGameStats() {
    gameStats = { perfect: 0, earlyLate: 0, miss: 0 };
    currentPerfectStreak = 0;

    koState.activeSabotageType = null;
    koState.activeSabotageUntil = 0;
    koState.smokeParticles = [];
    canvas.classList.remove('canvas-shake-active');
}

function updateGameStatus() {
    const total = gameStats.perfect + gameStats.earlyLate + gameStats.miss;
    const accuracy = total > 0 ? (((gameStats.perfect * 1.0 + gameStats.earlyLate * 0.5) / total) * 100).toFixed(1) : '100.0';
    const streakLabel = currentPerfectStreak >= 10 ? ` | 🔥 STREAK (${currentPerfectStreak})` : '';
    const sabLabel = (koState.activeSabotageType && performance.now() < koState.activeSabotageUntil)
        ? ` | ⚠️ SABOTAGED: ${koState.activeSabotageType.toUpperCase()}!`
        : '';
    document.getElementById('status').textContent = ` Accuracy: ${accuracy}% |  Perfect: ${gameStats.perfect} |  Early/Late: ${gameStats.earlyLate} |  Missed: ${gameStats.miss}${streakLabel}${sabLabel}`;
}

async function calculateAndDisplayRank(accuracyNum) {
    const rankDiv = document.getElementById('game-rank-text');
    rankDiv.textContent = "Calculating Rank...";

    try {
        const response = await fetch(LEADERBOARD_CSV_URL);
        if (!response.ok) throw new Error('Fetch failed');

        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/);
        const songScores = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const row = [];
            let insideQuote = false;
            let entry = '';

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"' && line[j + 1] === '"') {
                    entry += '"';
                    j++;
                } else if (char === '"') {
                    insideQuote = !insideQuote;
                } else if (char === ',' && !insideQuote) {
                    row.push(entry);
                    entry = '';
                } else {
                    entry += char;
                }
            }
            row.push(entry);

            if (row.length >= 4) {
                const rowTitle = row[2] ? row[2].trim().replace(/^"|"$/g, '') : '';
                if (rowTitle.toLowerCase() === currentSongTitle.toLowerCase()) {
                    songScores.push({
                        accuracy: parseFloat(row[3]) || 0,
                        speed: parseInt(row[4]) || 100
                    });
                }
            }
        }

        const currentSpeedNum = parseInt(speedSlider.value, 10);
        songScores.push({ accuracy: accuracyNum, speed: currentSpeedNum });

        const titleLower = currentSongTitle.toLowerCase();
        const isAscending = titleLower.includes('mystery note') || titleLower.includes('finger sprint') || titleLower.includes('note name sniper') || titleLower.includes('ski slalom');

        songScores.sort((a, b) => {
            if (a.accuracy !== b.accuracy) {
                return isAscending ? a.accuracy - b.accuracy : b.accuracy - a.accuracy;
            }
            return b.speed - a.speed;
        });

        const totalEntries = songScores.length;
        const userRank = songScores.findIndex(s => s.accuracy === accuracyNum && s.speed === currentSpeedNum) + 1;

        rankDiv.textContent = `${currentSongTitle} Rank ${userRank}/${totalEntries}`;
    } catch (err) {
        console.warn("Could not calculate live rank:", err);
        rankDiv.textContent = `${currentSongTitle} Score Logged!`;
    }
}

function showGameResultsPopUp() {
    ensureStudentName();

    const perfectHits = gameStats.perfect;
    const earlyLateHits = gameStats.earlyLate;
    const missedHits = gameStats.miss;
    const totalHits = perfectHits + earlyLateHits + missedHits;

    const accuracy = totalHits > 0 ? (((perfectHits * 1.0 + earlyLateHits * 0.5) / totalHits) * 100).toFixed(1) : '0.0';
    const accuracyNum = parseFloat(accuracy);
    const songObj = songList.find(s => s.title.toLowerCase() === currentSongTitle.toLowerCase());
    awardNoteCraftSongReward(
        currentSongTitle,
        songObj ? songObj.difficulty : 'medium',
        accuracyNum,
        parseInt(speedSlider.value, 10) || 100,
        sessionStudentName
    );
    notifyDailySongComplete({
        songTitle: currentSongTitle,
        difficulty: songObj ? songObj.difficulty : 'medium',
        accuracy: accuracyNum,
        speed: parseInt(speedSlider.value, 10) || 100,
        perfect: perfectHits,
        miss: missedHits,
        theme: currentTheme,
        instrument: document.getElementById('instrument-select')?.value || 'piano',
        showSheetMusic,
        isMicListening
    });

    document.getElementById('game-summary-text').innerHTML = `Student: <span style="color:#38bdf8;">${sessionStudentName}</span><br>Final Score: <span style="color:#22c55e;">${accuracy}%</span><br><span style="font-size:0.8rem; color:#9ca3af;">(${perfectHits} Perfect, ${earlyLateHits} Early/Late, ${missedHits} Missed out of ${totalHits} notes)</span>`;

    const greenPct = totalHits > 0 ? (perfectHits / totalHits) * 100 : 0;
    const orangePct = totalHits > 0 ? (earlyLateHits / totalHits) * 100 : 0;
    const redPct = totalHits > 0 ? (missedHits / totalHits) * 100 : 0;

    document.getElementById('bar-green').style.height = `${greenPct}%`;
    document.getElementById('bar-orange').style.height = `${orangePct}%`;
    document.getElementById('bar-red').style.height = `${redPct}%`;

    const studentKey = (sessionStudentName || 'Student').trim().toLowerCase();
    const historyKey = `${studentKey}|||${currentSongTitle}`;
    if (!sessionSongHistory[historyKey]) {
        sessionSongHistory[historyKey] = [];
    }

    sessionSongHistory[historyKey].push({
        attempt: sessionSongHistory[historyKey].length + 1,
        perfect: perfectHits,
        earlyLate: earlyLateHits,
        miss: missedHits,
        total: totalHits,
        accuracy: parseFloat(accuracy) || 0,
        speed: parseInt(speedSlider.value, 10) || 100
    });

    const attempts = sessionSongHistory[historyKey];
    const singleGraph = document.getElementById('single-bar-graph');
    const multiGraph = document.getElementById('multi-bar-graph');

    if (attempts.length === 1) {
        multiGraph.style.display = 'none';
        singleGraph.style.display = 'flex';
    } else {
        singleGraph.style.display = 'none';
        multiGraph.innerHTML = '';
        multiGraph.style.display = 'flex';

        attempts.forEach((att, idx) => {
            const gPct = att.total > 0 ? (att.perfect / att.total) * 100 : 0;
            const oPct = att.total > 0 ? (att.earlyLate / att.total) * 100 : 0;
            const rPct = att.total > 0 ? (att.miss / att.total) * 100 : 0;
            const isLatest = idx === attempts.length - 1;

            const col = document.createElement('div');
            col.className = 'multi-bar-column';
            col.innerHTML = `
                <div class="rank-medal-badge" style="color: ${isLatest ? '#22c55e' : '#facc15'};">
                    ${att.accuracy.toFixed(1)}%
                </div>
                <div class="stacked-bar" style="${isLatest ? 'outline: 2px solid #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);' : ''}">
                    <div class="bar-part-red" style="height:${rPct}%;"></div>
                    <div class="bar-part-orange" style="height:${oPct}%;"></div>
                    <div class="bar-part-green" style="height:${gPct}%;"></div>
                </div>
                <span style="font-size:0.74rem; font-weight:700; color:${isLatest ? '#38bdf8' : '#cbd5e1'};">
                    Try ${att.attempt}
                </span>
                <span style="font-size:0.65rem; color:#9ca3af;">@${att.speed}%</span>
            `;
            multiGraph.appendChild(col);
        });

        multiGraph.scrollLeft = multiGraph.scrollWidth;
    }

    const currentSpeed = parseInt(speedSlider.value, 10);
    const badgeContainer = document.getElementById('badge-container');
    
    if (currentSpeed >= 100) {
        badgeContainer.innerHTML = `<div class="badge-box badge-gold"> GOLD BADGE: Full Master Speed (${currentSpeed}%)</div>`;
    } else if (currentSpeed >= 75) {
        badgeContainer.innerHTML = `<div class="badge-box badge-silver"> SILVER BADGE: Intermediate Tempo (${currentSpeed}%)</div>`;
    } else if (currentSpeed >= 50) {
        badgeContainer.innerHTML = `<div class="badge-box badge-bronze"> BRONZE BADGE: Practice Pace (${currentSpeed}%)</div>`;
    } else {
        badgeContainer.innerHTML = `<div style="font-size:0.8rem; color:#9ca3af; margin-top:4px;">Practice Speed: ${currentSpeed}% (Reach 50%+ for Practice Badges)</div>`;
    }

    gameResultsModal.classList.add('open');

    postScoreToLeaderboard(accuracyNum);
    calculateAndDisplayRank(accuracyNum);
    loadStudentTickerStats(sessionStudentName);
}

function toggleLoopMode() {
    initAudio();
    isLooping = !isLooping;
    if (isLooping) {
        btnLoop.textContent = 'Loop: ON';
        btnLoop.classList.remove('btn-secondary');
        btnLoop.classList.add('btn-loop-active');
    } else {
        btnLoop.textContent = 'Loop: OFF';
        btnLoop.classList.remove('btn-loop-active');
        btnLoop.classList.add('btn-secondary');
    }
}

function toggleRecording() {
    initAudio();
    isRecording = !isRecording;

    if (isRecording) {
        recordedNotes = [];
        recordedRests = [];
        lastRecordNoteTime = 0;
        
        recordBtnText.textContent = ' RECORDING (Click to Stop)';
        btnRecord.classList.add('btn-rec-active');
        btnShare.style.display = 'none';
        
        document.getElementById('status').textContent = ' RECORDING ACTIVE... Play notes using your keyboard or mouse!';
    } else {
        recordBtnText.textContent = 'Record';
        btnRecord.classList.remove('btn-rec-active');

        if (recordedNotes.length > 0) {
            generatedHaycode = `${recordedNotes.join(',')},RESTS,${recordedRests.join(',')}`;
            btnShare.style.display = 'inline-flex';
            document.getElementById('status').textContent = ` RECORDING STOPPED! ${recordedNotes.length} notes saved. Click "Share Haycode" or "Add SONG (Teacher)".`;
            openExportModal();
            notifyDailyRecording(recordedNotes.length);
        } else {
            document.getElementById('status').textContent = 'Recording stopped. No notes captured.';
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;

    initAudio();

    if (e.key === '(') {
        e.preventDefault();
        document.getElementById('student-join-name').value = sessionStudentName || localStorage.getItem('pianopad_name') || "";
        if (localStorage.getItem('pianopad_avatar')) {
            document.getElementById('student-join-avatar').value = localStorage.getItem('pianopad_avatar');
        }
        if (localStorage.getItem('pianopad_class')) {
            document.getElementById('student-join-class').value = localStorage.getItem('pianopad_class');
        }
        if (localStorage.getItem('pianopad_room')) {
            document.getElementById('student-join-room').value = localStorage.getItem('pianopad_room');
        }
        document.getElementById('room-join-modal').classList.add('open');
        document.getElementById('status').textContent = ' Room Login modal opened via "(" hotkey.';
        return;
    }

    if (e.key === ')') {
        if (!isAuthorizedTeacher()) return;
        e.preventDefault();
        const targetRoom = currentRoom || localStorage.getItem('pianopad_room') || 'Outside';
        openEyesFrontPrompt(targetRoom);
        return;
    }

    if (e.code === 'ArrowDown') {
        e.preventDefault();
        playSong();
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();
        if (isRecording) {
            toggleRecording();
            return;
        }
        if (!isStepMode) {
            toggleStepMode();
        } else {
            advanceStepNote();
        }
        return;
    }

    const keyChar = e.key.toLowerCase();
    if (keyboardMap[keyChar] && !e.repeat) {
        const noteStr = keyboardMap[keyChar];
        playManualNote(noteStr);
    }
});

window.addEventListener('keyup', (e) => {
    const keyChar = e.key.toLowerCase();
    if (keyboardMap[keyChar]) {
        handleMiniGameNoteRelease(keyboardMap[keyChar]);
    }
});

function toggleStepMode() {
    initAudio();
    
    if (arcadeState.isSongBattle || koState.isClassKnockout) {
        document.getElementById('status').textContent = ' Step Mode is NOT permitted during Song Battles or Class Knockouts!';
        return;
    }

    isStepMode = !isStepMode;
    if (isStepMode) {
        btnStep.textContent = 'Step Mode: ON';
        btnStep.classList.remove('btn-step');
        btnStep.classList.add('btn-step-active');

        if (isGameMode) toggleGameMode();
        
        if (!isPlaying) {
            playSong();
        } else {
            isPaused = false;
            btnPause.textContent = 'Pause';
            btnPause.classList.remove('btn-success');
            btnPause.classList.add('btn-warning');
        }
        currentStepIndex = 0;
        smoothStepElapsed = noteTimeline[0] ? noteTimeline[0].hitTime : 0;
        updateStepStatus();
    } else {
        btnStep.textContent = 'Step Mode: OFF';
        btnStep.classList.remove('btn-step-active');
        btnStep.classList.add('btn-step');
        document.getElementById('status').textContent = 'Step Mode OFF. Normal auto-play active.';
    }
}

function advanceStepNote() {
    if (noteTimeline.length === 0) return;

    if (currentStepIndex < noteTimeline.length) {
        const item = noteTimeline[currentStepIndex];
        item.notes.forEach(noteStr => {
            const freq = getNoteFrequency(noteStr);
            if (freq) playTone(freq, item.duration / 1000);
            highlightKey(noteStr, item.duration);
        });
        item.played = true;
        currentStepIndex++;
        updateStepStatus();
    }
}

function updateStepStatus() {
    if (currentStepIndex < noteTimeline.length) {
        const nextItem = noteTimeline[currentStepIndex];
        const displayStr = nextItem.notes.join('+').toUpperCase();
        document.getElementById('status').textContent = `Step ${currentStepIndex + 1} of ${noteTimeline.length}: Next Note -> [ ${displayStr} ] (Press SPACE BAR or play on MIDI Keyboard)`;
    } else {
        document.getElementById('status').textContent = 'Step Practice Finished!';
    }
}

function togglePause() {
    initAudio();
    if (!isPlaying || isStepMode) return;

    if (!isPaused) {
        isPaused = true;
        pauseStartTime = performance.now();
        btnPause.textContent = 'Resume';
        btnPause.classList.remove('btn-warning');
        btnPause.classList.add('btn-success');
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        document.getElementById('status').textContent = 'Paused.';
    } else {
        isPaused = false;
        accumulatedPauseMs += (performance.now() - pauseStartTime);
        lastFrameTime = performance.now();
        btnPause.textContent = 'Pause';
        btnPause.classList.remove('btn-success');
        btnPause.classList.add('btn-warning');
        document.getElementById('status').textContent = 'Playing...';
        animationFrameId = requestAnimationFrame(renderLoop);
    }
}

const keyLayout = [
    { note: 'c1', type: 'white', label: 'C', hint: 'Z' }, { note: 'c#1', type: 'black', label: 'C#', hint: 'S' },
    { note: 'd1', type: 'white', label: 'D', hint: 'X' }, { note: 'd#1', type: 'black', label: 'D#', hint: 'D' },
    { note: 'e1', type: 'white', label: 'E', hint: 'C' },
    { note: 'f1', type: 'white', label: 'F', hint: 'V' }, { note: 'f#1', type: 'black', label: 'F#', hint: 'G' },
    { note: 'g1', type: 'white', label: 'G', hint: 'B' }, { note: 'g#1', type: 'black', label: 'G#', hint: 'H' },
    { note: 'a1', type: 'white', label: 'A', hint: 'N' }, { note: 'a#1', type: 'black', label: 'A#', hint: 'J' },
    { note: 'b1', type: 'white', label: 'B', hint: 'M' },
    { note: 'c2', type: 'white', label: 'C', hint: ',' }, { note: 'c#2', type: 'black', label: 'C#', hint: 'L' },
    { note: 'd2', type: 'white', label: 'D', hint: '.' }, { note: 'd#2', type: 'black', label: 'D#', hint: '1' },
    { note: 'e2', type: 'white', label: 'E', hint: 'Q' },
    { note: 'f2', type: 'white', label: 'F', hint: 'W' }, { note: 'f#2', type: 'black', label: 'F#', hint: '3' },
    { note: 'g2', type: 'white', label: 'G', hint: 'E' }, { note: 'g#2', type: 'black', label: 'G#', hint: '4' },
    { note: 'a2', type: 'white', label: 'A', hint: 'R' }, { note: 'a#2', type: 'black', label: 'A#', hint: '5' },
    { note: 'b2', type: 'white', label: 'B', hint: 'T' },
    { note: 'c3', type: 'white', label: 'C', hint: 'Y' }, { note: 'c#3', type: 'black', label: 'C#', hint: '7' },
    { note: 'd3', type: 'white', label: 'D', hint: 'U' }, { note: 'd#3', type: 'black', label: 'D#', hint: '8' },
    { note: 'e3', type: 'white', label: 'E', hint: 'I' },
    { note: 'f3', type: 'white', label: 'F', hint: 'O' }, { note: 'f#3', type: 'black', label: 'F#', hint: '0' },
    { note: 'g3', type: 'white', label: 'G', hint: 'P' }, { note: 'g#3', type: 'black', label: 'G#' },
    { note: 'a3', type: 'white', label: 'A' }, { note: 'a#3', type: 'black', label: 'A#' },
    { note: 'b3', type: 'white', label: 'B' },
    { note: 'c4', type: 'white', label: 'C' }, { note: 'c#4', type: 'black', label: 'C#' },
    { note: 'd4', type: 'white', label: 'D' }, { note: 'd#4', type: 'black', label: 'D#' },
    { note: 'e4', type: 'white', label: 'E' },
    { note: 'f4', type: 'white', label: 'F' }, { note: 'f#4', type: 'black', label: 'F#' },
    { note: 'g4', type: 'white', label: 'G' }, { note: 'g#4', type: 'black', label: 'G#' },
    { note: 'a4', type: 'white', label: 'A' }, { note: 'a#4', type: 'black', label: 'A#' },
    { note: 'b4', type: 'white', label: 'B' }
];

let keyPosMap = {};

const keyboardEl = document.getElementById('keyboard');
keyLayout.forEach(k => {
    const keyDiv = document.createElement('div');
    keyDiv.className = `key ${k.type}`;
    keyDiv.dataset.note = k.note;
    keyDiv.textContent = k.label;

    if (k.hint) {
        const hintSpan = document.createElement('span');
        hintSpan.className = 'bind-hint';
        hintSpan.textContent = k.hint;
        keyDiv.appendChild(hintSpan);
    }

    keyDiv.addEventListener('mousedown', () => playManualNote(k.note));
    keyDiv.addEventListener('mouseup', () => handleMiniGameNoteRelease(k.note));
    keyDiv.addEventListener('mouseleave', (e) => {
        if (e.buttons === 1) handleMiniGameNoteRelease(k.note);
    });
    keyboardEl.appendChild(keyDiv);
});

function updateKeyPositions() {
    keyPosMap = {};
    const pianoRect = keyboardEl.getBoundingClientRect();
    const pianoLeft = pianoRect.left;
    const targetWidth = pianoRect.width;

    if (targetWidth > 0) {
        canvas.width = targetWidth;
    }

    const keys = keyboardEl.querySelectorAll('.key');
    keys.forEach(k => {
        const kRect = k.getBoundingClientRect();
        keyPosMap[k.dataset.note] = {
            left: kRect.left - pianoLeft,
            width: kRect.width,
            isBlack: k.classList.contains('black')
        };
    });
}

function highlightKey(noteStr, duration = 200, color = null) {
    const normalizedNote = noteStr.trim().toLowerCase();
    const el = document.querySelector(`.key[data-note="${normalizedNote}"]`);
    if (el) {
        el.classList.add('active');
        if (color) {
            el.style.backgroundColor = color;
            el.style.boxShadow = `0 0 14px ${color}`;
        }
        setTimeout(() => {
            el.classList.remove('active');
            el.style.backgroundColor = '';
            el.style.boxShadow = '';
        }, duration);
    }
}

function playManualNote(noteStr) {
    if (isEyesFrontFrozen()) return;

    initAudio();
    const freq = getNoteFrequency(noteStr);
    if (freq) {
        playTone(freq, 0.4, 1.0);
    }

    // If the Game Results modal is open, trigger the Play Again button directly
    if (gameResultsModal && gameResultsModal.classList.contains('open')) {
        const playAgainBtn = document.getElementById('btn-game-try-again');
        if (playAgainBtn && playAgainBtn.style.display !== 'none') {
            playAgainBtn.click();
            return;
        }
    }

    // Route note input to any active Arcade mini-game
    if (handleMiniGameNoteInput(noteStr)) {
        return;
    }

    if (isRecording) {
        const now = performance.now();
        let rest = lastRecordNoteTime === 0 ? 0 : Math.round(now - lastRecordNoteTime);
        if (rest <= 20 && recordedNotes.length > 0) {
            recordedNotes[recordedNotes.length - 1] += '+' + noteStr.toUpperCase();
        } else {
            recordedNotes.push(noteStr.toUpperCase());
            recordedRests.push(rest);
            lastRecordNoteTime = now;
        }
    }

    if ((isGameMode || arcadeState.activeMiniGame === 'combo') && isPlaying && !isPaused) {
        let effectiveElapsed = (performance.now() - playbackStartTime) - accumulatedPauseMs;
        
        const target = noteTimeline.find(item =>
            item.notes.some(n => n.toLowerCase().trim() === noteStr.toLowerCase().trim()) &&
            item.gameStatus === 'pending' &&
            Math.abs(effectiveElapsed - item.hitTime) <= 400
        );

        if (target) {
            const diff = Math.abs(effectiveElapsed - target.hitTime);
            if (diff <= 140) {
                target.gameStatus = 'perfect';
                gameStats.perfect++;
                currentPerfectStreak++;
                notifyDailyStreak(currentPerfectStreak);
                highlightKey(noteStr, 220, '#22c55e');

                if (koState.isClassKnockout && currentPerfectStreak > 0 && currentPerfectStreak % 15 === 0) {
                    triggerStreakSabotage(currentPerfectStreak);
                }
                
                const normNote = noteStr.toLowerCase().trim();
                const pos = keyPosMap[normNote];
                if (pos) spawnConfetti(pos.left + pos.width / 2, canvas.height, '#22c55e');
            } else {
                target.gameStatus = 'earlyLate';
                gameStats.earlyLate++;
                currentPerfectStreak = 0;
                highlightKey(noteStr, 220, '#f97316');
            }

            if (koState.isClassKnockout) {
                syncKnockoutLiveScore();
            } else if (arcadeState.isSongBattle) {
                syncSongBattlePlayerStats(gameStats);
            }

            if (isGameMode) updateGameStatus();
        } else {
            gameStats.miss++;
            currentPerfectStreak = 0;
            playErrorClackSound();
            highlightKey(noteStr, 200, '#ef4444');

            if (koState.isClassKnockout) {
                syncKnockoutLiveScore();
            } else if (arcadeState.isSongBattle) {
                syncSongBattlePlayerStats(gameStats);
            }
            if (isGameMode) updateGameStatus();
        }
    } else {
        highlightKey(noteStr);
    }

    if (isStepMode) {
        const targetItem = noteTimeline[currentStepIndex];
        if (targetItem && targetItem.notes.some(n => n.toLowerCase().trim() === noteStr.toLowerCase().trim())) {
            advanceStepNote();
        }
    }
}

function parseCSVToSongs(csvText) {
    const songs = [];
    const lines = csvText.split(/\r?\n/);
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = [];
        let insideQuote = false;
        let entry = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"' && line[j + 1] === '"') {
                entry += '"';
                j++;
            } else if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                row.push(entry);
                entry = '';
            } else {
                entry += char;
            }
        }
        row.push(entry);

        if (row.length >= 2 && row[0].trim()) {
            songs.push({
                title: row[0].trim().replace(/^"|"$/g, ''),
                code: row[1].trim().replace(/^"|"$/g, ''),
                difficulty: row[2] ? row[2].trim().replace(/^"|"$/g, '') : ''
            });
        }
    }
    return songs;
}

function renderSongSelect() {
    const uniqueMap = new Map();
    songList.forEach(s => {
        const key = s.title.toLowerCase().trim();
        if (!uniqueMap.has(key)) uniqueMap.set(key, s);
    });
    const sortedList = Array.from(uniqueMap.values());
    sortedList.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));

    songSelect.innerHTML = '<option value="">-- Choose a Song --</option>';
    sortedList.forEach(song => {
        const opt = document.createElement('option');
        opt.value = song.code;

        let badge = '';
        if (song.difficulty) {
            const diff = song.difficulty.toLowerCase().trim();
            if (diff === 'easy') {
                badge = '🟢 ';
                opt.style.color = '#22c55e';
            } else if (diff === 'medium') {
                badge = '🟠 ';
                opt.style.color = '#f97316';
            } else if (diff === 'hard') {
                badge = '🔴 ';
                opt.style.color = '#ef4444';
            }
            opt.dataset.diff = diff;
        }

        opt.textContent = badge + song.title;
        songSelect.appendChild(opt);
    });
}

async function syncSongsWithGoogleSheet() {
    localStorage.removeItem('pianopad_sheet_songs');

    let localCache = [];
    const cachedData = localStorage.getItem('pianopad_sheet_songs');
    if (cachedData) {
        try {
            localCache = JSON.parse(cachedData);
            songList = [...localCache];
            renderSongSelect();
            const defaultObj = songList.find(s => s.title === 'Wipeout') || songList[0];
            if (defaultObj) {
                currentSongTitle = defaultObj.title;
                currentSong = autoTransposeSong(parsePianoPad(defaultObj.code));
            }
            document.getElementById('status').textContent = `Loaded ${songList.length} cached songs. Syncing live Google Sheet...`;
        } catch (e) {
            console.warn("Cache parse error");
        }
    }

    let remoteSongs = [];

    try {
        const res = await sendJSONP(`${APPS_SCRIPT_URL}?action=GET_SONGS&v=2&t=${Date.now()}`);

        if (res && res.songs && res.songs.length > 0) {
            remoteSongs = res.songs.map(s => ({
                title: s.title || s[0],
                code: s.code || s[1],
                difficulty: s.difficulty || s[2] || ''
            }));
        } else {
            throw new Error(res ? res.error : "No songs returned from JSONP");
        }
    } catch (err) {
        console.warn("Apps Script fetch error, trying CSV fallback...", err);
        try {
            const response = await fetch(SPREADSHEET_CSV_URL);
            if (response.ok) {
                const csvText = await response.text();
                remoteSongs = parseCSVToSongs(csvText);
            }
        } catch (csvErr) {
            console.warn("CSV Fallback error:", csvErr);
        }
    }

    if (remoteSongs.length > 0) {
        const songMap = new Map();
        remoteSongs.forEach(s => songMap.set(s.title.toLowerCase().trim(), s));
        localCache.forEach(s => {
            const key = s.title.toLowerCase().trim();
            if (!songMap.has(key)) {
                songMap.set(key, s);
            }
        });

        songList = Array.from(songMap.values());
        localStorage.setItem('pianopad_sheet_songs', JSON.stringify(songList));
        renderSongSelect();

        const defaultObj = songList.find(s => s.title === currentSongTitle) || songList.find(s => s.title === 'Wipeout') || songList[0];
        if (defaultObj) {
            currentSongTitle = defaultObj.title;
            songSelect.value = defaultObj.code;
            currentSong = autoTransposeSong(parsePianoPad(defaultObj.code));
        }
        document.getElementById('status').textContent = `Synced live! Loaded ${songList.length} songs from Google Sheet.`;
    } else if (songList.length > 0) {
        document.getElementById('status').textContent = `Loaded ${songList.length} songs (Offline mode).`;
    } else {
        document.getElementById('status').textContent = `Failed to load songs from Google Sheet. Check connection or link permissions.`;
    }
    updateMonitorWidget();
}

function buildTimeline() {
    noteTimeline = [];
    if (!currentSong || currentSong.length === 0) return;

    const fallSpeed = arcadeState.activeMiniGame === 'drop' ? arcadeState.miniGameFallSpeedMs : FALL_TIME_MS;
    const speedFactor = parseFloat(speedSlider.value) / 100;
    let cumulativeMs = PRE_FALL_PAUSE + fallSpeed;

    currentSong.forEach((item) => {
        cumulativeMs += (item.rest || 0) / speedFactor;

        noteTimeline.push({
            notes: item.notes,
            safeKey: item.safeKey || null,
            hitTime: cumulativeMs,
            duration: Math.max(140, (item.rest || 250) * 0.85 / speedFactor),
            played: false,
            gameStatus: 'pending'
        });
    });
}

songSelect.addEventListener('change', (e) => {
    initAudio();
    const code = e.target.value;
    if (!code) return;
    const opt = songSelect.options[songSelect.selectedIndex];
    if (opt) currentSongTitle = opt.text;
    const parsed = parsePianoPad(code);
    if (parsed.length > 0) {
        currentSong = autoTransposeSong(parsed);
        updateRosterSong();
        playSong();
    }
});

function stopSong() {
    isPlaying = false;
    isPaused = false;
    btnPause.textContent = 'Pause';
    btnPause.classList.remove('btn-success');
    btnPause.classList.add('btn-warning');

    if (isRecording) {
        toggleRecording();
    }

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    document.querySelectorAll('.key').forEach(k => {
        k.classList.remove('active');
        k.style.backgroundColor = '';
        k.style.boxShadow = '';
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('status').textContent = 'Playback stopped.';
}

function playSong() {
    initAudio();
    stopSong();
    if (currentSong.length === 0) {
        document.getElementById('status').textContent = 'No song loaded. Select a song or import one.';
        return;
    }

    updateKeyPositions();
    buildTimeline();
    resetGameStats();

    isPlaying = true;
    isPaused = false;
    accumulatedPauseMs = 0;
    playbackStartTime = performance.now();
    lastFrameTime = performance.now();

    if (isStepMode) {
        currentStepIndex = 0;
        smoothStepElapsed = noteTimeline[0] ? noteTimeline[0].hitTime : 0;
        updateStepStatus();
    } else if (isGameMode) {
        updateGameStatus();
    } else {
        document.getElementById('status').textContent = 'Playing...';
    }

  
    animationFrameId = requestAnimationFrame(renderLoop);
}

function drawNoteBlock(x, y, width, height, noteName, active, gameStatus = 'pending') {
    ctx.save();
    
    const palette = themePalettes[currentTheme] || themePalettes.default;

    const pitchColorMap = {
        'c': '#ef4444',
        'd': '#f97316',
        'e': '#eab308',
        'f': '#22c55e',
        'g': '#3b82f6',
        'a': '#8b5cf6',
        'b': '#ec4899'
    };

    const noteLetterMatch = (noteName || '').trim().toLowerCase().match(/^([a-g])/);
    const defaultPitchColor = noteLetterMatch && pitchColorMap[noteLetterMatch[1]] 
        ? pitchColorMap[noteLetterMatch[1]] 
        : palette.normal;

    let blockColor = defaultPitchColor;
    let shadowColor = palette.shadowNormal;

    if (isGameMode || arcadeState.activeMiniGame) {
        if (gameStatus === 'perfect') {
            blockColor = '#22c55e';
            shadowColor = 'rgba(34, 197, 94, 0.8)';
        } else if (gameStatus === 'earlyLate') {
            blockColor = '#f97316';
            shadowColor = 'rgba(249, 115, 22, 0.8)';
        } else if (gameStatus === 'miss') {
            blockColor = '#ef4444';
            shadowColor = 'rgba(239, 68, 68, 0.8)';
        } else {
            blockColor = defaultPitchColor;
            shadowColor = palette.shadowActive;
        }
    } else if (active) {
        blockColor = palette.pending;
        shadowColor = palette.shadowActive;
    }

    const isFrozen = (koState.activeSabotageType === 'freeze' && performance.now() < koState.activeSabotageUntil && gameStatus === 'pending');
    if (isFrozen) {
        blockColor = '#bae6fd';
        shadowColor = 'rgba(224, 242, 254, 0.95)';
    }

    ctx.fillStyle = blockColor;

    const radius = Math.min(6, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    if (isFrozen) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    if (height >= 18) {
        ctx.fillStyle = isFrozen ? '#0f172a' : '#ffffff';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const match = noteName.match(/^([a-g]#?)/i);
        const label = match ? match[1].toUpperCase() : noteName.toUpperCase();
        ctx.fillText(isFrozen ? '❄️' : label, x + width / 2, y + height / 2);
    }
    ctx.restore();
}

function renderLoop(now) {
    if (!isPlaying || isPaused) return;

    const dt = Math.min((now - lastFrameTime) / 1000, 0.1) || 0.016;
    lastFrameTime = now;

    let effectiveElapsed = 0;

    if (isStepMode) {
        const targetStepElapsed = (currentStepIndex < noteTimeline.length)
            ? noteTimeline[currentStepIndex].hitTime
            : (noteTimeline[noteTimeline.length - 1] ? noteTimeline[noteTimeline.length - 1].hitTime + 500 : 0);
        
        smoothStepElapsed += (targetStepElapsed - smoothStepElapsed) * 0.15;
        effectiveElapsed = smoothStepElapsed;
    } else {
        effectiveElapsed = (now - playbackStartTime) - accumulatedPauseMs;
    }

    if (isLooping && noteTimeline.length > 0 && !isStepMode && !arcadeState.activeMiniGame) {
        const firstHit = noteTimeline[0].hitTime;
        const lastHit = noteTimeline[noteTimeline.length - 1].hitTime + noteTimeline[noteTimeline.length - 1].duration;
        const totalDuration = lastHit - firstHit;

        const startPct = parseInt(loopStartSlider.value, 10) / 100;
        const endPct = parseInt(loopEndSlider.value, 10) / 100;

        const loopEndMs = firstHit + (totalDuration * endPct);

        if (effectiveElapsed >= loopEndMs) {
            const currentSpeedVal = parseFloat(speedSlider.value);
            const acceleratedSpeed = Math.min(500, Math.round(currentSpeedVal * 1.02));
            
            if (acceleratedSpeed !== currentSpeedVal) {
                updateSpeed(acceleratedSpeed, false);
                buildTimeline();
            }

            const updatedFirstHit = noteTimeline[0].hitTime;
            const updatedLastHit = noteTimeline[noteTimeline.length - 1].hitTime + noteTimeline[noteTimeline.length - 1].duration;
            const updatedTotalDuration = updatedLastHit - updatedFirstHit;
            const newLoopStartMs = updatedFirstHit + (updatedTotalDuration * startPct);

            playbackStartTime = now - newLoopStartMs - accumulatedPauseMs;
            effectiveElapsed = newLoopStartMs;
            noteTimeline.forEach(n => {
                if (n.hitTime >= newLoopStartMs) {
                    n.played = false;
                    n.gameStatus = 'pending';
                }
            });

            document.getElementById('status').textContent = ` Loop accelerated by +2% (Now ${acceleratedSpeed}%)`;
        }
    }

    if (arcadeState.activeMiniGame === 'simon') {
        drawSimonStaircase();
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const canvasHeight = canvas.height;
    const currentFallSpeed = arcadeState.activeMiniGame === 'drop' ? arcadeState.miniGameFallSpeedMs : FALL_TIME_MS;
    const waterfallTop = (showSheetMusic && !arcadeState.activeMiniGame) ? 75 : 0;
    const waterfallHeight = canvasHeight - waterfallTop;

    if (showSheetMusic && !arcadeState.activeMiniGame) {
        drawSheetMusicStaff(ctx, canvas.width);

        const line1_y = 56;
        const halfStep = 4;
        const targetX = 85;
        const CLEF_X_END = 65;
        const SCROLL_TIME_MS = 2200;

        let has8va = false;
        let has15ma = false;

        let nextNoteItem = null;
        let minUpcomingTime = Infinity;

        noteTimeline.forEach(item => {
            const timeUntilHit = item.hitTime - effectiveElapsed;
            if (timeUntilHit >= -100 && timeUntilHit < minUpcomingTime && !item.played) {
                minUpcomingTime = timeUntilHit;
                nextNoteItem = item;
            }
        });

        noteTimeline.forEach(item => {
            const timeUntilHit = item.hitTime - effectiveElapsed;
            if (timeUntilHit >= -350 && timeUntilHit <= SCROLL_TIME_MS + 400) {
                const noteX = targetX + (timeUntilHit / SCROLL_TIME_MS) * (canvas.width - targetX);

                if (noteX > CLEF_X_END && noteX < canvas.width + 15) {
                    const isNextNote = (item === nextNoteItem);
                    const noteColor = isNextNote ? '#ef4444' : '#000000';

                    item.notes.forEach(noteStr => {
                        const info = getDiatonicStepAndShift(noteStr);
                        if (info) {
                            const noteY = line1_y - info.step * halfStep;
                            drawLedgerLines(ctx, noteX, info.step, line1_y, halfStep, noteColor);
                            drawStemlessNote(ctx, noteX, noteY, info.isSharp, noteColor);

                            if (info.octaveShift === 1) has8va = true;
                            if (info.octaveShift === 2) has15ma = true;
                        }
                    });
                }
            }
        });

        if (has8va || has15ma) {
            ctx.save();
            ctx.fillStyle = '#8b5cf6';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const octText = has15ma ? '15ma' : '8va';
            ctx.fillText(`${octText} ------------------`, 85, 4);
            ctx.restore();
        }
    }

    noteTimeline.forEach((item, itemIdx) => {
        const backgroundVol = (isGameMode || arcadeState.activeMiniGame) ? 0.2 : 1.0;

        if (!isStepMode && effectiveElapsed >= item.hitTime && !item.played) {
            item.played = true;
            item.notes.forEach(noteStr => {
                const freq = getNoteFrequency(noteStr);
                if (freq) {
                    playTone(freq, item.duration / 1000, backgroundVol);
                    if (!isGameMode && !arcadeState.activeMiniGame) {
                        highlightKey(noteStr, item.duration);
                    }
                }
            });
        }

        if ((isGameMode || arcadeState.activeMiniGame) && item.gameStatus === 'pending' && effectiveElapsed > (item.hitTime + 280)) {
            item.gameStatus = 'miss';
            gameStats.miss++;
            currentPerfectStreak = 0;
            if (koState.isClassKnockout) {
                syncKnockoutLiveScore();
            } else if (arcadeState.isSongBattle) {
                syncSongBattlePlayerStats(gameStats);
            }
            if (isGameMode) updateGameStatus();
        }

        const normNotes = item.notes.map(n => n.toLowerCase().trim());

        normNotes.forEach((normNote, noteSubIdx) => {
            const origNoteStr = item.notes[noteSubIdx];
            const pos = keyPosMap[normNote];

            if (pos) {
                const timeUntilHit = item.hitTime - effectiveElapsed;
                const yBottom = canvasHeight - (timeUntilHit / currentFallSpeed) * waterfallHeight;
                let blockHeight = (item.duration / currentFallSpeed) * waterfallHeight;

                let nextSamePitchItem = null;
                for (let k = itemIdx + 1; k < noteTimeline.length; k++) {
                    if (noteTimeline[k].notes.some(n => n.toLowerCase().trim() === normNote)) {
                        nextSamePitchItem = noteTimeline[k];
                        break;
                    }
                }

                if (nextSamePitchItem) {
                    const timeGap = nextSamePitchItem.hitTime - item.hitTime;
                    const distanceToNext = (timeGap / currentFallSpeed) * waterfallHeight;
                    const separationPx = 6;
                    blockHeight = Math.min(blockHeight, Math.max(6, distanceToNext - separationPx));
                }

                const yTop = yBottom - blockHeight;

                if (yBottom > waterfallTop && yTop < canvasHeight) {
                    const drawY = Math.max(waterfallTop, yTop);
                    const drawH = Math.min(canvasHeight - drawY, yBottom - drawY);
                    const active = effectiveElapsed >= item.hitTime && effectiveElapsed <= (item.hitTime + item.duration);
                    drawNoteBlock(pos.left + 2, drawY, pos.width - 4, drawH, origNoteStr, active, item.gameStatus);
                }
            }
        });
    });

    if (koState.activeSabotageType && now < koState.activeSabotageUntil) {
        if (koState.activeSabotageType === 'smoke') {
            const smokeZoneBottom = waterfallTop + waterfallHeight * 0.42;
            if (koState.smokeParticles.length < 28) {
                koState.smokeParticles.push({
                    x: Math.random() * canvas.width,
                    y: waterfallTop + Math.random() * (waterfallHeight * 0.35),
                    r: 45 + Math.random() * 65,
                    vx: (Math.random() - 0.5) * 2.4,
                    alpha: 0.55 + Math.random() * 0.35
                });
            }
            ctx.save();
            const fogGrad = ctx.createLinearGradient(0, waterfallTop, 0, smokeZoneBottom + 25);
            fogGrad.addColorStop(0, 'rgba(203, 213, 225, 0.92)');
            fogGrad.addColorStop(0.75, 'rgba(148, 163, 184, 0.84)');
            fogGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
            ctx.fillStyle = fogGrad;
            ctx.fillRect(0, waterfallTop, canvas.width, waterfallHeight * 0.45);

            koState.smokeParticles.forEach(sp => {
                sp.x += sp.vx;
                if (sp.x < -60) sp.x = canvas.width + 60;
                if (sp.x > canvas.width + 60) sp.x = -60;
                ctx.beginPath();
                ctx.fillStyle = `rgba(226, 232, 240, ${sp.alpha})`;
                ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        } else if (koState.activeSabotageType === 'freeze') {
            ctx.save();
            ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
            ctx.lineWidth = 8;
            ctx.strokeRect(4, waterfallTop + 4, canvas.width - 8, waterfallHeight - 8);
            ctx.restore();
        }
    } else if (koState.activeSabotageType && now >= koState.activeSabotageUntil) {
        koState.activeSabotageType = null;
        koState.smokeParticles = [];
        canvas.classList.remove('canvas-shake-active');
    }

    if (confettiParticles.length > 0) {
        const speedScale = dt * 60;
        for (let i = confettiParticles.length - 1; i >= 0; i--) {
            let p = confettiParticles[i];
            p.x += p.vx * speedScale;
            p.y += p.vy * speedScale;
            p.vy += 0.3 * speedScale;
            p.rot += p.rotSpeed * speedScale;
            p.life -= 0.015 * speedScale;

            if (p.life <= 0) {
                confettiParticles.splice(i, 1);
            } else {
                ctx.save();
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        }
    }

    if (!isStepMode && !isLooping) {
        const lastNote = noteTimeline[noteTimeline.length - 1];
        if (lastNote && effectiveElapsed > lastNote.hitTime + lastNote.duration + 500) {
            isPlaying = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (koState.isClassKnockout) {
                submitKnockoutRoundFinish();
                return;
            } else if (arcadeState.isSongBattle) {
                markSongBattleLocalFinished();
                return;
            } else if (isGameMode) {
                showGameResultsPopUp();
                return;
            } else if (arcadeState.activeMiniGame) {
                currentSongTitle = arcadeState.activeMiniGame === 'drop' ? "Drop Dodge" : "Combo Strike";
                showGameResultsPopUp();
                arcadeState.activeMiniGame = null;
                return;
            }

            document.getElementById('status').textContent = 'Playback finished.';
            return;
        }
    }

    animationFrameId = requestAnimationFrame(renderLoop);
}

const modal = document.getElementById('modal');
const exportModal = document.getElementById('export-modal');
const importTextarea = document.getElementById('import-text');
const exportTextarea = document.getElementById('export-text');
const btnEmailHaycode = document.getElementById('btn-email-haycode');

window.addEventListener('resize', updateKeyPositions);

document.getElementById('btn-import').addEventListener('click', () => {
    initAudio();
    importTextarea.value = '';
    modal.classList.add('open');
});

document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.remove('open'));
document.getElementById('btn-export-close').addEventListener('click', () => exportModal.classList.remove('open'));

document.getElementById('btn-play').addEventListener('click', playSong);
document.getElementById('btn-stop').addEventListener('click', stopSong);

document.getElementById('btn-load-play').addEventListener('click', () => {
    initAudio();
    const code = importTextarea.value;
    const parsed = parsePianoPad(code);
    if (parsed.length > 0) {
        currentSongTitle = 'Custom Imported Song';
        currentSong = autoTransposeSong(parsed);
        songSelect.value = '';
        modal.classList.remove('open');
        playSong();
    } else {
        document.getElementById('status').textContent = 'Invalid code format imported.';
    }
});

function openExportModal() {
    if (!generatedHaycode) return;
    exportTextarea.value = generatedHaycode;

    const subject = encodeURIComponent("HayCode for PianoPad 26");
    const body = encodeURIComponent("Here is my recorded HayCode for PianoPad 26:\n\n" + generatedHaycode);
    btnEmailHaycode.href = `mailto:?subject=${subject}&body=${body}`;

    exportModal.classList.add('open');
}

async function shareHaycode() {
    initAudio();
    if (!generatedHaycode) return;

    const shareData = {
        title: 'HayCode for PianoPad 26',
        text: 'Here is my recorded HayCode for PianoPad 26:\n\n' + generatedHaycode
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            openExportModal();
        }
    } else {
        openExportModal();
    }
}

document.getElementById('btn-copy-haycode').addEventListener('click', () => {
    exportTextarea.select();
    navigator.clipboard.writeText(exportTextarea.value);
    document.getElementById('status').textContent = 'Haycode copied to clipboard!';
});

document.getElementById('btn-export-wav').addEventListener('click', () => {
    initAudio();
    if (!generatedHaycode) {
        alert("No recorded HayCode available to export.");
        return;
    }

    const currentCleanCode = generatedHaycode.replace(/[\r\n\s]+/g, '').toLowerCase();

    let isDuplicate = false;
    for (let song of songList) {
        if (song.code) {
            const dbCleanCode = song.code.replace(/[\r\n\s]+/g, '').toLowerCase();
            if (dbCleanCode === currentCleanCode) {
                isDuplicate = true;
                break;
            }
        }
    }

    if (isDuplicate) {
        alert("WAV Export Blocked: This recorded HayCode matches an existing song in the database. Audio export is only allowed for original student recordings.");
        return;
    }

    const defaultTitle = currentSongTitle && currentSongTitle !== 'Wipeout' ? currentSongTitle : 'My_PianoPad_Song';
    const userTitle = prompt("Please enter a title for your recorded WAV audio file:", defaultTitle);

    if (userTitle === null) return;

    const cleanFileName = userTitle.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_') || 'PianoPad_Song';

    exportPerformanceToWAV(cleanFileName);
});

function showFlashingStatus(message, durationMs = 6000) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.classList.add('status-flash-success');

    setTimeout(() => {
        statusEl.classList.remove('status-flash-success');
    }, 3200);

    setTimeout(() => {
        if (statusEl.textContent === message) {
            statusEl.textContent = 'PianoPad Relay Active';
        }
    }, durationMs);
}

let pendingExportBlob = null;
let pendingExportFileName = null;
let pendingExportMode = 'download';

const yearSelect = document.getElementById('upload-year-select');
const letterGroup = document.getElementById('class-letter-group');
const letterSelect = document.getElementById('upload-class-letter-select');

if (yearSelect) {
    yearSelect.addEventListener('change', () => {
        const val = yearSelect.value;
        if (val === '7' || val === '8') {
            letterGroup.style.display = 'flex';
            letterSelect.selectedIndex = 0;
        } else {
            letterGroup.style.display = 'none';
            letterSelect.value = '';
        }
    });
}

document.getElementById('btn-cancel-class-select')?.addEventListener('click', () => {
    document.getElementById('class-select-modal').classList.remove('open');
    pendingExportBlob = null;
});

document.getElementById('btn-confirm-class-select')?.addEventListener('click', processConfirmedClassUpload);

function processConfirmedClassUpload() {
    const yearVal = document.getElementById('upload-year-select').value;
    const letterVal = document.getElementById('upload-class-letter-select').value;

    if (!yearVal) {
        alert("Please select your Year Group!");
        return;
    }

    if ((yearVal === '7' || yearVal === '8') && !letterVal) {
        alert("Please select your Class Letter!");
        return;
    }

    const fullClassCode = (yearVal === '7' || yearVal === '8') ? `${yearVal}${letterVal}` : `Year${yearVal}`;
    const studentName = (sessionStudentName || localStorage.getItem('pianopad_name') || 'Student').replace(/\s+/g, '');
    const avatar = sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || '';
    const fullFormattedName = `${fullClassCode}_${pendingExportFileName}_${studentName}_${avatar}`;

    document.getElementById('class-select-modal').classList.remove('open');

    if (pendingExportMode === 'download' || pendingExportMode === 'both') {
        const url = URL.createObjectURL(pendingExportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fullFormattedName}.wav`;
        a.click();
        showFlashingStatus(` DOWNLOAD COMPLETE: "${fullFormattedName}.wav" saved locally!`);
    }

    if (pendingExportMode === 'drive' || pendingExportMode === 'both') {
        uploadAudioToGoogleDrive(pendingExportBlob, fullFormattedName, fullClassCode, studentName);
    }

    pendingExportBlob = null;
}

function uploadAudioToGoogleDrive(wavBlob, fullFormattedName, fullClassCode, studentName) {
    document.getElementById('status').textContent = "Uploading audio performance to Drive folder...";

    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = function () {
        const base64Data = reader.result.split(',')[1];

        const payload = {
            action: "UPLOAD_AUDIO",
            studentClass: fullClassCode,
            room: currentRoom || "G1",
            studentName: studentName,
            fileName: fullFormattedName,
            base64Data: base64Data
        };

        fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === "SUCCESS") {
                showFlashingStatus(` UPLOAD SUCCESSFUL! Saved as "${fullFormattedName}.wav" in ${data.assignedRoom} -> ${data.folderName}`);
            } else {
                showFlashingStatus(` Upload Notice: ${data.error || 'Check Drive setup'}`);
            }
        })
        .catch(err => {
            console.error("Network notice:", err);
            showFlashingStatus(` Audio saved as "${fullFormattedName}.wav"!`);
        });
    };
}

function exportPerformanceToWAV(fileName = 'PianoPad_Song') {
    if (recordedNotes.length === 0) {
        alert("No recorded note sequence found.");
        return;
    }

    let studentName = sessionStudentName || localStorage.getItem('pianopad_name');
    if (!studentName || studentName === "Student" || !studentName.trim()) {
        const inputName = prompt("Please enter your First Name and Last Initial before exporting (e.g. Alex M):", "Student A");
        if (inputName && inputName.trim()) {
            sessionStudentName = sanitizeName(inputName);
            localStorage.setItem('pianopad_name', sessionStudentName);
        } else {
            sessionStudentName = "Student";
        }
    }

    const choice = prompt(
        "Choose an export option:\n\nType '1' or 'WAV' to Download WAV file\nType '2' or 'DRIVE' to Upload directly to Drive Folder\nType '3' or 'BOTH' to do Both",
        "1"
    );

    if (!choice) return;

    const cleanChoice = choice.trim().toLowerCase();
    const shouldDownload = cleanChoice === '1' || cleanChoice === 'wav' || cleanChoice === '3' || cleanChoice === 'both';
    const shouldUpload = cleanChoice === '2' || cleanChoice === 'drive' || cleanChoice === '3' || cleanChoice === 'both';

    if (!shouldDownload && !shouldUpload) {
        alert("Invalid selection. Please choose 1, 2, or 3.");
        return;
    }

    if (shouldDownload && shouldUpload) pendingExportMode = 'both';
    else if (shouldUpload) pendingExportMode = 'drive';
    else pendingExportMode = 'download';

    document.getElementById('status').textContent = "Rendering WAV audio...";

    let totalMs = 0;
    recordedRests.forEach(r => totalMs += r);
    const totalSeconds = Math.max(1.5, (totalMs + 1000) / 1000);

    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalSeconds), sampleRate);

    let cumulativeTime = 0;
    for (let i = 0; i < recordedNotes.length; i++) {
        const noteToken = recordedNotes[i];
        const restMs = recordedRests[i] || 250;
        cumulativeTime += (restMs / 1000);

        const noteList = noteToken.split('+').filter(Boolean);
        noteList.forEach(noteStr => {
            const freq = getNoteFrequency(noteStr);
            if (freq) {
                const osc = offlineCtx.createOscillator();
                const gain = offlineCtx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, cumulativeTime);

                gain.gain.setValueAtTime(0, cumulativeTime);
                gain.gain.linearRampToValueAtTime(0.4, cumulativeTime + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, cumulativeTime + 0.4);

                osc.connect(gain);
                gain.connect(offlineCtx.destination);

                osc.start(cumulativeTime);
                osc.stop(cumulativeTime + 0.4);
            }
        });
    }

    offlineCtx.startRendering().then(renderedBuffer => {
        const wavBlob = bufferToWavBlob(renderedBuffer);

        const expModal = document.getElementById('export-modal');
        if (expModal) expModal.classList.remove('open');

        pendingExportBlob = wavBlob;
        pendingExportFileName = fileName;

        document.getElementById('upload-year-select').selectedIndex = 0;
        document.getElementById('class-letter-group').style.display = 'none';

        document.getElementById('class-select-modal').classList.add('open');
    }).catch(err => {
        console.error("WAV Export Error:", err);
        document.getElementById('status').textContent = "WAV Export failed.";
    });
}

async function postBattleToSpreadsheet(battlePayload) {
    if (!APPS_SCRIPT_URL) return;
    try {
        const url = `${APPS_SCRIPT_URL}?action=SUBMIT_BATTLE&players=${encodeURIComponent(JSON.stringify(battlePayload))}&t=${Date.now()}`;
        await sendJSONP(url);
        document.getElementById('status').textContent = `Song Battle results saved to Google Sheet!`;
    } catch (err) {
        console.warn("Could not post battle to Google Sheet:", err);
    }
}

async function postScoreToLeaderboard(accuracyNum) {
    if (!APPS_SCRIPT_URL) return;

    ensureStudentName();
    const speedText = speedSlider.value + '%';
    const studentClass = currentStudentClass || localStorage.getItem('pianopad_class') || currentRoom || '';

    try {
        document.getElementById('status').textContent = `Submitting score (${accuracyNum}) for ${sessionStudentName} (${studentClass || 'No Class'})...`;

        const url = `${APPS_SCRIPT_URL}?action=SCORE_SUBMIT&name=${encodeURIComponent(sessionStudentName)}&title=${encodeURIComponent(currentSongTitle)}&score=${encodeURIComponent(accuracyNum)}&tempo=${encodeURIComponent(speedText)}&class=${encodeURIComponent(studentClass)}&studentClass=${encodeURIComponent(studentClass)}&t=${Date.now()}`;
        const res = await sendJSONP(url);
        
        if (res && res.status === "SCORE_SUBMITTED") {
            document.getElementById('status').textContent = `Score (${accuracyNum}) saved to Google Sheet for ${sessionStudentName}!`;
        } else if (res && res.error) {
            document.getElementById('status').textContent = `Google Sheet write error: ${res.error}`;
        } else {
            document.getElementById('status').textContent = `Score (${accuracyNum}) submitted for ${sessionStudentName}!`;
        }
    } catch (err) {
        console.warn("Could not post score to Google Apps Script.", err);
        document.getElementById('status').textContent = `Failed to submit score for ${sessionStudentName}.`;
    }
}

function initApp() {
    initKnockoutBridge({
        getState: () => ({ localStudentId, sessionStudentName, sessionStudentAvatar, currentStudentClass, currentRoom, songList, currentSongTitle, gameStats }),
        setStudentName: (name) => { sessionStudentName = name; },
        setCurrentSongTitle: (title) => { currentSongTitle = title; },
        setCurrentSong: (song) => { currentSong = song; },
        setIsSongBattle: (val) => { arcadeState.isSongBattle = val; },
        closeSprintOptionModal,
        showFlashingStatus,
        showGrandFinale,
        postBattleToSpreadsheet,
        startCountdown: (onComplete) => {
            const overlay = document.getElementById('countdown-overlay');
            const numText = document.getElementById('countdown-text');
            overlay.style.display = 'flex';
            let count = 3;
            numText.textContent = count;
            const interval = setInterval(() => {
                count--;
                if (count > 0) numText.textContent = count;
                else if (count === 0) numText.textContent = "GO!";
                else {
                    clearInterval(interval);
                    overlay.style.display = 'none';
                    if (onComplete) onComplete();
                }
            }, 800);
        },
        playSong,
        stopSong,
        prepareMatchStart: () => {
            isStepMode = false;
            btnStep.textContent = 'Step Mode';
            btnStep.classList.remove('btn-step-active');
            btnStep.classList.add('btn-step');
            isGameMode = true;
            btnGame.textContent = 'Game Mode: ON';
            btnGame.classList.add('btn-game-active');
            resetGameStats();
        }
    });

    initFinaleBridge({
        getState: () => ({ sessionStudentName, localStudentId }),
        onClose: () => {
            if (arcadeState.isSongBattle) {
                stopBattlePolling();
            } else if (koState.isClassKnockout) {
                leaveClassKnockout();
            }
            loadStudentTickerStats(sessionStudentName);
        }
    });

    initDailyChallengeBridge({
        getState: () => ({ sessionStudentName, currentStudentClass, currentRoom }),
        ensureStudentName,
        sendJSONP,
        unlockBonusSounds,
        spawnConfetti,
        showFlashingStatus
    });

    initMiniGamesBridge({
        getState: () => ({ noteTimeline, playbackStartTime, accumulatedPauseMs, gameStats, keyPosMap, keyLayout, sessionStudentName, sessionStudentAvatar, songList, currentSongTitle }),
        setIsPlaying: (val) => { isPlaying = val; },
        setCurrentSongTitle: (t) => { currentSongTitle = t; },
        setCurrentSong: (s) => { currentSong = s; },
        setStudentName: (n) => { sessionStudentName = n; },
        resetGameStats,
        highlightKey,
        spawnConfetti,
        stopSong,
        playSong,
        startCountdown: (onComplete) => {
            const overlay = document.getElementById('countdown-overlay');
            const numText = document.getElementById('countdown-text');
            overlay.style.display = 'flex';
            let count = 3;
            numText.textContent = count;
            const interval = setInterval(() => {
                count--;
                if (count > 0) numText.textContent = count;
                else if (count === 0) numText.textContent = "GO!";
                else {
                    clearInterval(interval);
                    overlay.style.display = 'none';
                    if (onComplete) onComplete();
                }
            }, 800);
        },
        ensureStudentName,
        sanitizeName,
        sendJSONP,
        postScoreToLeaderboard,
        postBattleToSpreadsheet,
        loadStudentTickerStats,
        showGameResultsPopUp,
        showGrandFinale,
        unlockBonusSounds,
        initSwissTournamentUI,
        joinClassKnockoutStudent,
        disableStepModeIfActive: () => {
            if (isStepMode) {
                isStepMode = false;
                btnStep.textContent = 'Step Mode';
                btnStep.classList.remove('btn-step-active');
                btnStep.classList.add('btn-step');
            }
        },
        prepareSongBattleStart: () => {
            isStepMode = false;
            btnStep.textContent = 'Step Mode';
            btnStep.classList.remove('btn-step-active');
            btnStep.classList.add('btn-step');
            isGameMode = true;
            btnGame.textContent = 'Game Mode: ON';
            btnGame.classList.add('btn-game-active');
        },
        startGeneratedTimelineSong: (songArr, statusMsg) => {
            currentSong = songArr;
            buildTimeline();
            isPlaying = true;
            playbackStartTime = performance.now();
            lastFrameTime = performance.now();
            document.getElementById('status').textContent = statusMsg;
            requestAnimationFrame(renderLoop);
        }
    });

    initMIDIHardware();
    resetGameStats();
    syncSongsWithGoogleSheet();
    setTimeout(updateKeyPositions, 100);
    
    checkFirstTimeCalibration();

    const savedName = localStorage.getItem('pianopad_name');
    const savedAvatar = localStorage.getItem('pianopad_avatar');
    const savedClass = localStorage.getItem('pianopad_class');
    const savedRoom = localStorage.getItem('pianopad_room');
    if (savedName) sessionStudentName = savedName;
    if (savedAvatar) sessionStudentAvatar = savedAvatar;
    if (savedClass) currentStudentClass = savedClass;
    if (savedRoom) currentRoom = savedRoom;

    const now = new Date();
    const day = now.getDay();
    const timeMins = now.getHours() * 60 + now.getMinutes();
    const isOOS = (day === 0 || day === 6) || (timeMins < 8 * 60) || (timeMins >= 14 * 60 + 5);

    const roomSelect = document.getElementById('student-join-room');
    document.getElementById('student-join-name').value = savedName || "";
    if (savedAvatar) document.getElementById('student-join-avatar').value = savedAvatar;
    if (savedClass) document.getElementById('student-join-class').value = savedClass;

    if (isOOS) {
        currentRoom = "Outside";
        if (roomSelect) roomSelect.style.display = 'none';
    } else {
        if (roomSelect) {
            roomSelect.style.display = '';
            if (savedRoom) roomSelect.value = savedRoom;
        }
    }

    document.getElementById('room-join-modal').classList.add('open');

    if (window.firebaseSet) {
        syncStudentToFirebase();
    } else {
        window.addEventListener('firebase-initialized', () => syncStudentToFirebase(), { once: true });
    }

    setInterval(updateMonitorWidget, 1000);
}

async function loadStudentTickerStats(studentName) {
    if (!studentName || studentName === "Student" || studentName === "Anonymous") return;

    const tickerContainer = document.getElementById('student-ticker-tape');
    const tickerTrack = document.getElementById('ticker-track');
    if (!tickerContainer || !tickerTrack) return;

    const cleanName = (str) => String(str || '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetName = cleanName(studentName);

    const announceUrl = `https://docs.google.com/spreadsheets/d/1euEFrGRf_fRAJ_U1SLgXdERRWL_DDd3iPbm16G--MSM/gviz/tq?sheet=announcement&range=A2:A2&tqx=responseHandler:parseAnnounceGviz&_ts=${Date.now()}`;
    const fetchAnnouncement = () => new Promise((resolve) => {
        const script = document.createElement('script');
        window.parseAnnounceGviz = function(gvizData) {
            delete window.parseAnnounceGviz;
            if (document.body.contains(script)) document.body.removeChild(script);
            let val = "";
            if (gvizData && gvizData.table) {
                if (gvizData.table.rows && gvizData.table.rows.length > 0 && gvizData.table.rows[0].c && gvizData.table.rows[0].c[0]) {
                    val = gvizData.table.rows[0].c[0].v;
                } else if (gvizData.table.cols && gvizData.table.cols.length > 0) {
                    val = gvizData.table.cols[0].label;
                }
            }
            resolve(val ? String(val).trim() : "");
        };
        script.src = announceUrl;
        script.onerror = function() {
            delete window.parseAnnounceGviz;
            if (document.body.contains(script)) document.body.removeChild(script);
            resolve("");
        };
        document.body.appendChild(script);
    });

    const gvizUrl = `https://docs.google.com/spreadsheets/d/1euEFrGRf_fRAJ_U1SLgXdERRWL_DDd3iPbm16G--MSM/gviz/tq?sheet=GameModeRanks&tqx=responseHandler:parseTickerGvizResponse&_ts=${Date.now()}`;
    const fetchGvizData = () => new Promise((resolve) => {
        const script = document.createElement('script');
        window.parseTickerGvizResponse = function(gvizData) {
            delete window.parseTickerGvizResponse;
            if (document.body.contains(script)) document.body.removeChild(script);
            if (gvizData && gvizData.table && gvizData.table.rows) {
                resolve(gvizData.table);
            } else {
                resolve(null);
            }
        };
        script.src = gvizUrl;
        script.onerror = function() {
            delete window.parseTickerGvizResponse;
            if (document.body.contains(script)) document.body.removeChild(script);
            resolve(null);
        };
        document.body.appendChild(script);
    });

    const [announceText, tableData] = await Promise.all([fetchAnnouncement(), fetchGvizData()]);

    let teacherAnnouncement = "";
    if (announceText && announceText.toLowerCase() !== "null" && announceText !== "") {
        teacherAnnouncement = `<span class="ticker-item" style="color:#facc15; font-weight:900; letter-spacing:0.02em; animation: textBlink 1.5s infinite ease-in-out;">📢 ${announceText}</span><span style="color:#64748b;"> • </span>`;
    }

    const stats = [];
    if (tableData) {
        const cols = tableData.cols || [];
        let titleIdx = 0, nameIdx = 1, scoreIdx = 2, rankIdx = 3, attemptsIdx = 4;

        cols.forEach((col, idx) => {
            const label = (col.label || '').toLowerCase();
            if (label.includes('title') || label.includes('song')) titleIdx = idx;
            else if (label.includes('student') || label.includes('name')) nameIdx = idx;
            else if (label.includes('score')) scoreIdx = idx;
            else if (label.includes('rank')) rankIdx = idx;
            else if (label.includes('attempt') || label.includes('play')) attemptsIdx = idx;
        });

        tableData.rows.forEach(r => {
            const cells = r.c || [];
            if (cells[nameIdx] && cells[nameIdx].v !== null) {
                const rowStudentName = String(cells[nameIdx].v || '');
                
                if (cleanName(rowStudentName) === targetName) {
                    const titleVal = cells[titleIdx] ? String(cells[titleIdx].v || '') : 'Song';
                    const scoreVal = cells[scoreIdx] ? parseFloat(cells[scoreIdx].v) || 0 : 0;
                    const rankVal = cells[rankIdx] ? parseInt(cells[rankIdx].v, 10) || 1 : 1;
                    const attemptsVal = cells[attemptsIdx] ? parseInt(cells[attemptsIdx].v, 10) || 1 : 1;

                    stats.push({
                        title: titleVal,
                        score: scoreVal,
                        rank: rankVal,
                        attempts: attemptsVal
                    });
                }
            }
        });
    }

    stats.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : b.score - a.score);

    if (stats.length === 0) {
        tickerTrack.innerHTML = teacherAnnouncement + `<span class="ticker-item">Welcome <span class="ticker-item-title">${studentName}</span>! No Game Mode scores logged yet. Play songs in Game Mode to earn your ranks!</span>`;
        tickerContainer.style.display = 'flex';
        return;
    }

    const rank1Count = stats.filter(s => s.rank === 1).length;
    const rank2Count = stats.filter(s => s.rank === 2).length;
    const rank3Count = stats.filter(s => s.rank === 3).length;

    let itemsHtml = teacherAnnouncement + `
        <span class="ticker-item" style="color:#38bdf8;">
            Logged in as <strong>${studentName}</strong> | Ranked in ${stats.length} Songs (${rank1Count > 0 ? '🥇x' + rank1Count + ' ' : ''}${rank2Count > 0 ? '🥈x' + rank2Count + ' ' : ''}${rank3Count > 0 ? '🥉x' + rank3Count : ''})
        </span>
        <span style="color:#64748b;">•</span>
    `;

    itemsHtml += stats.map(s => {
        const medal = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`;
        const unit = (s.title.toLowerCase().includes('finger sprint') || s.title.toLowerCase().includes('ski slalom')) ? 's' : (s.title.toLowerCase().includes('simon taps') ? ' lvl' : '%');
        return `
            <span class="ticker-item">
                <span>${medal}</span>
                <span class="ticker-item-title">${s.title}</span>:
                <span class="ticker-item-rank">Rank #${s.rank}</span>
                <span class="ticker-item-score">(${s.score}${unit})</span>
                <span style="color:#94a3b8; font-size:0.68rem;">[${s.attempts} plays]</span>
            </span>
        `;
    }).join('<span style="color:#64748b;"> • </span>');

    tickerTrack.innerHTML = itemsHtml + `<span style="color:#64748b;"> • </span>` + itemsHtml;
    tickerContainer.style.display = 'flex';

    const dynamicDuration = Math.max(30, stats.length * 6);
    tickerTrack.style.animationDuration = `${dynamicDuration}s`;
}

Object.assign(window, {
    closeGrandFinale,
    toggleFanfareMute,
    closeUnlockModal,
    skipCalibration,
    cancelCalibration
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
