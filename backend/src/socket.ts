import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db';
import { gameService } from './gameService';

type ContactInput = {
  name?: string;
  displayName?: string;
  phone?: string;
  phones?: Array<{ number?: string }>;
  email?: string;
  emails?: Array<{ address?: string }>;
};

type CurrentUser = {
  id: string;
  username: string;
};

const connectedUsersByGame = new Map<string, Set<string>>();

function getGameRoom(gameId: string) {
  return `game-${gameId}`;
}

function markUserPresence(gameId: string, userId: string, isConnected: boolean) {
  const connectedUsers = connectedUsersByGame.get(gameId) || new Set<string>();

  if (isConnected) {
    connectedUsers.add(userId);
    connectedUsersByGame.set(gameId, connectedUsers);
    return;
  }

  connectedUsers.delete(userId);

  if (connectedUsers.size === 0) {
    connectedUsersByGame.delete(gameId);
    return;
  }

  connectedUsersByGame.set(gameId, connectedUsers);
}

function getPrimaryPhone(contact: ContactInput) {
  return contact.phone || contact.phones?.find((item) => item.number)?.number || null;
}

function getPrimaryEmail(contact: ContactInput) {
  return contact.email || contact.emails?.find((item) => item.address)?.address || null;
}

function getContactName(contact: ContactInput) {
  return (contact.name || contact.displayName || '').trim();
}

