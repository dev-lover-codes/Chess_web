const CONFIG = {
    serverUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3000/api'
};

/* --- State --- */
const state = {
    user: null,
    token: null,
    currentStage: 1,
    game: new Chess(), // chess.js instance
    boardEl: null,
    selectedSquare: null,
    orientation: 'white', // 'white' or 'black'
    mode: 'ai', // 'ai' or 'online'
    socket: null,
    roomId: null
};

/* --- Assets --- */
const PIECE_ASSETS = {
    'wP': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'wR': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'wN': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'wB': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'wQ': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'wK': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'bP': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'bR': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'bN': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'bB': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'bQ': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'bK': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

/* --- UI Elements --- */
const views = {
    authOverlay: document.getElementById('view-auth'),
    stageUI: document.getElementById('view-stages'),
    gameUI: document.getElementById('view-game'),
    loginForm: document.getElementById('login-form-container'),
    signupForm: document.getElementById('signup-form-container'),
    board: document.getElementById('chess-board')
};

/* --- Initialization --- */
function init() {
    setupAuthHandlers();
    checkLocalSession();

    // Safety Fallback: If auth view is active but hidden, force show it
    setTimeout(() => {
        const auth = document.getElementById('view-auth');
        if (auth.classList.contains('active')) {
            auth.classList.remove('hidden');
            auth.style.opacity = '1';
        }
    }, 100);
}

function checkLocalSession() {
    const savedToken = localStorage.getItem('chess_token');
    if (savedToken) {
        state.token = savedToken;
        const savedUser = JSON.parse(localStorage.getItem('chess_user'));
        if (savedUser) {
            loginUser(savedUser, savedToken, true);
        } else {
            navigateTo('view-auth');
        }
    } else {
        navigateTo('view-auth');
    }
}

/* --- Navigation Helpers --- */
function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.view-panel').forEach(v => {
        if (v.id !== viewId) {
            v.classList.remove('active');
            setTimeout(() => v.classList.add('hidden'), 500);
        }
    });

    // Show target
    const target = document.getElementById(viewId);
    if (!target) return;

    target.classList.remove('hidden');
    // Small delay to allow display:block to apply before opacity transition
    setTimeout(() => target.classList.add('active'), 50);

    // State updates
    if (viewId === 'view-stages') {
        renderStages();
        // Update profile info
        const name = state.user ? state.user.name : 'Guest';
        const el = document.getElementById('stages-username');
        if (el) el.innerText = name;
    }
}

