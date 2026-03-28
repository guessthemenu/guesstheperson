# GuessThePerson - Implementation Guide

## ✅ Completed Features

### 0. **Lobby, Invites, And Production Readiness**
- **Frontend:** `frontend/src/App.tsx`
  - Socket.io-backed create/join lobby flow
  - QR code generation for invite links
  - Native share sheet and clipboard link sharing
  - Team selection UI for hosts before match start
- **Backend:** `backend/src/socket.ts`
  - Shareable lobby join flow
  - Lobby state broadcasts with connected presence
  - Host-only game start guard
- **Repo:**
  - Local git repository initialized
  - CI workflow added in `.github/workflows/ci.yml`
  - Deployment blueprint added in `render.yaml`
  - Collaboration guide added in `CONTRIBUTING.md`

### 1. **Question Counter & Timer**
- **Location:** `frontend/src/QuestionCounter.tsx`
- **Features:**
  - Visual timer with countdown animation
  - Question counter that increments
  - Color-coded timer (green → yellow → red)
  - Responsive circular progress display
- **Integration:** Emit `ask-question` events to Socket.io
- **Hook:** `onTimeUp` callback when 2 minutes expires

### 2. **Team Mode**
- **Database:**
  - `teams` table - stores team info and combined scores
  - `game_players.team_id` - links players to teams
  - `games.is_team_mode` - flag for team/individual mode
- **Backend Logic:** `gameService.createTeams()`
- **Frontend:** `TeamDisplay.tsx` component shows team cards with members
- **Socket Events:**
  - `create-game` accepts `isTeamMode` flag
  - `start-game` accepts `teamAssignments` (userId → teamId mapping)

### 3. **Player Profiles & Statistics**
- **Database:**
  - `user_stats` table - stores all player statistics
  - Fields: total_games, wins, losses, correct_guesses, accuracy
- **Frontend Component:** `PlayerProfile.tsx`
  - Shows avatar, username, win rate, game stats
  - Displays in full stats mode or compact quick-stats mode
  - "You" badge for current player
- **Backend:** `gameService.getUserStats()` retrieves stats
- **Socket Event:** `get-player-stats` returns player statistics

### 4. **Name Blur**
- **Feature:** Player names hidden during guessing rounds (shown as "???")
- **Implementation:**
  - Server only sends target name to guesser via `your-target` event
  - Other players see guesser name in `round-started` event
  - PlayerProfile component has `isNameBlurred` prop
- **Security:** Target contact only known to person guessing

### 5. **Capacitor iOS/Android Setup (Option 2)**
- **Status:** Partially verified
- **Folders Created:**
  - `frontend/ios/` - Xcode project ready
  - `frontend/android/` - Android Studio project ready
- **Verified:**
  - `npm --prefix frontend run web`
  - `npm --prefix frontend run cap:sync`
- **Blocked On This Machine:**
  - Android build needs a Java runtime
  - iOS build needs full Xcode and CocoaPods

## 📁 New Files Created

### Backend
- `backend/src/gameService.ts` - GameService class with all game logic
  - `createGame()`, `startGame()`, `startRound()`
  - `recordQuestion()`, `recordGuess()`
  - `updatePlayerStats()`, `getUserStats()`
  - `createTeams()` for team mode

### Frontend Components
- `frontend/src/QuestionCounter.tsx` - Question/timer tracking
- `frontend/src/QuestionCounter.css` - Styling
- `frontend/src/PlayerProfile.tsx` - Player stats display
- `frontend/src/PlayerProfile.css` - Styling
- `frontend/src/TeamDisplay.tsx` - Team cards
- `frontend/src/TeamDisplay.css` - Styling

## 🔄 Integration Checklist

### Current App Integration Status
- [x] `App.tsx` is connected to Socket.io for lobby creation and joining
- [x] Team selection UI is wired into the host lobby flow
- [x] Invite sharing is available via QR code, clipboard, and native share sheet
- [ ] Round gameplay UI still needs to consume `start-round`, `ask-question`, and `make-guess`
- [ ] Player stats should be hydrated from `get-player-stats` instead of placeholder zero-values

## 🎮 Game Flow Example

```javascript
// 1. Create game with team mode
socket.emit('create-game', {
  isTeamMode: true,
  totalRounds: 3,
  playerIds: ['user1', 'user2', 'user3', 'user4']
});

// 2. Start game with team assignments
socket.emit('start-game', {
  gameId: 'game-123',
  teamAssignments: {
    'user1': 'team-1',
    'user2': 'team-1',
    'user3': 'team-2',
    'user4': 'team-2'
  }
});

// 3. For each round:
socket.emit('start-round', {
  gameId: 'game-123',
  targetContact: 'John Doe',
  guesserUserId: 'user1'
});

// 4. Record questions
socket.emit('ask-question', {
  roundId: 'round-1',
  questionNumber: 1,
  questionText: 'Is this person over 30?',
  answer: true
});

// 5. Make guess
socket.emit('make-guess', {
  roundId: 'round-1',
  guess: 'John Doe',
  gameId: 'game-123'
});

// 6. Get stats
socket.emit('get-player-stats', { userId: 'user1' });
```

## 📊 Database Indexes Created

- `idx_contacts_user_id` - Quick contact lookup
- `idx_user_stats_user_id` - Quick stats lookup
- `idx_game_players_game_id` - Find players by game
- `idx_game_players_user_id` - Find player records
- `idx_game_players_team_id` - Find team members
- `idx_teams_game_id` - Find teams by game
- `idx_game_rounds_game_id` - Find rounds by game
- `idx_questions_round_id` - Find questions by round

## 🚀 Testing Recommendations

1. **Question Counter**: Test timer countdown and color changes
2. **Team Mode**: Create game, assign teams, verify team scores update
3. **Player Stats**: Fetch stats before/after games, verify accuracy calculation
4. **Name Blur**: Verify guesser sees target name, others don't
5. **Socket Events**: Monitor WebSocket messages in browser DevTools

## 📝 API Implementation Notes

- All timestamps are TIMESTAMP DEFAULT CURRENT_TIMESTAMP in PostgreSQL
- UUIDs generated with `v4 as uuidv4` from 'uuid' package
- Uses ON CONFLICT for user insertion (prevents duplicates)
- Team scores calculated by SUM of player scores in team
- Win rate = wins / total_games (0.0 to 1.0)
- Accuracy = correct_guesses / total_questions_asked
