import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './db';
import { setupSocketHandlers } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database
initDB().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, () => {
  console.log(`🎮 GuessThePerson server running on port ${PORT}`);
});
