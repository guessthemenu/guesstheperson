import React, { useEffect, useState } from 'react';
import { Contacts } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { io, Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import PlayerProfile from './PlayerProfile';
import TeamDisplay from './TeamDisplay';
import './App.css';

type Screen = 'welcome' | 'profile' | 'lobby-choice' | 'lobby' | 'playing';

type ContactRecord = {
  name?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  phones?: Array<{ number?: string }>;
  emails?: Array<{ address?: string }>;
};

type LobbyPlayer = {
  user_id: string;
  username: string;
  avatar_url?: string;
  score: number;
  team_id?: string | null;
  team_name?: string | null;
  isHost: boolean;
  connected: boolean;
};

type LobbyState = {
  gameId: string;
  hostId: string;
  isTeamMode: boolean;
  totalRounds: number;
  status: string;
  players: LobbyPlayer[];
};

type TeamCard = {
  id: string;
  team_name: string;
  score: number;
  members: Array<{
    id: string;
    username: string;
    avatar_url?: string;
  }>;
};

type GameStartedPayload = {
  gameId: string;
  mutualContacts: Array<{ name?: string; contact_name?: string }>;
  players: LobbyPlayer[];
  isTeamMode: boolean;
};

const DEFAULT_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const DEFAULT_TEAM_NAMES = ['Solar Club', 'Tidal Crew'];

function getInviteCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('game') || '';
}

function createInviteUrl(gameId: string) {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('game', gameId);
  return inviteUrl.toString();
}

function mapTeams(players: LobbyPlayer[], teamAssignments: Record<string, string>, useTeamMode: boolean) {
  if (!useTeamMode) {
    return [] as TeamCard[];
  }

  const teams = new Map<string, TeamCard>();

  players.forEach((player, index) => {
    const teamName = teamAssignments[player.user_id] || player.team_name || DEFAULT_TEAM_NAMES[index % DEFAULT_TEAM_NAMES.length];

    if (!teams.has(teamName)) {
      teams.set(teamName, {
        id: teamName.toLowerCase().replace(/\s+/g, '-'),
        team_name: teamName,
        score: 0,
        members: [],
      });
    }

    const team = teams.get(teamName)!;
    team.score += player.score || 0;
    team.members.push({
      id: player.user_id,
      username: player.username,
      avatar_url: player.avatar_url,
    });
  });

  return Array.from(teams.values());
}

