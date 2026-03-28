import React from 'react';
import './PlayerProfile.css';

interface PlayerStats {
  id: string;
  username: string;
  avatar_url?: string;
  total_games: number;
  wins: number;
  losses: number;
  total_correct_guesses: number;
  total_questions_asked: number;
  win_rate: number;
  isNameBlurred?: boolean;
}

interface PlayerProfileProps {
  player: PlayerStats;
  showFullStats?: boolean;
  isCurrentPlayer?: boolean;
}

export default function PlayerProfile({
  player,
  showFullStats = true,
  isCurrentPlayer = false,
}: PlayerProfileProps) {
  // Calculate additional stats
  const accuracy =
    player.total_questions_asked > 0
      ? ((player.total_correct_guesses / player.total_questions_asked) * 100).toFixed(1)
      : '0';

  const displayName = player.isNameBlurred ? '???' : player.username;

  return (
    <div className={`player-profile ${isCurrentPlayer ? 'current-player' : ''}`}>
      <div className="profile-header">
        <div className="avatar">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt={player.username} />
          ) : (
            <div className="avatar-placeholder">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="profile-info">
          <h3 className="username">{displayName}</h3>
          {isCurrentPlayer && <span className="badge">You</span>}
        </div>
      </div>

      {showFullStats && (
        <div className="stats-grid">
          <div className="stat">
            <span className="stat-label">Win Rate</span>
            <span className="stat-value">{(player.win_rate * 100).toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Games</span>
            <span className="stat-value">{player.total_games}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Correct Guesses</span>
            <span className="stat-value">{player.total_correct_guesses}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Accuracy</span>
            <span className="stat-value">{accuracy}%</span>
          </div>
        </div>
      )}

      {!showFullStats && (
        <div className="quick-stats">
          <span className="win-loss">
            {player.wins}W - {player.losses}L
          </span>
          <span className="win-rate">
            {(player.win_rate * 100).toFixed(0)}% WR
          </span>
        </div>
      )}
    </div>
  );
}