async function emitLobbyState(io: Server, gameId: string) {
  const gameQuery = `
    SELECT id, host_id, is_team_mode, total_rounds, status
    FROM games
    WHERE id = $1
  `;
  const playersQuery = `
    SELECT gp.user_id, gp.score, gp.team_id, u.username, u.avatar_url, t.team_name
    FROM game_players gp
    JOIN users u ON gp.user_id = u.id
    LEFT JOIN teams t ON gp.team_id = t.id
    WHERE gp.game_id = $1
    ORDER BY gp.joined_at
  `;

  const [gameResult, playersResult] = await Promise.all([
    pool.query(gameQuery, [gameId]),
    pool.query(playersQuery, [gameId]),
  ]);

  const game = gameResult.rows[0];

  if (!game) {
    return;
  }

  const connectedUsers = connectedUsersByGame.get(gameId) || new Set<string>();
  const players = playersResult.rows.map((player) => ({
    ...player,
    isHost: player.user_id === game.host_id,
    connected: connectedUsers.has(player.user_id),
  }));

  io.to(getGameRoom(gameId)).emit('lobby-updated', {
    gameId: game.id,
    hostId: game.host_id,
    isTeamMode: game.is_team_mode,
    totalRounds: game.total_rounds,
    status: game.status,
    players,
  });
}

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Store user data on socket
    let currentUser: CurrentUser | null = null;
    let currentGameId: string | null = null;

    async function upsertUser(username: string) {
      const requestedUserId = uuidv4();
      const userQuery = `
        INSERT INTO users (id, username)
        VALUES ($1, $2)
        ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
        RETURNING id, username;
      `;
      const userResult = await pool.query(userQuery, [requestedUserId, username.trim()]);
      return userResult.rows[0] as CurrentUser;
    }

    async function replaceContacts(userId: string, contacts: ContactInput[]) {
      await pool.query('DELETE FROM contacts WHERE user_id = $1', [userId]);

      for (const contact of contacts) {
        const contactName = getContactName(contact);

        if (!contactName) {
          continue;
        }

        await pool.query(
          `INSERT INTO contacts (id, user_id, name, phone, email)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), userId, contactName, getPrimaryPhone(contact), getPrimaryEmail(contact)]
        );
      }
    }

    async function joinLobby(gameId: string) {
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const gameResult = await pool.query(
        'SELECT id, host_id, is_team_mode, total_rounds, status FROM games WHERE id = $1',
        [gameId]
      );
      const game = gameResult.rows[0];

      if (!game) {
        throw new Error('Game not found');
      }

      currentGameId = gameId;
      socket.join(getGameRoom(gameId));
      markUserPresence(gameId, currentUser.id, true);

      await pool.query(
        `INSERT INTO game_players (id, game_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (game_id, user_id) DO NOTHING`,
        [uuidv4(), gameId, currentUser.id]
      );

      socket.emit('lobby-joined', {
        gameId: game.id,
        hostId: game.host_id,
        isTeamMode: game.is_team_mode,
        totalRounds: game.total_rounds,
        status: game.status,
      });

      await emitLobbyState(io, gameId);
    }

    // User joins/creates game lobby
    socket.on('join-game', async (data: { username: string; contacts: ContactInput[]; gameId?: string }) => {
      try {
        if (!data.username?.trim()) {
          throw new Error('Username is required');
        }

        currentUser = await upsertUser(data.username);
        socket.join(currentUser.id);
        await replaceContacts(currentUser.id, data.contacts || []);

        socket.emit('user-created', { userId: currentUser.id, username: currentUser.username });

        if (data.gameId) {
          await joinLobby(data.gameId);
        }
      } catch (err) {
        console.error('Error in join-game:', err);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    socket.on('join-lobby', async (data: { gameId: string }) => {
      try {
        await joinLobby(data.gameId);
      } catch (err) {
        console.error('Error in join-lobby:', err);
        socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to join lobby' });
      }
    });

    socket.on('request-lobby-state', async (data: { gameId: string }) => {
      try {
        await emitLobbyState(io, data.gameId);
      } catch (err) {
        console.error('Error in request-lobby-state:', err);
        socket.emit('error', { message: 'Failed to load lobby state' });
      }
    });

    // Host creates game
    socket.on('create-game', async (data: { isTeamMode: boolean; totalRounds: number; playerIds?: string[] }) => {
      try {
        if (!currentUser) throw new Error('User not authenticated');

        const game = await gameService.createGame(currentUser.id, {
          isTeamMode: data.isTeamMode,
          totalRounds: data.totalRounds,
          playerIds: data.playerIds || [currentUser.id],
        });

        currentGameId = game.id;
        socket.join(getGameRoom(game.id));
        markUserPresence(game.id, currentUser.id, true);

        const playerIds = Array.from(new Set([currentUser.id, ...(data.playerIds || [])]));

        for (const playerId of playerIds) {
          await pool.query(
            `INSERT INTO game_players (id, game_id, user_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (game_id, user_id) DO NOTHING`,
            [uuidv4(), game.id, playerId]
          );
        }

        socket.emit('game-created', {
          gameId: game.id,
          hostId: currentUser.id,
          isTeamMode: data.isTeamMode,
        });

        await emitLobbyState(io, game.id);
      } catch (err) {
        console.error('Error in create-game:', err);
        socket.emit('error', { message: 'Failed to create game' });
      }
    });

    // Start game
    socket.on('start-game', async (data: { gameId: string; teamAssignments?: { [key: string]: string } }) => {
      try {
        if (!currentUser) throw new Error('User not authenticated');

        const gameResult = await pool.query('SELECT host_id FROM games WHERE id = $1', [data.gameId]);
        const gameRow = gameResult.rows[0];

        if (!gameRow) {
          throw new Error('Game not found');
        }

        if (gameRow.host_id !== currentUser.id) {
          throw new Error('Only the host can start the game');
        }

        const game = await gameService.startGame(data.gameId);
        currentGameId = data.gameId;

        // If team mode, create teams
        if (game.is_team_mode && data.teamAssignments) {
          await gameService.createTeams(data.gameId, data.teamAssignments);
        }

        // Find mutual contacts
        const players = await gameService.getGamePlayers(data.gameId);
        const playerIds = players.map((p) => p.user_id);

        const query = `
          SELECT name, array_agg(DISTINCT user_id) as users
          FROM contacts
          WHERE user_id = ANY($1)
          GROUP BY name
          HAVING COUNT(DISTINCT user_id) > 1
          ORDER BY RANDOM()
          LIMIT 10
        `;

        const result = await pool.query(query, [playerIds]);
        const mutualContacts = result.rows;

        io.to(getGameRoom(data.gameId)).emit('game-started', {
          gameId: data.gameId,
          mutualContacts,
          players,
          isTeamMode: game.is_team_mode,
        });
      } catch (err) {
        console.error('Error in start-game:', err);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // Start round
    socket.on('start-round', async (data: { gameId: string; targetContact: string; guesserUserId: string }) => {
      try {
        const round = await gameService.startRound(
          data.gameId,
          data.targetContact,
          data.guesserUserId
        );

        io.in(getGameRoom(data.gameId)).socketsJoin(`round-${round.id}`);

        // Get guesser info without revealing target name
        const guesserQuery = `SELECT username FROM users WHERE id = $1`;
        const guesserResult = await pool.query(guesserQuery, [data.guesserUserId]);
        const guesserName = guesserResult.rows[0].username;

        io.to(`game-${data.gameId}`).emit('round-started', {
          roundId: round.id,
          guesserUserId: data.guesserUserId,
          guesserName,
          roundNumber: round.round_number,
          // Only send target name to the person guessing
        });

        // Send target name only to the guesser
        io.to(data.guesserUserId).emit('your-target', {
          targetName: data.targetContact,
          roundId: round.id,
        });
      } catch (err) {
        console.error('Error in start-round:', err);
        socket.emit('error', { message: 'Failed to start round' });
      }
    });

    // Record question
    socket.on('ask-question', async (data: { roundId: string; questionNumber: number; questionText: string; answer: boolean }) => {
      try {
        if (!currentUser) throw new Error('User not authenticated');

        await gameService.recordQuestion(
          data.roundId,
          currentUser.id,
          data.questionNumber,
          data.questionText,
          data.answer
        );

        const roomId = `round-${data.roundId}`;
        io.to(roomId).emit('question-answered', {
          questionNumber: data.questionNumber,
          questionText: data.questionText,
          answer: data.answer,
          askerUsername: currentUser.username,
        });
      } catch (err) {
        console.error('Error in ask-question:', err);
        socket.emit('error', { message: 'Failed to record question' });
      }
    });

    // Player makes guess
    socket.on('make-guess', async (data: { roundId: string; guess: string; gameId: string }) => {
      try {
        if (!currentUser) throw new Error('User not authenticated');

        // Get the target contact name
        const roundQuery = `SELECT target_contact_name, guesser_user_id FROM game_rounds WHERE id = $1`;
        const roundResult = await pool.query(roundQuery, [data.roundId]);
        const roundData = roundResult.rows[0];

        const isCorrect = data.guess.toLowerCase().trim() === roundData.target_contact_name.toLowerCase().trim();

        await gameService.recordGuess(data.roundId, data.guess, isCorrect);

        io.to(getGameRoom(data.gameId)).emit('guess-result', {
          isCorrect,
          guessedName: data.guess,
          targetName: roundData.target_contact_name,
          guesserUsername: currentUser.username,
          roundId: data.roundId,
        });

        // Update player stats
        if (isCorrect) {
          await pool.query(
            `UPDATE game_players SET correct_guesses = correct_guesses + 1, score = score + 1 
             WHERE user_id = $1 AND game_id = $2`,
            [currentUser.id, data.gameId]
          );
        }
      } catch (err) {
        console.error('Error in make-guess:', err);
        socket.emit('error', { message: 'Failed to record guess' });
      }
    });

    // Get player stats
    socket.on('get-player-stats', async (data: { userId: string }) => {
      try {
        const stats = await gameService.getUserStats(data.userId);
        socket.emit('player-stats', stats);
      } catch (err) {
        console.error('Error getting player stats:', err);
        socket.emit('error', { message: 'Failed to get player stats' });
      }
    });

    // End game
    socket.on('end-game', async (data: { gameId: string }) => {
      try {
        const endedGame = await gameService.endGame(data.gameId);

        // Get final stats
        const players = await gameService.getGamePlayers(data.gameId);

        io.to(getGameRoom(data.gameId)).emit('game-ended', {
          gameId: data.gameId,
          finalScores: players,
        });
      } catch (err) {
        console.error('Error ending game:', err);
        socket.emit('error', { message: 'Failed to end game' });
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);

      if (currentGameId && currentUser) {
        markUserPresence(currentGameId, currentUser.id, false);

        try {
          await emitLobbyState(io, currentGameId);
        } catch (err) {
          console.error('Error broadcasting disconnect state:', err);
        }
      }
    });
  });
}