function mapPlayerProfile(player: LobbyPlayer) {
  return {
    id: player.user_id,
    username: player.username,
    avatar_url: player.avatar_url,
    total_games: 0,
    wins: 0,
    losses: 0,
    total_correct_guesses: 0,
    total_questions_asked: 0,
    win_rate: 0,
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState(getInviteCodeFromUrl());
  const [userId, setUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [statusMessage, setStatusMessage] = useState('Import your contacts, spin up a lobby, and send one link to the whole group.');
  const [errorMessage, setErrorMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameCode, setGameCode] = useState(getInviteCodeFromUrl());
  const [isTeamMode, setIsTeamMode] = useState(true);
  const [totalRounds, setTotalRounds] = useState(3);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);
  const [shareState, setShareState] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [gameSummary, setGameSummary] = useState<GameStartedPayload | null>(null);

  const inviteUrl = gameCode ? createInviteUrl(gameCode) : '';
  const teams = lobby ? mapTeams(lobby.players, teamAssignments, lobby.isTeamMode) : [];
  const canStartGame = !!lobby && lobby.players.length >= 2 && (!lobby.isTeamMode || Object.keys(teamAssignments).length === lobby.players.length);

  useEffect(() => {
    const nextSocket = io(DEFAULT_API_URL, {
      transports: ['websocket', 'polling'],
    });

    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConnect = () => {
      setConnectionState('connected');
      setErrorMessage('');
    };

    const handleDisconnect = () => {
      setConnectionState('disconnected');
    };

    const handleUserCreated = (payload: { userId: string; username: string }) => {
      setUserId(payload.userId);
      setUsername(payload.username);
      setIsBusy(false);
      setErrorMessage('');

      if (pendingAction === 'create') {
        socket.emit('create-game', {
          isTeamMode,
          totalRounds,
          playerIds: [payload.userId],
        });
        setStatusMessage('Creating your lobby and preparing the invite link.');
        setPendingAction(null);
        return;
      }

      if (pendingAction === 'join') {
        setStatusMessage('Joining the lobby from your invite link.');
        setPendingAction(null);
        return;
      }

      setScreen('lobby-choice');
      setStatusMessage('Choose whether you want to host a lobby or join one that already exists.');
    };

    const handleGameCreated = (payload: { gameId: string }) => {
      setGameCode(payload.gameId);
      setScreen('lobby');
      setIsBusy(false);
      setShareState('');
      setStatusMessage('Lobby is live. Share the link or QR code so other players can join.');
    };

    const handleLobbyJoined = (payload: { gameId: string }) => {
      setGameCode(payload.gameId);
      setScreen('lobby');
      setIsBusy(false);
      setStatusMessage('Lobby connected. Waiting for the full party to assemble.');
    };

    const handleLobbyUpdated = (payload: LobbyState) => {
      setLobby(payload);
      setScreen('lobby');
      setGameCode(payload.gameId);
      setIsBusy(false);
      setErrorMessage('');
      setStatusMessage(payload.players.length > 1 ? 'Lobby is synced across all connected players.' : 'Invite at least one more player to start the game.');

      setTeamAssignments((currentAssignments) => {
        const nextAssignments = payload.players.reduce<Record<string, string>>((accumulator, player, index) => {
          const fallbackTeam = DEFAULT_TEAM_NAMES[index % DEFAULT_TEAM_NAMES.length];
          accumulator[player.user_id] = player.team_name || currentAssignments[player.user_id] || fallbackTeam;
          return accumulator;
        }, {});

        return payload.isTeamMode ? nextAssignments : {};
      });
    };

    const handleGameStarted = (payload: GameStartedPayload) => {
      setGameSummary(payload);
      setScreen('playing');
      setIsBusy(false);
      setStatusMessage('Match started. The round setup is live and synced for everyone in the room.');
    };

    const handleServerError = (payload: { message?: string }) => {
      setIsBusy(false);
      setErrorMessage(payload.message || 'Something went wrong.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('user-created', handleUserCreated);
    socket.on('game-created', handleGameCreated);
    socket.on('lobby-joined', handleLobbyJoined);
    socket.on('lobby-updated', handleLobbyUpdated);
    socket.on('game-started', handleGameStarted);
    socket.on('error', handleServerError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user-created', handleUserCreated);
      socket.off('game-created', handleGameCreated);
      socket.off('lobby-joined', handleLobbyJoined);
      socket.off('lobby-updated', handleLobbyUpdated);
      socket.off('game-started', handleGameStarted);
      socket.off('error', handleServerError);
    };
  }, [socket, pendingAction, isTeamMode, totalRounds]);

  useEffect(() => {
    if (!gameCode) {
      setQrCodeDataUrl('');
      return;
    }

    QRCode.toDataURL(inviteUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#112218',
        light: '#0000',
      },
    })
      .then(setQrCodeDataUrl)
      .catch(() => setQrCodeDataUrl(''));
  }, [gameCode, inviteUrl]);

  useEffect(() => {
    if (!gameCode) {
      return;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('game', gameCode);
    window.history.replaceState({}, '', nextUrl.toString());
  }, [gameCode]);

  async function importContacts() {
    setIsBusy(true);
    setErrorMessage('');
    setStatusMessage('Requesting contact access from the device.');

    try {
      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
        },
      });

      setContacts((result.contacts || []) as ContactRecord[]);
      setScreen('profile');
      setStatusMessage(`Imported ${result.contacts?.length || 0} contacts. Add your name to continue.`);
    } catch (error) {
      setContacts([]);
      setScreen('profile');
      setStatusMessage('Contacts were not available here, so you can continue and create a lobby without them.');
    } finally {
      setIsBusy(false);
    }
  }

  function continueWithoutContacts() {
    setContacts([]);
    setScreen('profile');
    setStatusMessage('You can still host or join a lobby now, then import contacts later on device.');
  }

  function registerForLobby(action: 'create' | 'join') {
    if (!socket) {
      setErrorMessage('Socket connection is not ready yet.');
      return;
    }

    if (!username.trim()) {
      setErrorMessage('Enter a player name before continuing.');
      return;
    }

    if (action === 'join' && !joinCode.trim()) {
      setErrorMessage('Paste a lobby code or open an invite link first.');
      return;
    }

    setIsBusy(true);
    setPendingAction(action);
    setErrorMessage('');
    setStatusMessage(action === 'create' ? 'Registering you as the lobby host.' : 'Registering you and resolving the shared lobby link.');

    if (userId) {
      if (action === 'create') {
        socket.emit('create-game', {
          isTeamMode,
          totalRounds,
          playerIds: [userId],
        });
      } else {
        socket.emit('join-lobby', {
          gameId: joinCode.trim(),
        });
      }
      setPendingAction(null);
      return;
    }

    socket.emit('join-game', {
      username: username.trim(),
      contacts,
      gameId: action === 'join' ? joinCode.trim() : undefined,
    });
  }

  function assignTeam(playerId: string, teamName: string) {
    setTeamAssignments((currentAssignments) => ({
      ...currentAssignments,
      [playerId]: teamName,
    }));
  }

  async function shareInvite() {
    if (!inviteUrl) {
      return;
    }

    const sharePayload = {
      title: 'Join my GuessThePerson lobby',
      text: `Join my GuessThePerson lobby with code ${gameCode}.`,
      url: inviteUrl,
    };

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share(sharePayload);
      } else if (navigator.share) {
        await navigator.share(sharePayload);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
        setShareState('Invite link copied to clipboard.');
        return;
      }

      setShareState('Invite sheet opened.');
    } catch (error) {
      setShareState('Invite share was cancelled or unavailable.');
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl || !navigator.clipboard) {
      setShareState('Clipboard access is unavailable in this browser.');
      return;
    }

    await navigator.clipboard.writeText(inviteUrl);
    setShareState('Invite link copied to clipboard.');
  }

  function startGame() {
    if (!socket || !lobby) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setStatusMessage('Locking team assignments and starting the first round.');
    socket.emit('start-game', {
      gameId: lobby.gameId,
      teamAssignments: lobby.isTeamMode ? teamAssignments : undefined,
    });
  }

  function renderWelcomeScreen() {
    return (
      <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Phone contacts become the game board</span>
          <h1>GuessThePerson</h1>
          <p>
            Create a live lobby, invite friends with one link or QR code, and sort the room into teams before the first round starts.
          </p>
        </div>

        <div className="hero-actions">
          <button onClick={importContacts} className="btn btn-primary" disabled={isBusy}>
            {isBusy ? 'Checking Contacts...' : 'Import Contacts'}
          </button>
          <button onClick={continueWithoutContacts} className="btn btn-secondary" disabled={isBusy}>
            Continue Without Contacts
          </button>
        </div>

        <div className="feature-strip">
          <div>
            <strong>Live Socket Lobby</strong>
            <span>Presence updates as players join from shared invites.</span>
          </div>
          <div>
            <strong>Native Sharing</strong>
            <span>QR, clipboard, and device share sheet support.</span>
          </div>
          <div>
            <strong>Capacitor Ready</strong>
            <span>Same React code path for web, iOS, and Android.</span>
          </div>
        </div>
      </section>
    );
  }

  function renderProfileScreen() {
    return (
      <section className="panel stack-panel">
        <div>
          <span className="eyebrow">Player Setup</span>
          <h2>Choose the name everyone will see in the lobby.</h2>
          <p>
            {contacts.length > 0
              ? `Your contact import is loaded with ${contacts.length} entries and ready to sync with the backend.`
              : 'You are continuing without imported contacts for now.'}
          </p>
        </div>

        <label className="field">
          <span>Display name</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="input"
            placeholder="Mina, Tom, Jules..."
          />
        </label>

        <div className="inline-actions">
          <button onClick={() => setScreen('lobby-choice')} className="btn btn-primary" disabled={!username.trim()}>
            Continue
          </button>
          <button onClick={importContacts} className="btn btn-secondary" disabled={isBusy}>
            Retry Contact Import
          </button>
        </div>
      </section>
    );
  }

  function renderLobbyChoiceScreen() {
    return (
      <section className="panel split-panel">
        <div className="card-section">
          <span className="eyebrow">Host A Match</span>
          <h2>Create a new lobby</h2>
          <p>Pick round count, turn on teams if you want, then publish the invite link.</p>

          <div className="toggle-row">
            <button
              className={`chip ${isTeamMode ? 'chip-active' : ''}`}
              onClick={() => setIsTeamMode(true)}
            >
              Team Mode
            </button>
            <button
              className={`chip ${!isTeamMode ? 'chip-active' : ''}`}
              onClick={() => setIsTeamMode(false)}
            >
              Solo Mode
            </button>
          </div>

          <label className="field">
            <span>Rounds</span>
            <input
              className="input"
              type="number"
              min={1}
              max={10}
              value={totalRounds}
              onChange={(event) => setTotalRounds(Number(event.target.value) || 1)}
            />
          </label>

          <button onClick={() => registerForLobby('create')} className="btn btn-primary" disabled={isBusy}>
            {isBusy && pendingAction === 'create' ? 'Creating Lobby...' : 'Create Lobby'}
          </button>
        </div>

        <div className="card-section muted-card">
          <span className="eyebrow">Join A Match</span>
          <h2>Enter a lobby code</h2>
          <p>Invite links automatically prefill this field when opened on web or mobile.</p>

          <label className="field">
            <span>Lobby code</span>
            <input
              className="input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.trim())}
              placeholder="Paste a code or use an invite link"
            />
          </label>

          <button onClick={() => registerForLobby('join')} className="btn btn-secondary" disabled={isBusy}>
            {isBusy && pendingAction === 'join' ? 'Joining Lobby...' : 'Join Lobby'}
          </button>
        </div>
      </section>
    );
  }

  function renderLobbyScreen() {
    if (!lobby) {
      return null;
    }

    return (
      <section className="layout-grid">
        <div className="panel invite-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Lobby Invite</span>
              <h2>Code {lobby.gameId}</h2>
            </div>
            <span className="pill">{lobby.players.length} players</span>
          </div>

          <p>
            Share the link or QR code. Players joining from that invite land directly in this lobby and receive live updates over Socket.io.
          </p>

          <div className="share-box">
            <input className="input share-input" readOnly value={inviteUrl} />
            <div className="inline-actions compact-actions">
              <button onClick={shareInvite} className="btn btn-primary">Share Invite</button>
              <button onClick={copyInviteLink} className="btn btn-secondary">Copy Link</button>
            </div>
            {shareState && <p className="helper-text">{shareState}</p>}
          </div>

          {qrCodeDataUrl && (
            <div className="qr-card">
              <img src={qrCodeDataUrl} alt="Lobby QR code" className="qr-image" />
              <span>Scan to join this lobby instantly.</span>
            </div>
          )}
        </div>

        <div className="panel players-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Lobby Presence</span>
              <h2>Players</h2>
            </div>
            <span className="pill accent-pill">{lobby.isTeamMode ? 'Team mode on' : 'Solo mode'}</span>
          </div>

          <div className="player-grid">
            {lobby.players.map((player) => (
              <div key={player.user_id} className="player-slot">
                <PlayerProfile
                  player={mapPlayerProfile(player)}
                  showFullStats={false}
                  isCurrentPlayer={player.user_id === userId}
                />
                <div className="player-meta">
                  <span className={`presence ${player.connected ? 'presence-online' : 'presence-offline'}`}>
                    {player.connected ? 'Connected' : 'Offline'}
                  </span>
                  {player.isHost && <span className="host-tag">Host</span>}
                </div>

                {lobby.isTeamMode && userId === lobby.hostId && (
                  <div className="team-picker">
                    {DEFAULT_TEAM_NAMES.map((teamName) => (
                      <button
                        key={teamName}
                        className={`chip ${teamAssignments[player.user_id] === teamName ? 'chip-active' : ''}`}
                        onClick={() => assignTeam(player.user_id, teamName)}
                      >
                        {teamName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {teams.length > 0 && <TeamDisplay teams={teams} />}

          <div className="inline-actions compact-actions">
            <button
              onClick={startGame}
              className="btn btn-primary"
              disabled={userId !== lobby.hostId || !canStartGame || isBusy}
            >
              {isBusy ? 'Starting Game...' : 'Start Game'}
            </button>
            {userId !== lobby.hostId && <p className="helper-text">Only the host can launch the match.</p>}
          </div>
        </div>
      </section>
    );
  }

  function renderPlayingScreen() {
    return (
      <section className="panel stack-panel play-panel">
        <div>
          <span className="eyebrow">Live Match</span>
          <h2>Game started</h2>
          <p>
            The lobby has been promoted to an active match. Mutual contact candidates were generated on the server and broadcast to the room.
          </p>
        </div>

        {gameSummary?.isTeamMode && teams.length > 0 && <TeamDisplay teams={teams} />}

        <div className="summary-strip">
          <div>
            <strong>{gameSummary?.players.length || 0}</strong>
            <span>Players in match</span>
          </div>
          <div>
            <strong>{gameSummary?.mutualContacts.length || 0}</strong>
            <span>Mutual contacts found</span>
          </div>
          <div>
            <strong>{lobby?.totalRounds || totalRounds}</strong>
            <span>Rounds planned</span>
          </div>
        </div>

        <div className="contact-list">
          {(gameSummary?.mutualContacts || []).slice(0, 6).map((contact, index) => (
            <div key={`${contact.contact_name || contact.name || 'contact'}-${index}`} className="contact-pill">
              {contact.contact_name || contact.name || 'Shared contact'}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left"></div>
      <div className="background-glow background-glow-right"></div>

      <header className="topbar">
        <div>
          <span className="eyebrow">Multiplayer contact game</span>
          <h1 className="title">GuessThePerson</h1>
        </div>
        <div className="status-cluster">
          <span className={`connection-pill connection-${connectionState}`}>{connectionState}</span>
          {gameCode && <span className="code-pill">Lobby {gameCode}</span>}
        </div>
      </header>

      <main className="app-main">
        <section className="status-banner">
          <p>{statusMessage}</p>
          {errorMessage && <span className="error-banner">{errorMessage}</span>}
        </section>

        {screen === 'welcome' && renderWelcomeScreen()}
        {screen === 'profile' && renderProfileScreen()}
        {screen === 'lobby-choice' && renderLobbyChoiceScreen()}
        {screen === 'lobby' && renderLobbyScreen()}
        {screen === 'playing' && renderPlayingScreen()}
      </main>
    </div>
  );
}
