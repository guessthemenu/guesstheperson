# GuessThePerson 

A multiplayer **Guess Who** style game where players use their phone contacts to guess mutual connections with a series of yes/no questions

## Features

- 📱 **Native Contact Import** - Access phone contacts on iOS/Android
- 🎮 **Real-time Multiplayer** - Play with friends 
- 📍 **Mutual Contacts Only** - Game database created from common contacts
- ⏱️ **Question Counter** - Track questions asked with a visual timer
- 👥 **Team Mode** - Play with teammates, combined scores
- 🆔 **Player Profiles** - View and manage player statistics
- 📊 **Game Statistics** - Track wins, losses, accuracy rates, and more
- 👁️ **Name Blur** - Hide player names during guessing round
- 🔗 **Easy Sharing** - QR codes and links to invite friends
- 🌐 **Cross-Platform** - Works on iOS, Android, and Web

## Tech Stack

- **Frontend:** React + Capacitor (iOS/Android + Web)
- **Backend:** Node.js + Express + Socket.io
- **Database:** PostgreSQL
- **Language:** TypeScript

## Project Structure

```
guesstheperson/
├── backend/              # Express server + Socket.io
│   ├── src/
│   │   ├── index.ts     # Server entry point
│   │   ├── db.ts        # PostgreSQL setup
│   │   └── socket.ts    # Socket.io event handlers
│   ├── package.json
│   └── tsconfig.json
├── frontend/             # React + Capacitor app
│   ├── public/
│   ├── src/
│   │   ├── App.tsx      # Main app component
│   │   └── index.tsx    # React entry point
│   ├── capacitor.config.ts
│   ├── package.json
│   └── tsconfig.json
├── shared/              # Shared types (future)
└── package.json         # Monorepo config
```

## Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL (for production; can use local instance)
- Xcode (for iOS development)
- Android Studio (for Android development)
- Capacitor CLI: `npm install -g @capacitor/cli`

## Installation

1. **Clone or setup the project**
   ```bash
   cd guesstheperson
   npm install
   ```