/* --- Auth & Mode Handlers --- */
function setupAuthHandlers() {
    // Initial Load Logic handled by checkLocalSession()

    document.getElementById('switch-to-signup').addEventListener('click', (e) => {
        e.preventDefault();
        views.loginForm.classList.add('hidden');
        views.signupForm.classList.remove('hidden');
    });

    document.getElementById('switch-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        views.signupForm.classList.add('hidden');
        views.loginForm.classList.remove('hidden');
    });

    document.getElementById('guest-btn').addEventListener('click', () => {
        state.mode = 'ai';
        loginUser({ name: 'Guest', isGuest: true, completedStages: 0 }, null);
    });

    document.getElementById('online-btn').addEventListener('click', () => {
        state.mode = 'online';
        // Connect socket immediately for demo
        connectSocket();
        loginUser({ name: 'Online Player', isGuest: true, completedStages: 0 }, null);
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch(`${CONFIG.apiUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                state.mode = 'ai'; // Default to AI on login
                loginUser(data.user, data.token);
            } else {
                showToast(data.message || 'Login failed', 'error');
            }
        } catch (err) {
            console.warn('Server error');
            // If offline, default to guest
            state.mode = 'ai';
            loginUser({ name: 'Offline User', email, completedStages: 1 }, 'mock');
        }
    });

    // Stage Navigation
    document.getElementById('stages-logout-btn').addEventListener('click', logout);
    document.getElementById('back-to-stages-btn').addEventListener('click', () => {
        // Confirm if game in progress?
        navigateTo('view-stages');
    });

    // Game Controls
    document.getElementById('undo-btn').addEventListener('click', () => {
        if (state.mode === 'ai') {
            const history = state.game.history();
            if (history.length >= 2) {
                state.game.undo();
                state.game.undo();
                state.hintMove = null;
                state.historyHighlight = null;
                renderBoard();
                updateHistory();
            } else if (history.length === 1) {
                state.game.undo();
                state.hintMove = null;
                state.historyHighlight = null;
                renderBoard();
                updateHistory();
            }
        } else {
            showToast("Undo not available in online mode yet");
        }
    });

    document.getElementById('hint-btn').addEventListener('click', () => {
        if (state.game.game_over()) return;
        const moves = state.game.moves({ verbose: true });
        if (moves.length === 0) return;
        let bestMove = AI.getBestMove(state.game, state.currentStage) || moves[0]; // Use AI for hint
        state.hintMove = { from: bestMove.from, to: bestMove.to };
        state.historyHighlight = null;
        renderBoard();
        showToast("Hint: " + bestMove.san);
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        if (state.mode === 'ai') {
            startGame(state.currentStage); // Reloads game
        }
    });

    // Promotion Handlers
    document.querySelectorAll('.promo-option').forEach(option => {
        option.addEventListener('click', () => {
            const pieceType = option.dataset.piece;
            if (state.pendingMove) {
                const move = {
                    from: state.pendingMove.from,
                    to: state.pendingMove.to,
                    promotion: pieceType
                };

                // Hide modal
                document.getElementById('promotion-modal').classList.remove('active');
                setTimeout(() => document.getElementById('promotion-modal').classList.add('hidden'), 200);

                // Execute
                executeMove(move);
                state.pendingMove = null;
            }
        });
    });
}

function loginUser(user, token, skipSave) {
    state.user = user;
    state.token = token;
    if (!skipSave && !user.isGuest) {
        localStorage.setItem('chess_token', token);
        localStorage.setItem('chess_user', JSON.stringify(user));
    }
    navigateTo('view-stages');
}

function logout() {
    state.user = null;
    state.token = null;
    localStorage.removeItem('chess_token');
    localStorage.removeItem('chess_user');
    navigateTo('view-auth');
}

/* --- Online Logic --- */
function connectSocket() {
    state.socket = io(CONFIG.serverUrl);

    state.socket.on('connect', () => {
        console.log('Connected to server');
        showToast("Connected to Multiplayer Server!");
    });

    state.socket.on('connect_error', (err) => {
        console.error('Connection failed', err);
        showToast("Failed to connect. Is the server running?", "error");
    });

    state.socket.on('error', (msg) => {
        alert(msg);
    });

    state.socket.on('game_init', ({ color, fen }) => {
        state.orientation = color;
        state.game.load(fen === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : fen);
        renderBoard();
        showToast(`Game started! You are ${color}`);
    });

    state.socket.on('game_start', ({ whiteId, blackId }) => {
        showToast("Both players connected. Game ON!");
    });

    state.socket.on('opponent_move', ({ move, fen }) => {
        state.game.move(move);
        renderBoard();
        checkGameOver();
    });
}

function initOnlineGame() {
    const roomId = prompt("Enter Room ID to join or create (e.g. 'room1'):", "room1");
    if (!roomId) return;

    state.roomId = roomId;
    document.getElementById('ai-level').textContent = "Online Opponent";

    state.socket.emit('join_game', { roomId, userId: state.user.id || 'guest' });
}

/* --- Game Logic --- */
function startGame(level) {
    state.currentStage = level;
    state.game.reset();
    state.isGameOver = false;
    state.hintMove = null;
    state.historyHighlight = null;

    // Update UI
    document.getElementById('ai-level').innerText = state.mode === 'ai' ? `Level ${level}` : 'Online Opponent';
    document.getElementById('game-stage-indicator').innerText = `Stage ${level}`;
    document.getElementById('game-username').innerText = state.user ? state.user.name : "Guest";

    navigateTo('view-game');

    if (state.mode === 'online') {
        initOnlineGame();
    }

    setTimeout(() => {
        renderBoard();
        updateHistory();
    }, 100); // Allow view transition
}

function renderBoard() {
    const boardEl = views.board;
    boardEl.innerHTML = '';

    // Create Board 8x8
    const board = state.game.board(); // 8x8 array of { square, type, color } or null

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            // Adjust row/col based on orientation
            const actualR = state.orientation === 'white' ? r : 7 - r;
            const actualC = state.orientation === 'white' ? c : 7 - c;

            const squareDiv = document.createElement('div');
            squareDiv.classList.add('square');
            // Standard chess coloring
            const isLight = (actualR + actualC) % 2 === 0;
            squareDiv.classList.add(isLight ? 'light' : 'dark');

            // Files: a-h (0-7), Ranks: 8-1 (0-7 in array)
            const squareName = String.fromCharCode(97 + actualC) + (8 - actualR);
            squareDiv.dataset.square = squareName;

            // Highlight selected
            if (state.selectedSquare === squareName) {
                const highlight = document.createElement('div');
                highlight.className = 'highlight';
                highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
                squareDiv.appendChild(highlight);
            }

            // Highlight Hint
            if (state.hintMove) {
                if (state.hintMove.from === squareName) {
                    const hintSource = document.createElement('div');
                    hintSource.className = 'highlight-hint-source';
                    squareDiv.appendChild(hintSource);
                }
                if (state.hintMove.to === squareName) {
                    const hintTarget = document.createElement('div');
                    hintTarget.className = 'highlight-hint-target';
                    squareDiv.appendChild(hintTarget);
                }
            }

            // Highlight History
            if (state.historyHighlight) {
                if (state.historyHighlight.from === squareName || state.historyHighlight.to === squareName) {
                    const histHighlight = document.createElement('div');
                    histHighlight.className = 'highlight'; // reuse basic highlight or create new
                    histHighlight.style.backgroundColor = 'rgba(99, 102, 241, 0.5)'; // Indigo
                    squareDiv.appendChild(histHighlight);
                }
            }

            // Place Piece
            const piece = state.game.get(squareName);
            if (piece) {
                const pieceDiv = document.createElement('div');
                pieceDiv.classList.add('piece');
                const pieceCode = piece.color + piece.type.toUpperCase();
                pieceDiv.style.backgroundImage = `url('${PIECE_ASSETS[pieceCode]}')`;
                pieceDiv.style.backgroundSize = 'contain';
                squareDiv.appendChild(pieceDiv);
            }

            // Click Handler
            squareDiv.addEventListener('click', () => handleSquareClick(squareName));
            boardEl.appendChild(squareDiv);
        }
    }

    updateHistory();
}

function handleSquareClick(square) {
    // Clear hint on interaction
    if (state.hintMove) {
        state.hintMove = null;
        renderBoard(); // re-render to clear immediately
    }
    state.historyHighlight = null; // Clear history view

    // Prevent move if game over or not our turn in online mode
    if (state.game.game_over()) return;
    if (state.mode === 'online' && state.game.turn() !== state.orientation.charAt(0)) return;

    if (!state.selectedSquare) {
        // Select logic
        const piece = state.game.get(square);
        if (piece && piece.color === state.game.turn()) {
            state.selectedSquare = square;
            renderBoard();
            highlightLegalMoves(square);
        }
    } else {
        // Move logic
        // Check for promotion first
        // Simple check: is piece a pawn and is dest on 0 or 7?
        const piece = state.game.get(state.selectedSquare);
        const isPromotion =
            (piece.type === 'p') &&
            ((piece.color === 'w' && square.charAt(1) === '8') ||
                (piece.color === 'b' && square.charAt(1) === '1'));

        if (isPromotion) {
            // Show Modal and wait
            state.pendingMove = { from: state.selectedSquare, to: square };
            document.getElementById('promotion-modal').classList.remove('hidden');
            document.getElementById('promotion-modal').classList.add('active');
            return;
        }

        // Normal Move
        executeMove({
            from: state.selectedSquare,
            to: square,
            promotion: 'q' // default fallback
        });
    }
}

/* --- ANIMATION LOGIC --- */

function executeMove(moveObj) {
    // 1. Calculate Animation Coords
    const fromSquare = document.querySelector(`[data-square="${moveObj.from}"]`);
    const toSquare = document.querySelector(`[data-square="${moveObj.to}"]`);

    if (fromSquare && toSquare) {
        const pieceEl = fromSquare.querySelector('.piece');
        if (pieceEl) {
            // Create clone for animation
            const fromRect = fromSquare.getBoundingClientRect();
            const toRect = toSquare.getBoundingClientRect();

            const clone = pieceEl.cloneNode(true);
            clone.classList.add('piece-animating');
            clone.style.width = fromRect.width + 'px';
            clone.style.height = fromRect.height + 'px';
            clone.style.top = fromRect.top + 'px';
            clone.style.left = fromRect.left + 'px';

            document.body.appendChild(clone);

            // Hide original immediately
            pieceEl.style.opacity = '0';

            // Trigger Animation
            requestAnimationFrame(() => {
                clone.style.top = toRect.top + 'px';
                clone.style.left = toRect.left + 'px';
            });

            // Cleanup after animation
            setTimeout(() => {
                clone.remove();
                finalizeMove(moveObj);
            }, 300); // Match CSS transition time
            return;
        }
    }
    // Fallback if no UI element found
    finalizeMove(moveObj);
}

function finalizeMove(moveObj) {
    const moveResult = state.game.move(moveObj);
    if (moveResult) {
        if (moveResult.captured) SoundManager.capture();
        else SoundManager.move();

        state.selectedSquare = null;
        state.hintMove = null;
        renderBoard();
        updateHistory();
        checkGameOver();

        // AI specific handling
        if (!state.game.game_over() && state.mode === 'ai' && state.game.turn() === 'b') {
            setTimeout(makeAiMove, 500);
        } else if (!state.game.game_over() && state.mode === 'online') {
            // Send to server
            state.socket.emit('make_move', {
                roomId: state.roomId,
                move: moveObj,
                fen: state.game.fen()
            });
        }
    } else {
        // Invalid move, maybe selecting a different piece
        const piece = state.game.get(moveObj.to);
        if (piece && piece.color === state.game.turn()) {
            state.selectedSquare = moveObj.to;
            renderBoard();
            highlightLegalMoves(moveObj.to);
        } else {
            state.selectedSquare = null;
            renderBoard();
        }
    }
}


function highlightLegalMoves(square) {
    const moves = state.game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        // Find the square div
        // This requires finding div by data-square. 
        // We can do this cleaner if we cache square elements, but querySelector is fine for 64 elements.
        const el = document.querySelector(`[data-square="${move.to}"]`);
        if (el) {
            const indicator = document.createElement('div');
            indicator.className = 'highlight-capture'; // Reusing class or create new 'legal-indicator'
            if (!move.captured) {
                indicator.style.border = 'none';
                indicator.style.backgroundColor = 'rgba(20, 255, 20, 0.3)';
                indicator.style.width = '30%';
                indicator.style.height = '30%';
                indicator.style.borderRadius = '50%';
                indicator.style.margin = 'auto'; // Center it
            }
            el.appendChild(indicator);
        }
    });
}

function makeAiMove() {
    // Progressive AI Logic
    const bestMove = AI.getBestMove(state.game, state.currentStage);

    if (bestMove) {
        // Use executeMove to trigger animation
        executeMove(bestMove);
    }
}

function checkGameOver() {
    if (state.game.in_checkmate()) {
        const winner = state.game.turn() === 'w' ? 'Black' : 'White';
        showGameOverModal(winner + ' Wins!', 'Checkmate!', 'trophy');
    } else if (state.game.in_draw()) {
        if (state.game.in_stalemate()) {
            showGameOverModal('Draw', 'Stalemate!', 'handshake');
        } else if (state.game.in_threefold_repetition()) {
            showGameOverModal('Draw', 'Threefold Repetition', 'handshake');
        } else if (state.game.insufficient_material()) {
            showGameOverModal('Draw', 'Insufficient Material', 'handshake');
        } else {
            showGameOverModal('Draw', '50-Move Rule', 'handshake');
        }
    } else if (state.game.in_check()) {
        SoundManager.notify();
        // showToast('Check!');
    }
}

function showGameOverModal(title, message, icon = 'trophy') {
    // Determine win/loss for sound
    const isWin = title.includes('White') && state.orientation === 'white' ||
        title.includes('Black') && state.orientation === 'black' ||
        title.includes('You Win'); // AI mode
    // Approximate check, or just play a neutral end sound

    // In AI mode, state.orientation is always white for user
    const userWon = (state.orientation === 'white' && title.includes('White')) ||
        (state.orientation === 'black' && title.includes('Black'));

    SoundManager.gameOver(userWon);

    const modal = document.getElementById('game-over-modal');
    const titleEl = document.getElementById('game-over-title');
    const messageEl = document.getElementById('game-over-message');
    const iconEl = modal.querySelector('.game-over-icon i');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Change icon based on result
    iconEl.className = `fa-solid fa-${icon}`;

    modal.classList.remove('hidden');
    modal.classList.add('active');

    // Setup button handlers
    document.getElementById('restart-game-btn').onclick = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);

        if (state.mode === 'ai') {
            state.game.reset();
            state.hintMove = null;
            state.historyHighlight = null;
            renderBoard();
            updateHistory();
        }
    };

    document.getElementById('back-to-menu-btn').onclick = () => {
        location.reload(); // Simple way to go back to auth screen
    };
}

function updateHistory() {
    const history = state.game.history({ verbose: true }); // Need verbose for from/to
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    history.forEach((move, i) => {
        const li = document.createElement('li');
        // Simple notation e.g. "1. e4" vs "e4"
        // Move index isn't passed directly in simple array, so calculate turn number
        const turnNum = Math.floor(i / 2) + 1;
        const prefix = (i % 2 === 0) ? `${turnNum}. ` : ''; // only show number for white

        li.textContent = `${prefix}${move.san}`;
        if (state.historyHighlight && state.historyHighlight.from === move.from && state.historyHighlight.to === move.to) {
            li.classList.add('active-history');
        }

        li.addEventListener('click', () => {
            state.historyHighlight = { from: move.from, to: move.to };
            state.hintMove = null; // Clear hint if viewing history
            renderBoard();
        });

        list.appendChild(li);
    });
    // Scroll to bottom
    list.scrollTop = list.scrollHeight;
}

function renderStages() {
    const grid = document.getElementById('stages-grid');
    grid.innerHTML = ''; // Clear existing
    for (let i = 1; i <= 15; i++) {
        const card = document.createElement('div');
        const isLocked = i > (state.user?.completedStages || 0) + 1;
        card.className = `stage-card ${isLocked ? 'locked' : ''} ${i === state.currentStage ? 'active' : ''}`;

        const icon = i === 15 ? 'fa-chess-king' : 'fa-chess-pawn';
        card.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>Level ${i}</span>
        `;

        if (!isLocked) {
            card.addEventListener('click', () => {
                startGame(i);
            });
        }

        grid.appendChild(card);
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'glass-panel';
    toast.style.padding = '15px 25px';
    toast.style.marginBottom = '10px';
    toast.style.background = type === 'error' ? 'rgba(244, 63, 94, 0.9)' : 'rgba(30, 41, 59, 0.9)';
    toast.style.color = '#fff';
    toast.style.borderRadius = '8px';
    toast.style.animation = 'fadeIn 0.3s ease';
    toast.textContent = msg;

    container.appendChild(toast);

    // Add CSS for toast container absolute position
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '2000';

    setTimeout(() => {
        toast.remove();
    }, 3000);
}


// Start
init();

/* --- Sound Manager (Web Audio API) --- */
const SoundManager = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),

    playTone: function (freq, type, duration) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    move: function () {
        this.playTone(300, 'sine', 0.1);
    },

    capture: function () {
        this.playTone(150, 'triangle', 0.15);
        setTimeout(() => this.playTone(100, 'triangle', 0.2), 50);
    },

    notify: function () {
        this.playTone(500, 'sine', 0.2);
        setTimeout(() => this.playTone(800, 'sine', 0.4), 100);
    },

    gameOver: function (isWin) {
        if (isWin) {
            this.playTone(400, 'sine', 0.2);
            setTimeout(() => this.playTone(500, 'sine', 0.2), 200);
            setTimeout(() => this.playTone(600, 'sine', 0.4), 400);
        } else {
            this.playTone(300, 'sawtooth', 0.3);
            setTimeout(() => this.playTone(200, 'sawtooth', 0.3), 300);
            setTimeout(() => this.playTone(150, 'sawtooth', 0.6), 600);
        }
    }
};
