import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB, pool } from './db';
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

// Fetch custom categories contributed by players
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT prompt, examples FROM custom_categories ORDER BY usage_count DESC, created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching custom categories:', err);
    res.json([]);
  }
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