2. **Set up environment variables**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Edit backend/.env with your database credentials
   
   # Frontend
   cp frontend/.env.example frontend/.env
   # Edit frontend/.env with your API URL
   ```

3. **Set up PostgreSQL**
   ```bash
   # Create database
   createdb guesstheperson
   
   # The backend will auto-create tables on startup
   ```

## Development

### Run Both Backend and Frontend
```bash
npm run dev
```

### Run Backend Only
```bash
npm run backend:dev
# Server starts on http://localhost:3000
```

### Run Frontend Only (Web)
```bash
npm run frontend:dev
# App starts on http://localhost:3001
```

### Run on iOS
```bash
cd frontend
npm install
npx cap add ios
npm run cap:build:ios
```

### Run on Android
```bash
cd frontend
npm install
npx cap add android
npm run cap:build:android
```

## Collaboration

- Local git repository has been initialized for this project.
- Commit stable changes to `main`.
- Create feature branches from `creative/<feature-name>`.
- CI is configured in `.github/workflows/ci.yml` to build backend and frontend on pushes and pull requests.

### Publish To GitHub
```bash
git add .
git commit -m "Initial GuessThePerson setup"
git remote add origin <your-github-repo-url>
git push -u origin main
git checkout -b creative/lobby-ui
git push -u origin creative/lobby-ui
```

If you prefer GitHub CLI, create the remote after installing and authenticating `gh`, then push `main` and any `creative/*` branches.

## Production Deployment

- `render.yaml` is included for a Render backend + static frontend deployment.
- Deployment steps and native build prerequisites are documented in `DEPLOYMENT.md`.
- Set production values for `DB_*`, `CORS_ORIGIN`, and `REACT_APP_API_URL` before deploying.

## Game Flow

1. **Contact Import** - Player opens app, imports phone contacts
2. **Create/Join Game** - via QR code or game link
3. **Select Players** - Choose 3+ friends to play with
4. **Team Assignment** (optional) - Assign players to teams for team mode
5. **Mutual Contacts Database** - Server identifies common contacts (hidden from players)
6. **Game Loop** (per round):
   - Guesser receives random contact name (others don't see it - Name Blur feature)
   - Others ask yes/no questions while Question Counter tracks progress
   - 2-minute timer per round with visual countdown
   - Each question is recorded and displayed to all players
   - Correct guess = 1 point (team or individual)
   - Rotate through players/teams
7. **Player Profiles** - View detailed statistics during and after game
8. **Game Statistics** - Final scores, accuracy rates, win/loss records
9. **Game End** - After agreed number of rounds, display final leaderboard

## API Endpoints

### HTTP
- `GET /api/health` - Server health check

### Socket.io Events

**Client → Server:**
- `join-game` - Player joins with username and contacts
- `create-game` - Host creates a new game (isTeamMode, totalRounds, playerIds)
- `start-game` - Host starts the game (gameId, teamAssignments)
- `start-round` - Start a new round with a target contact (gameId, targetContact, guesserUserId)
- `ask-question` - Ask a yes/no question (roundId, questionNumber, questionText, answer)
- `make-guess` - Player submits their guess (roundId, guess, gameId)
- `get-player-stats` - Request player statistics (userId)
- `end-game` - Host ends the game (gameId)

**Server → Client:**
- `user-created` - Confirmation of user creation (userId, username)
- `game-created` - Game successfully created (gameId, hostId, isTeamMode)
- `player-joined` - New player joined (username)
- `game-started` - Game started with players and mutual contacts (gameId, mutualContacts, players, isTeamMode)
- `round-started` - New round started (roundId, guesserUserId, guesserName, roundNumber)
- `your-target` - Target name sent to guesser only (targetName, roundId)
- `question-answered` - A question was answered (questionNumber, questionText, answer, askerUsername)
- `guess-result` - Result of guess (isCorrect, guessedName, targetName, guesserUsername, roundId)
- `player-stats` - Player statistics (id, username, avatar_url, total_games, wins, losses, total_correct_guesses, total_questions_asked, win_rate)
- `game-ended` - Game finished (gameId, finalScores)
- `error` - Error occurred (message)

## Environment Variables

### Backend (.env)
```
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=guesstheperson
DB_PASSWORD=password
DB_NAME=guesstheperson
CORS_ORIGIN=http://localhost:3001
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_ENVIRONMENT=development
```

## Database Schema

### Users Table
- `id` (UUID) - Primary key
- `username` (VARCHAR) - Unique username
- `avatar_url` (VARCHAR) - Optional profile picture URL
- `created_at` (TIMESTAMP)

### User Stats Table
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to users (unique)
- `total_games` (INT) - Total games played
- `wins` (INT) - Total wins
- `losses` (INT) - Total losses
- `total_correct_guesses` (INT) - Correct guesses made
- `total_questions_asked` (INT) - Questions asked
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Contacts Table
- `id` (UUID)
- `user_id` (UUID) - Foreign key to users
- `name` (VARCHAR)
- `phone` (VARCHAR)
- `email` (VARCHAR)
- `created_at` (TIMESTAMP)

### Games Table
- `id` (UUID)
- `host_id` (UUID) - Foreign key to users
- `status` (VARCHAR) - lobby, active, finished
- `is_team_mode` (BOOLEAN) - Whether game uses teams
- `total_rounds` (INT) - Total rounds planned
- `current_round` (INT) - Current round number
- `created_at`, `started_at`, `ended_at` (TIMESTAMP)

### Teams Table (for team mode)
- `id` (UUID)
- `game_id` (UUID) - Foreign key to games
- `team_name` (VARCHAR)
- `score` (INT) - Team score
- `created_at` (TIMESTAMP)

### Game Players Table
- `id` (UUID)
- `game_id` (UUID) - Foreign key to games
- `user_id` (UUID) - Foreign key to users
- `team_id` (UUID) - Foreign key to teams (optional, for team mode)
- `score` (INT) - Individual score
- `correct_guesses` (INT) - Correct guesses made
- `total_turns` (INT) - Total turns as guesser
- `joined_at` (TIMESTAMP)

### Game Rounds Table
- `id` (UUID)
- `game_id` (UUID) - Foreign key to games
- `round_number` (INT)
- `target_contact_name` (VARCHAR) - The person to guess
- `guesser_user_id` (UUID) - Foreign key to users (whose turn)
- `is_guessed_correctly` (BOOLEAN)
- `guessed_as_name` (VARCHAR) - What they guessed
- `total_questions` (INT) - Questions asked this round
- `started_at`, `ended_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)

### Questions Table
- `id` (UUID)
- `game_round_id` (UUID) - Foreign key to game_rounds
- `asker_user_id` (UUID) - Foreign key to users (who asked)
- `question_text` (VARCHAR)
- `answer` (BOOLEAN) - Yes/No answer
- `question_number` (INT) - Which question this is
- `created_at` (TIMESTAMP)

### Mutual Contacts Table
- `id` (UUID)
- `game_id` (UUID) - Foreign key to games
- `contact_name` (VARCHAR)
- `user_ids` (UUID[]) - Array of user IDs who have this contact
- `created_at` (TIMESTAMP)

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT

---

**Happy guessing! 🎉**
