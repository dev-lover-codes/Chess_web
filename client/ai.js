/* Simple JS Chess AI Engine for Progressive Difficulty */

const AI = {
    // Stage configurations
    STAGES: {
        1: { depth: 1, randomness: 1.0 }, // Totally random
        2: { depth: 1, randomness: 0.5 }, // Mostly random
        3: { depth: 1, randomness: 0.2 }, // Slightly random
        4: { depth: 1, randomness: 0.0, strategy: 'greedy' }, // Captures
        5: { depth: 2, randomness: 0.1, strategy: 'aggressive' },
        6: { depth: 2, randomness: 0.0 },
        7: { depth: 2, randomness: 0.0, eval: 'positional' },
        8: { depth: 3, randomness: 0.0 },
        9: { depth: 3, randomness: 0.0, eval: 'mixed' },
        10: { depth: 3, randomness: 0.0, eval: 'strong' }, // Alpha-beta starts kicking in naturally with depth
        15: { depth: 4, randomness: 0.0 } // Boss
    },

    // Piece values for evaluation
    PIECE_VALUES: {
        'p': 10,
        'n': 32,
        'b': 33,
        'r': 50,
        'q': 90,
        'k': 2000
    },

    // Simplified Piece-Square Tables (Mid-game)
    PST: {
        'p': [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 2, 3, 3, 2, 1, 1],
            [0, 0, 0, 2, 2, 0, 0, 0],
            [0, 0, 0, 1, 1, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0],
            [5, 5, 10, -10, -10, 10, 5, 5],
            [0, 0, 0, 0, 0, 0, 0, 0]
        ],
        'n': [
            [-5, -4, -3, -3, -3, -3, -4, -5],
            [-4, -2, 0, 0, 0, 0, -2, -4],
            [-3, 0, 1, 1, 1, 1, 0, -3],
            [-3, 0, 1, 2, 2, 1, 0, -3],
            [-3, 0, 1, 2, 2, 1, 0, -3],
            [-3, 0, 1, 1, 1, 1, 0, -3],
            [-4, -2, 0, 0, 0, 0, -2, -4],
            [-5, -4, -3, -3, -3, -3, -4, -5]
        ]
        // (Simplified: keeping it light)
    },

    getBestMove: function (game, stageLevel) {
        const config = this.STAGES[Math.min(stageLevel, 15)] || this.STAGES[15];
        const possibleMoves = game.moves({ verbose: true });

        if (possibleMoves.length === 0) return null;

        // Randomness check for low levels
        if (Math.random() < config.randomness) {
            return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }

        // Greedy / Beginner logic
        if (config.strategy === 'greedy') {
            // Prioritize captures
            const safeMoves = possibleMoves.sort((a, b) => {
                const valA = (a.captured ? this.PIECE_VALUES[a.captured] : 0);
                const valB = (b.captured ? this.PIECE_VALUES[b.captured] : 0);
                return valB - valA;
            });
            return safeMoves[0];
        }

        // Minimax / Alpha-Beta
        let bestMove = null;
        let bestValue = -Infinity;
        const alpha = -Infinity;
        const beta = Infinity;
        const color = game.turn() === 'w' ? 1 : -1;

        // Shuffle moves to add variety to openings
        possibleMoves.sort(() => Math.random() - 0.5);

        for (let move of possibleMoves) {
            game.move(move);
            const value = -this.minimax(game, config.depth - 1, -beta, -alpha, -color);
            game.undo();

            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }

        return bestMove || possibleMoves[0];
    },

    minimax: function (game, depth, alpha, beta, color) {
        if (depth === 0 || game.game_over()) {
            return this.evaluate(game) * color;
        }

        const moves = game.moves();
        if (moves.length === 0) return this.evaluate(game) * color;

        let max = -Infinity;

        for (let i = 0; i < moves.length; i++) {
            game.move(moves[i]);
            const score = -this.minimax(game, depth - 1, -beta, -alpha, -color);
            game.undo();

            if (score > max) {
                max = score;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                break; // Beta Cutoff
            }
        }
        return max;
    },

    evaluate: function (game) {
        let total = 0;
        const board = game.board();

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const val = this.PIECE_VALUES[piece.type];
                    // Position bonus (simplified)
                    const pstBonus = (this.PST[piece.type] && this.PST[piece.type][r][c]) || 0;
                    const score = val + (pstBonus * 0.1);

                    total += piece.color === 'w' ? score : -score;
                }
            }
        }
        return total;
    }
};
