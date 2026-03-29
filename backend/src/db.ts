import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected database pool error:', err);
  process.exit(-1);
});

export async function initDB() {
  const client = await pool.connect();
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        avatar_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_stats (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        total_games INT DEFAULT 0,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        total_correct_guesses INT DEFAULT 0,
        total_questions_asked INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY,
        host_id UUID NOT NULL REFERENCES users(id),
        game_type VARCHAR(50) DEFAULT 'guess_person',
        person_source VARCHAR(50) DEFAULT 'contacts',
        status VARCHAR(50) DEFAULT 'lobby',
        is_team_mode BOOLEAN DEFAULT FALSE,
        total_rounds INT DEFAULT 3,
        current_round INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        team_name VARCHAR(255),
        score INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_players (
        id UUID PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
        score INT DEFAULT 0,
        correct_guesses INT DEFAULT 0,
        total_turns INT DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_rounds (
        id UUID PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        game_type VARCHAR(50) DEFAULT 'guess_person',
        round_number INT NOT NULL,
        target_contact_name VARCHAR(255),
        guesser_user_id UUID NOT NULL REFERENCES users(id),
        is_guessed_correctly BOOLEAN DEFAULT FALSE,
        guessed_as_name VARCHAR(255),
        total_questions INT DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS questions (
        id UUID PRIMARY KEY,
        game_round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
        asker_user_id UUID NOT NULL REFERENCES users(id),
        question_text VARCHAR(500),
        answer BOOLEAN,
        question_number INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS mutual_contacts (
        id UUID PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        contact_name VARCHAR(255) NOT NULL,
        user_ids UUID[] NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facebook_accounts (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        facebook_user_id VARCHAR(255) UNIQUE NOT NULL,
        facebook_name VARCHAR(255),
        avatar_url TEXT,
        access_token TEXT,
        token_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facebook_app_friends (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_user_id)
      );

      CREATE TABLE IF NOT EXISTS number_rounds (
        game_round_id UUID PRIMARY KEY REFERENCES game_rounds(id) ON DELETE CASCADE,
        secret_number INT NOT NULL CHECK (secret_number BETWEEN 0 AND 10),
        max_questions INT DEFAULT 3,
        active_responder_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS number_round_clues (
        id UUID PRIMARY KEY,
        game_round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
        responder_user_id UUID NOT NULL REFERENCES users(id),
        prompt_text VARCHAR(255) NOT NULL,
        clue_text VARCHAR(500) NOT NULL,
        turn_order INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (game_round_id, turn_order)
      );

      ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(50) DEFAULT 'guess_person';
      ALTER TABLE games ADD COLUMN IF NOT EXISTS person_source VARCHAR(50) DEFAULT 'contacts';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
      ALTER TABLE games ADD COLUMN IF NOT EXISTS is_team_mode BOOLEAN DEFAULT FALSE;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS total_rounds INT DEFAULT 3;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 1;
      ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS game_type VARCHAR(50) DEFAULT 'guess_person';
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE CASCADE;
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_name VARCHAR(255);
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;
      ALTER TABLE game_players ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
      ALTER TABLE game_players ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;
      ALTER TABLE game_players ADD COLUMN IF NOT EXISTS correct_guesses INT DEFAULT 0;
      ALTER TABLE game_players ADD COLUMN IF NOT EXISTS total_turns INT DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
      CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
      CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players(user_id);
      CREATE INDEX IF NOT EXISTS idx_game_players_team_id ON game_players(team_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_game_players_unique_game_user ON game_players(game_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);
      CREATE INDEX IF NOT EXISTS idx_games_person_source ON games(person_source);
      CREATE INDEX IF NOT EXISTS idx_teams_game_id ON teams(game_id);
      CREATE INDEX IF NOT EXISTS idx_mutual_contacts_game_id ON mutual_contacts(game_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_accounts_facebook_user_id ON facebook_accounts(facebook_user_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_app_friends_user_id ON facebook_app_friends(user_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_app_friends_friend_user_id ON facebook_app_friends(friend_user_id);
      CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id ON game_rounds(game_id);
      CREATE INDEX IF NOT EXISTS idx_game_rounds_game_type ON game_rounds(game_type);
      CREATE INDEX IF NOT EXISTS idx_questions_round_id ON questions(game_round_id);
      CREATE INDEX IF NOT EXISTS idx_number_round_clues_round_id ON number_round_clues(game_round_id);

      CREATE TABLE IF NOT EXISTS custom_categories (
        id UUID PRIMARY KEY,
        prompt VARCHAR(255) NOT NULL,
        examples TEXT[] NOT NULL DEFAULT '{}',
        usage_count INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_categories_prompt ON custom_categories(LOWER(prompt));

      -- Allow same responder to submit multiple clues per round (3-slot model)
      ALTER TABLE number_round_clues DROP CONSTRAINT IF EXISTS number_round_clues_game_round_id_responder_user_id_key;
    `);
    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
