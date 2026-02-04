const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // Allow all origins for simplicity in dev
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;
const SECRET_KEY = 'super_secret_chess_key';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database Setup (SQLite)
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

// Models
const User = sequelize.define('User', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    completedStages: { type: DataTypes.INTEGER, defaultValue: 0 },
    savedGame: { type: DataTypes.TEXT, allowNull: true } // JSON string of board state
});

// Sync DB
sequelize.sync().then(() => console.log('Database synced'));

// Socket.IO Game Logic
const activeGames = {}; // roomId -> { white: socketId, black: socketId, boardFen: string }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', ({ roomId, userId }) => {
        // Simple room logic: If room exists and has 1 player, join as Black. Else create/join as White.
        // In a real app, you'd match by ELO or specific challenges.

        let room = activeGames[roomId];

        if (!room) {
            // Create room
            room = { white: socket.id, black: null, fen: 'start' };
            activeGames[roomId] = room;
            socket.join(roomId);
            socket.emit('game_init', { color: 'white', fen: 'start' });
            console.log(`Room ${roomId} created by ${socket.id} (White)`);
        } else if (!room.black) {
            // Join as black
            room.black = socket.id;
            socket.join(roomId);
            socket.emit('game_init', { color: 'black', fen: room.fen });
            io.to(roomId).emit('game_start', { whiteId: room.white, blackId: room.black });
            console.log(`User ${socket.id} joined room ${roomId} as Black`);
        } else {
            socket.emit('error', 'Room is full');
        }
    });

    socket.on('make_move', ({ roomId, move, fen }) => {
        // Broadcast move to other player in the room
        socket.to(roomId).emit('opponent_move', { move, fen });
        if (activeGames[roomId]) {
            activeGames[roomId].fen = fen;
        }
    });

    socket.on('disconnect', () => {
        // Handle cleanup if needed
        console.log('User disconnected:', socket.id);
    });
});

// Routes
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashedPassword });

        const token = jwt.sign({ id: user.id }, SECRET_KEY);
        res.json({ token, user: { id: user.id, name: user.name, completedStages: user.completedStages } });
    } catch (err) {
        res.status(400).json({ message: 'User already exists or error creating account' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY);
        res.json({ token, user: { id: user.id, name: user.name, completedStages: user.completedStages } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/save-progress', async (req, res) => {
    // Middleware for auth would go here
    const { userId, level, boardState } = req.body;
    try {
        const user = await User.findByPk(userId);
        if (user) {
            if (level > user.completedStages) {
                user.completedStages = level;
            }
            if (boardState) {
                user.savedGame = JSON.stringify(boardState);
            }
            await user.save();
            res.json({ success: true, completedStages: user.completedStages });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
