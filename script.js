(() => {
  'use strict';

  const GAME_WIDTH = 960;
  const GAME_HEIGHT = 540;
  const WINNING_SCORE_DEFAULT = 7;
  const STORAGE_KEY = 'neon-pong-best-score';

  const DIFFICULTY = {
    easy: { aiSpeed: 260, reactionDelay: 0.18, predictionError: 28, maxBounceAngle: 1.15 },
    normal: { aiSpeed: 330, reactionDelay: 0.12, predictionError: 18, maxBounceAngle: 1.3 },
    hard: { aiSpeed: 410, reactionDelay: 0.08, predictionError: 10, maxBounceAngle: 1.45 },
  };

  const game = {
    state: 'ready',
    score: { player: 0, cpu: 0 },
    winningScore: WINNING_SCORE_DEFAULT,
    difficulty: 'normal',
    bestScore: 0,
    audioEnabled: true,
    audioReady: false,
    audioCtx: null,
    lastTs: 0,
    lastFrameMs: 16.67,
    animationFrame: 0,
    pendingGoal: false,
    pointerActive: false,
    keyboard: { up: false, down: false },
    touchActive: false,
    pointerY: GAME_HEIGHT / 2,
    inputLocked: false,
    ai: {
      targetY: GAME_HEIGHT / 2,
      reactionTimer: 0,
      lastMove: 0,
    },
    player: {
      x: 28,
      y: GAME_HEIGHT / 2 - 55,
      width: 18,
      height: 110,
      speed: 560,
      color: '#64f2ff',
    },
    cpu: {
      x: GAME_WIDTH - 46,
      y: GAME_HEIGHT / 2 - 55,
      width: 18,
      height: 110,
      speed: DIFFICULTY.normal.aiSpeed,
      color: '#ff4ecd',
    },
    ball: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      radius: 10,
      vx: 0,
      vy: 0,
      speed: 420,
      maxSpeed: 980,
    },
    canvas: null,
    ctx: null,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };

  const ui = {
    playerScore: document.getElementById('playerScore'),
    cpuScore: document.getElementById('cpuScore'),
    bestScoreDisplay: document.getElementById('bestScoreDisplay'),
    matchStatus: document.getElementById('matchStatus'),
    targetScore: document.getElementById('targetScore'),
    progressLabel: document.getElementById('progressLabel'),
    winnerLabel: document.getElementById('winnerLabel'),
    startButton: document.getElementById('startButton'),
    pauseButton: document.getElementById('pauseButton'),
    restartButton: document.getElementById('restartButton'),
    newMatchButton: document.getElementById('newMatchButton'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    overlayAction: document.getElementById('overlayAction'),
    soundToggle: document.getElementById('soundToggle'),
    difficultySelect: document.getElementById('difficultySelect'),
    gameArea: document.getElementById('gameArea'),
    canvas: document.getElementById('gameCanvas'),
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function chooseDifficulty(value) {
    const normalized = String(value || 'normal').toLowerCase();
    return Object.prototype.hasOwnProperty.call(DIFFICULTY, normalized) ? normalized : 'normal';
  }

  function safeStorageGet() {
    try {
      const value = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function safeStorageSet(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      // Ignore blocked storage gracefully.
    }
  }

  function updateBestScoreDisplay() {
    ui.bestScoreDisplay.textContent = String(game.bestScore);
  }

  function updateHud() {
    ui.playerScore.textContent = String(game.score.player);
    ui.cpuScore.textContent = String(game.score.cpu);
    ui.progressLabel.textContent = `${game.score.player} - ${game.score.cpu}`;
    ui.targetScore.textContent = `First to ${game.winningScore}`;

    if (game.score.player > game.score.cpu) {
      ui.winnerLabel.textContent = 'Player';
    } else if (game.score.cpu > game.score.player) {
      ui.winnerLabel.textContent = 'CPU';
    } else {
      ui.winnerLabel.textContent = '—';
    }

    const stateLabel = {
      ready: 'Ready',
      playing: 'Live',
      paused: 'Paused',
      'point-transition': 'Point',
      'match-over': 'Match over',
    }[game.state] || 'Ready';
    ui.matchStatus.textContent = stateLabel;
  }

  function setOverlay(title, text, buttonText) {
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.overlayAction.textContent = buttonText;
  }

  function setOverlayVisible(visible) {
    ui.overlay.classList.toggle('hidden', !visible);
  }

  function applyState(nextState) {
    game.state = nextState;
    updateHud();

    if (nextState === 'playing') {
      setOverlayVisible(false);
      return;
    }

    if (nextState === 'ready') {
      setOverlayVisible(true);
      setOverlay('Ready to serve', 'Press Start or hit Enter to begin.', 'Start match');
      return;
    }

    if (nextState === 'paused') {
      setOverlayVisible(true);
      setOverlay('Paused', 'Resume when you are ready.', 'Resume');
      return;
    }

    if (nextState === 'point-transition') {
      setOverlayVisible(true);
      const pointText = game.score.player === game.score.cpu ? 'Serve the next rally.' : 'Next serve incoming...';
      setOverlay('Point', pointText, 'Continue');
      return;
    }

    if (nextState === 'match-over') {
      setOverlayVisible(true);
      const playerWon = game.score.player >= game.winningScore;
      const summary = playerWon ? 'Victory' : 'Defeat';
      const text = playerWon
        ? `You won ${game.score.player} - ${game.score.cpu}.`
        : `CPU won ${game.score.cpu} - ${game.score.player}.`;
      setOverlay(summary, text, 'Play again');
    }
  }

  function updateDifficulty() {
    game.difficulty = chooseDifficulty(ui.difficultySelect.value);
    const config = DIFFICULTY[game.difficulty];
    game.cpu.speed = config.aiSpeed;
    game.ai.targetY = GAME_HEIGHT / 2;
    game.ai.reactionTimer = 0;
  }

  function resetPaddles() {
    game.player.y = GAME_HEIGHT / 2 - game.player.height / 2;
    game.cpu.y = GAME_HEIGHT / 2 - game.cpu.height / 2;
  }

  function prepareBall(direction = 1) {
    game.ball.x = GAME_WIDTH / 2;
    game.ball.y = GAME_HEIGHT / 2;
    game.ball.speed = 420;
    game.ball.maxSpeed = 980;

    const angle = (Math.random() * 1.2 - 0.6);
    const sign = direction >= 0 ? 1 : -1;
    game.ball.vx = sign * Math.cos(angle) * game.ball.speed;
    game.ball.vy = Math.sin(angle) * game.ball.speed;
  }

  function resetMatchState() {
    game.score.player = 0;
    game.score.cpu = 0;
    game.pendingGoal = false;
    resetPaddles();
    prepareBall(Math.random() < 0.5 ? 1 : -1);
    applyState('ready');
  }

  function beginMatch() {
    game.score.player = 0;
    game.score.cpu = 0;
    game.pendingGoal = false;
    resetPaddles();
    prepareBall(Math.random() < 0.5 ? 1 : -1);
    applyState('playing');
    playSfx('score');
  }

  function startOrResume() {
    if (game.state === 'ready' || game.state === 'match-over') {
      beginMatch();
      return;
    }

    if (game.state === 'paused') {
      applyState('playing');
      return;
    }

    if (game.state === 'point-transition') {
      prepareBall(game.score.player >= game.score.cpu ? 1 : -1);
      applyState('playing');
    }
  }

  function pauseOrResume() {
    if (game.state === 'playing') {
      applyState('paused');
      return;
    }

    if (game.state === 'paused') {
      applyState('playing');
    }
  }

  function updatePlayerPaddle(deltaSec) {
    const paddle = game.player;
    const moveUp = game.keyboard.up;
    const moveDown = game.keyboard.down;

    if (moveUp && !moveDown) {
      paddle.y -= paddle.speed * deltaSec;
    } else if (moveDown && !moveUp) {
      paddle.y += paddle.speed * deltaSec;
    }

    if (game.pointerActive) {
      paddle.y = game.pointerY - paddle.height / 2;
    }

    paddle.y = clamp(paddle.y, 0, GAME_HEIGHT - paddle.height);
  }

  function predictCpuTarget() {
    const ball = game.ball;
    const cpu = game.cpu;
    if (ball.vx <= 0) {
      return GAME_HEIGHT / 2;
    }

    const distanceUntilCpu = cpu.x - ball.x;
    if (distanceUntilCpu <= 0) {
      return ball.y;
    }

    const timeToReach = distanceUntilCpu / Math.max(Math.abs(ball.vx), 180);
    let predictedY = ball.y + ball.vy * timeToReach;
    let vy = ball.vy;

    for (let i = 0; i < 10; i += 1) {
      if (predictedY < 0) {
        predictedY = -predictedY;
        vy *= -1;
      }
      if (predictedY > GAME_HEIGHT) {
        predictedY = GAME_HEIGHT - (predictedY - GAME_HEIGHT);
        vy *= -1;
      }
    }

    return clamp(predictedY, 0, GAME_HEIGHT);
  }

  function updateComputerPaddle(deltaSec) {
    const config = DIFFICULTY[game.difficulty];
    const cpu = game.cpu;
    const target = predictCpuTarget();
    const center = cpu.y + cpu.height / 2;
    const adjustedTarget = target + (Math.random() - 0.5) * config.predictionError;
    game.ai.targetY = adjustedTarget;

    const delta = game.ai.targetY - center;
    const maxTravel = cpu.speed * deltaSec;
    const move = clamp(delta * 0.12, -maxTravel, maxTravel);
    cpu.y += move;
    cpu.y = clamp(cpu.y, 0, GAME_HEIGHT - cpu.height);
  }

  function playWallSound() {
    if (!game.audioEnabled || !game.audioReady || !game.audioCtx) {
      return;
    }
    const ctx = game.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(120, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  }

  function playPaddleSound() {
    if (!game.audioEnabled || !game.audioReady || !game.audioCtx) {
      return;
    }
    const ctx = game.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(160, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.09);
  }

  function playScoreSound() {
    if (!game.audioEnabled || !game.audioReady || !game.audioCtx) {
      return;
    }
    const ctx = game.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(240, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.25);
  }

  function playMatchEndSound() {
    if (!game.audioEnabled || !game.audioReady || !game.audioCtx) {
      return;
    }
    const ctx = game.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(220, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  function playSfx(type) {
    if (type === 'wall') playWallSound();
    if (type === 'paddle') playPaddleSound();
    if (type === 'score') playScoreSound();
    if (type === 'match-end') playMatchEndSound();
  }

  function initAudio() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      game.audioEnabled = false;
      ui.soundToggle.checked = false;
      return;
    }

    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!game.audioCtx) {
        game.audioCtx = new AudioCtor();
      }
      if (game.audioCtx.state === 'suspended') {
        game.audioCtx.resume().catch(() => {});
      }
      game.audioReady = true;
    } catch (error) {
      game.audioReady = false;
      game.audioEnabled = false;
    }
  }

  function maybeEnableAudio() {
    if (game.audioEnabled && !game.audioReady) {
      initAudio();
    }
  }

  function checkBallPaddleCollision(paddle, isPlayer) {
    const ball = game.ball;
    const paddleLeft = paddle.x;
    const paddleRight = paddle.x + paddle.width;
    const paddleTop = paddle.y;
    const paddleBottom = paddle.y + paddle.height;

    const overlapsX = ball.x + ball.radius >= paddleLeft && ball.x - ball.radius <= paddleRight;
    const overlapsY = ball.y + ball.radius >= paddleTop && ball.y - ball.radius <= paddleBottom;

    if (!overlapsX || !overlapsY) {
      return false;
    }

    const relativeHit = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    const maxBounce = DIFFICULTY[game.difficulty].maxBounceAngle;
    const angle = relativeHit * maxBounce;
    const direction = isPlayer ? 1 : -1;
    const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.05, 420, ball.maxSpeed);

    ball.vx = direction * Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.speed = speed;

    if (isPlayer) {
      ball.x = paddle.x + paddle.width + ball.radius + 1;
    } else {
      ball.x = paddle.x - ball.radius - 1;
    }

    playSfx('paddle');
    return true;
  }

  function handleGoal(who) {
    if (game.pendingGoal) {
      return;
    }

    game.pendingGoal = true;
    game.score[who] += 1;
    updateHud();
    playSfx('score');

    const finalTargetReached = game.score[who] >= game.winningScore;
    if (finalTargetReached) {
      const best = Math.max(game.bestScore, game.score.player);
      game.bestScore = best;
      safeStorageSet(best);
      updateBestScoreDisplay();
      applyState('match-over');
      playSfx('match-end');
      return;
    }

    const nextDirection = who === 'player' ? 1 : -1;
    setTimeout(() => {
      if (game.state === 'match-over') {
        return;
      }
      prepareBall(nextDirection);
      game.pendingGoal = false;
      applyState('point-transition');
    }, 700);
  }

  function updateBall(deltaSec) {
    const ball = game.ball;
    ball.x += ball.vx * deltaSec;
    ball.y += ball.vy * deltaSec;

    if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= GAME_HEIGHT) {
      ball.y = clamp(ball.y, ball.radius, GAME_HEIGHT - ball.radius);
      ball.vy *= -1;
      playSfx('wall');
    }

    if (ball.x - ball.radius <= 0) {
      handleGoal('cpu');
      return;
    }

    if (ball.x + ball.radius >= GAME_WIDTH) {
      handleGoal('player');
      return;
    }

    if (checkBallPaddleCollision(game.player, true)) {
      return;
    }

    if (checkBallPaddleCollision(game.cpu, false)) {
      return;
    }
  }

  function updateFrame(deltaMs) {
    const deltaSec = clamp(deltaMs / 1000, 0.016, 0.04);

    if (game.state !== 'playing') {
      return;
    }

    updatePlayerPaddle(deltaSec);
    updateComputerPaddle(deltaSec);
    updateBall(deltaSec);
  }

  function drawRoundedRect(ctx, x, y, width, height, radius, color) {
    ctx.save();
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
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function renderScene() {
    const ctx = game.ctx;
    const { ball } = game;

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = '#070d18';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.strokeStyle = 'rgba(100, 242, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    drawRoundedRect(ctx, game.player.x, game.player.y, game.player.width, game.player.height, 14, game.player.color);
    drawRoundedRect(ctx, game.cpu.x, game.cpu.y, game.cpu.width, game.cpu.height, 14, game.cpu.color);

    const glow = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.radius + 20);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.25, '#effbff');
    glow.addColorStop(0.75, '#73eeff');
    glow.addColorStop(1, 'rgba(115, 238, 255, 0.08)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius + 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ebfaff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(100, 242, 255, 0.16)';
    ctx.strokeRect(1, 1, GAME_WIDTH - 2, GAME_HEIGHT - 2);
  }

  function resizeCanvas() {
    const rect = ui.gameArea.getBoundingClientRect();
    const width = Math.max(320, rect.width || GAME_WIDTH);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    game.dpr = ratio;

    const displayWidth = width;
    const displayHeight = (GAME_HEIGHT / GAME_WIDTH) * displayWidth;

    ui.canvas.width = Math.round(GAME_WIDTH * ratio);
    ui.canvas.height = Math.round(GAME_HEIGHT * ratio);
    ui.canvas.style.width = `${displayWidth}px`;
    ui.canvas.style.height = `${displayHeight}px`;

    const ctx = ui.canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    game.ctx = ctx;
    game.canvas = ui.canvas;
  }

  function paintLoop(ts) {
    if (!game.lastTs) {
      game.lastTs = ts;
    }
    const delta = clamp(ts - game.lastTs, 16.67, 40);
    game.lastTs = ts;
    game.lastFrameMs = delta;

    updateFrame(delta);
    renderScene();
    game.animationFrame = requestAnimationFrame(paintLoop);
  }

  function bindEvents() {
    ui.startButton.addEventListener('click', () => {
      maybeEnableAudio();
      startOrResume();
    });

    ui.pauseButton.addEventListener('click', () => {
      maybeEnableAudio();
      pauseOrResume();
    });

    ui.restartButton.addEventListener('click', () => {
      maybeEnableAudio();
      beginMatch();
    });

    ui.newMatchButton.addEventListener('click', () => {
      maybeEnableAudio();
      resetMatchState();
    });

    ui.overlayAction.addEventListener('click', () => {
      maybeEnableAudio();
      startOrResume();
    });

    ui.difficultySelect.addEventListener('change', () => {
      updateDifficulty();
    });

    ui.soundToggle.addEventListener('change', () => {
      game.audioEnabled = ui.soundToggle.checked;
      if (game.audioEnabled) {
        initAudio();
      }
      ui.soundToggle.setAttribute('aria-label', game.audioEnabled ? 'Sound on' : 'Sound off');
    });

    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowup') {
        event.preventDefault();
        game.keyboard.up = true;
      }
      if (key === 'arrowdown') {
        event.preventDefault();
        game.keyboard.down = true;
      }
      if (key === ' ' || key === 'enter') {
        event.preventDefault();
        maybeEnableAudio();
        startOrResume();
      }
      if (key === 'escape') {
        event.preventDefault();
        pauseOrResume();
      }
    });

    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowup') {
        game.keyboard.up = false;
      }
      if (key === 'arrowdown') {
        game.keyboard.down = false;
      }
    });

    window.addEventListener('blur', () => {
      game.keyboard.up = false;
      game.keyboard.down = false;
      if (game.state === 'playing') {
        applyState('paused');
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === 'playing') {
        applyState('paused');
      }
    });

    const updatePointerY = (clientY) => {
      const rect = ui.gameArea.getBoundingClientRect();
      const y = clamp(clientY - rect.top, 0, rect.height);
      game.pointerY = (y / rect.height) * GAME_HEIGHT;
      game.pointerActive = true;
    };

    ui.gameArea.addEventListener('pointermove', (event) => {
      updatePointerY(event.clientY);
    });

    ui.gameArea.addEventListener('pointerdown', (event) => {
      updatePointerY(event.clientY);
      maybeEnableAudio();
      game.pointerActive = true;
      if (game.state === 'ready' || game.state === 'point-transition') {
        startOrResume();
      }
    });

    ui.gameArea.addEventListener('pointerleave', () => {
      game.pointerActive = false;
    });

    ui.gameArea.addEventListener('touchstart', (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      updatePointerY(touch.clientY);
      game.touchActive = true;
      event.preventDefault();
    }, { passive: false });

    ui.gameArea.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      updatePointerY(touch.clientY);
      event.preventDefault();
    }, { passive: false });

    ui.gameArea.addEventListener('touchend', () => {
      game.touchActive = false;
      game.pointerActive = false;
    });

    window.addEventListener('resize', resizeCanvas);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(ui.gameArea);
    }
  }

  function init() {
    game.bestScore = safeStorageGet();
    game.winningScore = WINNING_SCORE_DEFAULT;
    ui.soundToggle.checked = true;
    ui.soundToggle.setAttribute('aria-label', 'Sound on');
    game.audioEnabled = true;
    game.canvas = ui.canvas;
    resizeCanvas();
    updateDifficulty();
    updateBestScoreDisplay();
    updateHud();
    resetMatchState();
    bindEvents();
    game.lastTs = 0;
    requestAnimationFrame(paintLoop);
  }

  init();
})();
