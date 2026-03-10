document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const timeDisplay = document.getElementById('time-display');
    const statusMessage = document.getElementById('status-message');
    const startPauseBtn = document.getElementById('btn-start-pause');
    const btnReset = document.getElementById('btn-reset');
    const textStartPause = document.getElementById('text-start-pause'); // Renamed from textStartPause to btnStartPauseText in the new code, but keeping original for now
    const sessionsCountDisplay = document.getElementById('sessions-count');
    const progressCircle = document.getElementById('progress-ring-circle');
    const alarmSound = document.getElementById('alarm-sound');

    // Mode buttons
    const modePomodoroBtn = document.getElementById('mode-pomodoro');
    const modeShortBreakBtn = document.getElementById('mode-short-break');

    // Gacha Elements
    const gachaInventory = document.getElementById('gacha-inventory');
    const btnGachaPull = document.getElementById('btn-gacha-pull');

    // Lo-Fi Player Elements
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    // Constants
    const POMODORO_MINS = 25;
    const SHORT_BREAK_MINS = 5;
    const POMODORO_TIME = POMODORO_MINS * 60; // Assuming POMODORO_TIME is POMODORO_MINS * 60
    const SHORT_BREAK_TIME = SHORT_BREAK_MINS * 60; // Assuming SHORT_BREAK_TIME is SHORT_BREAK_MINS * 60

    // SVG Progress Ring Math based on new r=145
    const radius = 145;
    const circumference = radius * 2 * Math.PI;
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = 0;

    // State
    let timeLeft = POMODORO_TIME;
    let timerId = null;
    let isRunning = false;
    let isPomodoroMode = true; // Replaces timerState.mode and timerState.isRunning

    // Gamification State
    let sessionsCompleted = parseInt(localStorage.getItem('skzoo_sessions')) || 0;
    let gachaTokens = parseInt(localStorage.getItem('skzoo_tokens')) || 0;
    let unlockedItems = JSON.parse(localStorage.getItem('skzoo_inventory')) || [];

    // The Gacha Prize Pool (Cute SKZ/Y2K Emojis)
    const gachaPrizePool = [
        '☕', '🍰', '🥟', '🐥', '🐰', '🐺', '🦊', '🐶', '🐷', '🐿️',
        '🎧', '🎤', '🎸', '🎹', '💿', '✨', '💖', '🧸', '🪴', '📷'
    ];

    // YouTube Player Instance
    let ytPlayer;
    let isLofiPlaying = false;

    // Initialize
    init();

    function init() {
        updateDisplay();
        updateSessionsDisplay();
        updateGachaUI();
        renderInventory();

        // Check for daily reset
        const lastDate = localStorage.getItem('skzoo_last_date');
        const today = new Date().toDateString();

        if (lastDate !== today) {
            sessionsCompleted = 0;
            localStorage.setItem('skzoo_sessions', 0);
            localStorage.setItem('skzoo_last_date', today);
            updateSessionsDisplay();
        }

        // --- YOUTUBE LOFI PLAYER LOGIC ---
        // Required by YouTube IFrame API
        // This function needs to be globally accessible for the YouTube API script to call it.
        // For now, it's placed here, but typically it would be in the global scope.
        window.onYouTubeIframeAPIReady = function () {
            ytPlayer = new YT.Player('youtube-player-container', {
                height: '0',
                width: '0',
                videoId: 'E9z-yZ9Etyo', // Popular SKZ Lofi Mix (or can be swapped)
                playerVars: {
                    'autoplay': 0,
                    'controls': 0,
                    'disablekb': 1,
                    'loop': 1,
                    'playlist': 'E9z-yZ9Etyo' // Needed for looping single video
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
        }

        function onPlayerReady(event) {
            // Player is ready, controls can now be used
            console.log("Lo-Fi Player Ready!");
        }

        function onPlayerStateChange(event) {
            if (event.data == YT.PlayerState.PLAYING) {
                isLofiPlaying = true;
                btnPlayPause.textContent = '⏸';
            } else {
                isLofiPlaying = false;
                btnPlayPause.textContent = '▶';
            }
        }

        function toggleLofi() {
            if (!ytPlayer || !ytPlayer.playVideo) return; // API not ready yet

            if (isLofiPlaying) {
                ytPlayer.pauseVideo();
            } else {
                ytPlayer.playVideo();
            }
        }

        // Just skipping forward/backward within the long lofi mix
        function skipLofiTrack(forward = true) {
            if (!ytPlayer || !ytPlayer.getCurrentTime) return;
            const currentTime = ytPlayer.getCurrentTime();
            // Skip 3 minutes forward/backward to simulate "next track" in a long mix
            ytPlayer.seekTo(forward ? currentTime + 180 : currentTime - 180, true);
        }


        // --- EVENT LISTENERS ---
        startPauseBtn.addEventListener('click', toggleTimer);
        btnReset.addEventListener('click', resetTimer);
        modePomodoroBtn.addEventListener('click', setPomodoroMode);
        modeShortBreakBtn.addEventListener('click', setBreakMode);

        // Gacha Event
        btnGachaPull.addEventListener('click', pullGacha);

        // Lofi Player Events
        btnPlayPause.addEventListener('click', toggleLofi);
        btnNext.addEventListener('click', () => skipLofiTrack(true));
        btnPrev.addEventListener('click', () => skipLofiTrack(false));
    }

    function setPomodoroMode() {
        if (isRunning) {
            if (!confirm('SYS WARN: Timer active. Override mode?')) {
                return;
            }
        }
        pauseTimer();
        isPomodoroMode = true;
        timeLeft = POMODORO_TIME;
        modePomodoroBtn.classList.add('active');
        modeShortBreakBtn.classList.remove('active');
        document.body.classList.remove('mode-break');
        statusMessage.textContent = 'READY! (^.^)';
        updateDisplay();
    }

    function setBreakMode() {
        if (isRunning) {
            if (!confirm('SYS WARN: Timer active. Override mode?')) {
                return;
            }
        }
        pauseTimer();
        isPomodoroMode = false;
        timeLeft = SHORT_BREAK_TIME;
        modeShortBreakBtn.classList.add('active');
        modePomodoroBtn.classList.remove('active');
        document.body.classList.add('mode-break');
        statusMessage.textContent = 'CHILL TIME ~';
        updateDisplay();
    }

    function toggleTimer() {
        if (isRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    }

    function startTimer() {
        isRunning = true;
        statusMessage.textContent = isPomodoroMode ? 'WORKING <3' : 'CHILLING ~';

        // UI Updates for button
        textStartPause.textContent = 'PAUSE';

        const expectedEndTime = Date.now() + (timeLeft * 1000);

        timerId = setInterval(() => {
            // Calculate time left reliably
            const now = Date.now();
            timeLeft = Math.round((expectedEndTime - now) / 1000);

            if (timeLeft <= 0) {
                timeLeft = 0;
                handleTimerComplete();
            }

            updateDisplay();
        }, 1000);
    }

    function pauseTimer() {
        isRunning = false;
        clearInterval(timerId);
        statusMessage.textContent = 'PAUSED ._.';

        // UI Updates for button
        textStartPause.textContent = 'START';
    }

    function resetTimer() {
        pauseTimer();
        timeLeft = isPomodoroMode ? POMODORO_TIME : SHORT_BREAK_TIME;
        statusMessage.textContent = isPomodoroMode ? 'READY! (^.^)' : 'CHILL TIME ~';
        updateDisplay();
    }

    function handleTimerComplete() {
        isRunning = false;
        clearInterval(timerId);
        playAlarm();
        textStartPause.textContent = 'START';

        if (isPomodoroMode) {
            // Pomodoro finished! Add a session and a token.
            sessionsCompleted++;
            gachaTokens++;
            localStorage.setItem('skzoo_sessions', sessionsCompleted);
            localStorage.setItem('skzoo_tokens', gachaTokens);
            localStorage.setItem('skzoo_last_date', new Date().toDateString());

            updateSessionsDisplay();
            updateGachaUI();

            statusMessage.textContent = "DONE! GOOD JOB <3";
            // Auto-switch to break
            setTimeout(setBreakMode, 3000);
        } else {
            statusMessage.textContent = 'BREAKS OVER!';
            // Auto-switch to pomodoro
            setTimeout(setPomodoroMode, 3000);
        }

        updateDisplay();
    }

    function playAlarm() {
        try {
            alarmSound.currentTime = 0;
            alarmSound.volume = 0.5;
            alarmSound.play();
        } catch (e) {
            console.log("Audio play failed", e);
        }
    }

    function updateDisplay() {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // Update progress ring
        const totalDuration = isPomodoroMode ? POMODORO_TIME : SHORT_BREAK_TIME;
        const progress = timeLeft / totalDuration;
        const offset = circumference - (progress * circumference);
        progressCircle.style.strokeDashoffset = offset;
    }

    function updateSessionsDisplay() {
        sessionsCountDisplay.textContent = sessionsCompleted;
    }

    function updateGachaUI() {
        btnGachaPull.disabled = gachaTokens < 1;
        btnGachaPull.querySelector('span').textContent = `PULL GACHA (⭐ ${gachaTokens})`;
    }

    function renderInventory() {
        gachaInventory.innerHTML = '';

        if (unlockedItems.length === 0) {
            gachaInventory.innerHTML = '<span style="color:#A0AAB5; font-size:0.8rem;">Gacha empty...</span>';
            return;
        }

        unlockedItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.classList.add('gacha-item');
            itemEl.textContent = item;
            gachaInventory.appendChild(itemEl);
        });
    }

    function pullGacha() {
        if (gachaTokens < 1) return;

        // Deduct token
        gachaTokens--;
        localStorage.setItem('skzoo_tokens', gachaTokens);

        // Pick random item
        const randomPrize = gachaPrizePool[Math.floor(Math.random() * gachaPrizePool.length)];
        unlockedItems.push(randomPrize);
        localStorage.setItem('skzoo_inventory', JSON.stringify(unlockedItems));

        updateGachaUI();
        renderInventory();
    }
});
