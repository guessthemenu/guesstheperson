import React from 'react';
import './TeamDisplay.css';

interface Team {
  id: string;
  team_name: string;
  score: number;
  members: Array<{
    id: string;
    username: string;
    avatar_url?: string;
  }>;
}

interface TeamDisplayProps {
  teams: Team[];
}

export default function TeamDisplay({ teams }: TeamDisplayProps) {
  return (
    <div className="team-display">
      <h2>Teams</h2>
      <div className="teams-grid">
        {teams.map((team) => (
          <div key={team.id} className="team-card">
            <div className="team-header">
              <h3>{team.team_name}</h3>
              <div className="team-score">
                <span className="label">Score</span>
                <span className="score">{team.score}</span>
              </div>
            </div>

            <div className="team-members">
              {team.members.map((member) => (
                <div key={member.id} className="team-member">
                  <div className="member-avatar">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.username} />
                    ) : (
                      <span>{member.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="member-name">{member.username}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
