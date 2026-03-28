import { pool } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface GameConfig {
  hostId: string;
  gameId: string;
  isTeamMode: boolean;
  totalRounds: number;
  playerIds: string[];
  teamAssignments?: { [key: string]: string }; // userId -> teamId
}

export class GameService {
  async createGame(hostId: string, config: Partial<GameConfig>) {
    const gameId = uuidv4();
    const query = `
      INSERT INTO games (id, host_id, is_team_mode, total_rounds, status)
      VALUES ($1, $2, $3, $4, 'lobby')
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      gameId,
      hostId,
      config.isTeamMode || false,
      config.totalRounds || 3,
    ]);
    
    return result.rows[0];
  }

  async startGame(gameId: string) {
    const query = `
      UPDATE games 
      SET status = 'active', started_at = CURRENT_TIMESTAMP, current_round = 1
      WHERE id = $1
      RETURNING *;
    `;
    
    const result = await pool.query(query, [gameId]);
    return result.rows[0];
  }

  async createTeams(gameId: string, teamAssignments: { [key: string]: string }) {
    await pool.query('DELETE FROM teams WHERE game_id = $1', [gameId]);

    const teamIdsByName: { [key: string]: string } = {};

    for (const teamName of new Set(Object.values(teamAssignments))) {
      const normalizedTeamName = teamName.trim();

      if (!normalizedTeamName) {
        continue;
      }

      const teamId = uuidv4();
      const teamQuery = `
        INSERT INTO teams (id, game_id, team_name)
        VALUES ($1, $2, $3)
        RETURNING id;
      `;
      await pool.query(teamQuery, [teamId, gameId, normalizedTeamName]);
      teamIdsByName[normalizedTeamName] = teamId;
    }

    for (const [userId, teamName] of Object.entries(teamAssignments)) {
      const normalizedTeamName = teamName.trim();
      const teamId = teamIdsByName[normalizedTeamName] || null;
      const assignQuery = `
        UPDATE game_players
        SET team_id = $1
        WHERE user_id = $2 AND game_id = $3;
      `;
      await pool.query(assignQuery, [teamId, userId, gameId]);
    }

    return teamIdsByName;
  }

  async startRound(gameId: string, targetContactName: string, guesserUserId: string) {
    const roundId = uuidv4();
    
    // Get current round number
    const gameQuery = `SELECT current_round FROM games WHERE id = $1;`;
    const gameResult = await pool.query(gameQuery, [gameId]);
    const roundNumber = gameResult.rows[0].current_round;
    
    const roundQuery = `
      INSERT INTO game_rounds (id, game_id, round_number, target_contact_name, guesser_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    
    const result = await pool.query(roundQuery, [
      roundId,
      gameId,
      roundNumber,
      targetContactName,
      guesserUserId,
    ]);

    await pool.query(
      `UPDATE games
       SET current_round = current_round + 1
       WHERE id = $1`,
      [gameId]
    );
    
    return result.rows[0];
  }

  async recordQuestion(
    roundId: string,
    askerUserId: string,
    questionNumber: number,
    questionText: string,
    answer: boolean
  ) {
    const questionId = uuidv4();
    const query = `
      INSERT INTO questions (id, game_round_id, asker_user_id, question_number, question_text, answer)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      questionId,
      roundId,
      askerUserId,
      questionNumber,
      questionText,
      answer,
    ]);
    
    // Update question count in game_rounds
    await pool.query(
      `UPDATE game_rounds SET total_questions = total_questions + 1 WHERE id = $1`,
      [roundId]
    );
    
    return result.rows[0];
  }

  async recordGuess(roundId: string, guessedName: string, isCorrect: boolean) {
    const query = `
      UPDATE game_rounds 
      SET is_guessed_correctly = $1, guessed_as_name = $2, ended_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
    `;
    
    const result = await pool.query(query, [isCorrect, guessedName, roundId]);
    return result.rows[0];
  }

  async updatePlayerStats(
    userId: string,
    didWin: boolean,
    correctGuesses: number,
    questionsAsked: number
  ) {
    const query = `
      INSERT INTO user_stats (id, user_id, total_games, wins, losses, total_correct_guesses, total_questions_asked)
      VALUES ($1, $2, 1, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        total_games = user_stats.total_games + 1,
        wins = user_stats.wins + $3,
        losses = user_stats.losses + $4,
        total_correct_guesses = user_stats.total_correct_guesses + $5,
        total_questions_asked = user_stats.total_questions_asked + $6,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      uuidv4(),
      userId,
      didWin ? 1 : 0,
      didWin ? 0 : 1,
      correctGuesses,
      questionsAsked,
    ]);
    
    return result.rows[0];
  }

  async getUserStats(userId: string) {
    const query = `
      SELECT 
        u.id, u.username, u.avatar_url,
        COALESCE(s.total_games, 0) as total_games,
        COALESCE(s.wins, 0) as wins,
        COALESCE(s.losses, 0) as losses,
        COALESCE(s.total_correct_guesses, 0) as total_correct_guesses,
        COALESCE(s.total_questions_asked, 0) as total_questions_asked,
        CASE WHEN s.total_games > 0 THEN (s.wins::FLOAT / s.total_games) ELSE 0 END as win_rate
      FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE u.id = $1;
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  async getGamePlayers(gameId: string) {
    const query = `
      SELECT gp.id, gp.user_id, u.username, u.avatar_url, gp.score, gp.team_id, t.team_name
      FROM game_players gp
      JOIN users u ON gp.user_id = u.id
      LEFT JOIN teams t ON gp.team_id = t.id
      WHERE gp.game_id = $1
      ORDER BY gp.joined_at;
    `;
    
    const result = await pool.query(query, [gameId]);
    return result.rows;
  }

  async endGame(gameId: string) {
    const query = `
      UPDATE games 
      SET status = 'finished', ended_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    
    const result = await pool.query(query, [gameId]);
    return result.rows[0];
  }
}

export const gameService = new GameService();
