import React, { useEffect, useState } from 'react';
import { Contacts } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { io, Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import PlayerProfile from './PlayerProfile';
import QuestionCounter from './QuestionCounter';
import TeamDisplay from './TeamDisplay';
import './App.css';

type Screen = 'landing' | 'welcome' | 'profile' | 'lobby-choice' | 'lobby' | 'playing';
type GameType = 'guess_person' | 'guess_number';

type ContactRecord = {
  name?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  phones?: Array<{ number?: string }>;
  emails?: Array<{ address?: string }>;
};

type NumberCategorySuggestion = {
  prompt: string;
  examples: string[];
};

type LobbyPlayer = {
  user_id: string;
  username: string;
  avatar_url?: string;
  score: number;
  team_id?: string | null;
  team_name?: string | null;
  isHost?: boolean;
  connected?: boolean;
};

type LobbyState = {
  gameId: string;
  hostId: string;
  gameType: GameType;
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
  gameType: GameType;
  mutualContacts: Array<{ name?: string; contact_name?: string; users?: string[] }>;
  categorySuggestions?: NumberCategorySuggestion[];
  numberRange?: { min: number; max: number };
  players: LobbyPlayer[];
  isTeamMode: boolean;
};

type ActiveRound = {
  roundId: string;
  roundNumber: number;
  gameType: GameType;
  guesserUserId: string;
  guesserName: string;
  responderOrder: Array<{ user_id: string; username: string }>;
  activeResponderUserId: string | null;
  suggestedCategories: NumberCategorySuggestion[];
  questionLimit: number;
  cluePhaseComplete: boolean;
};

type QuestionEntry = {
  questionNumber: number;
  questionText: string;
  answer: boolean;
  askerUsername: string;
};

type NumberClue = {
  id: string;
  prompt_text: string;
  clue_text: string;
  turn_order: number;
  responder_user_id: string;
  responder_username: string;
};

type GuessResult = {
  gameType: GameType;
  isCorrect: boolean;
  guessedName: string;
  targetName: string | null;
  guessedNumber: number | null;
  targetNumber: number | null;
  guesserUsername: string;
  roundId: string;
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

function getGameLabel(gameType: GameType | null) {
  return gameType === 'guess_number' ? 'Guess the Number' : 'Guess the Person';
}

function getGameTagline(gameType: GameType | null) {
  return gameType === 'guess_number'
    ? 'Everyone else sees the number. The guesser reads the room.'
    : 'Mutual contacts become the hidden target.';
}

function getMutualContactName(contact?: { name?: string; contact_name?: string }) {
  return (contact?.contact_name || contact?.name || '').trim();
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
  const [screen, setScreen] = useState<Screen>('landing');
  const [selectedGameType, setSelectedGameType] = useState<GameType | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState(getInviteCodeFromUrl());
  const [userId, setUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [statusMessage, setStatusMessage] = useState('Choose a game, open a lobby, and test the whole flow locally in a mobile-style browser view.');
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
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [revealedTargetName, setRevealedTargetName] = useState('');
  const [revealedSecretNumber, setRevealedSecretNumber] = useState<number | null>(null);
  const [selectedGuesserId, setSelectedGuesserId] = useState('');
  const [selectedTargetName, setSelectedTargetName] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionFeed, setQuestionFeed] = useState<QuestionEntry[]>([]);
  const [numberClues, setNumberClues] = useState<NumberClue[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [clueText, setClueText] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [latestGuessResult, setLatestGuessResult] = useState<GuessResult | null>(null);
  const [finalScores, setFinalScores] = useState<LobbyPlayer[] | null>(null);
  const [manualContactInput, setManualContactInput] = useState('');

  const currentGameType = activeRound?.gameType || gameSummary?.gameType || lobby?.gameType || selectedGameType;
  const inviteUrl = gameCode ? createInviteUrl(gameCode) : '';
  const teams = lobby ? mapTeams(lobby.players, teamAssignments, lobby.isTeamMode) : [];
  const canStartGame = !!lobby && lobby.players.length >= 2 && (!lobby.isTeamMode || Object.keys(teamAssignments).length === lobby.players.length);
  const playersInGame = gameSummary?.players || lobby?.players || [];
  const mutualContactNames = (gameSummary?.mutualContacts || []).map((contact) => getMutualContactName(contact)).filter(Boolean);
  const activeSuggestions = activeRound?.suggestedCategories || gameSummary?.categorySuggestions || [];
  const isCurrentUserHost = !!userId && !!lobby && lobby.hostId === userId;
  const isCurrentUserGuesser = !!userId && !!activeRound && activeRound.guesserUserId === userId;
  const isCurrentUserResponder = !!userId && !!activeRound && activeRound.activeResponderUserId === userId;
  const roundIsLive = !!activeRound && !latestGuessResult;
  const questionLimit = activeRound?.questionLimit || (currentGameType === 'guess_number' ? 3 : 20);
  const currentPromptValue = customPrompt.trim() || selectedPrompt;
  const canLaunchRound = !!socket && !!lobby && !!gameSummary && !!selectedGuesserId && !roundIsLive && !isBusy && (currentGameType === 'guess_number' || !!selectedTargetName);
  const canSubmitNumberClue = !!socket && !!activeRound && !!currentPromptValue && !!clueText.trim() && isCurrentUserResponder && roundIsLive;

  const displayTeams = lobby ? mapTeams(playersInGame, teamAssignments, lobby.isTeamMode) : [];

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

      if (pendingAction === 'join') {
        setStatusMessage('Joining the lobby from your invite link.');
        setPendingAction(null);
        return;
      }

      if (!pendingAction) {
        setScreen('lobby-choice');
        setStatusMessage('Choose whether you want to host a lobby or join one that already exists.');
      }
      // pendingAction === 'create' is handled by the dedicated useEffect below
    };

    const handleGameCreated = (payload: { gameId: string; gameType: GameType }) => {
      setGameCode(payload.gameId);
      setSelectedGameType(payload.gameType);
      setScreen('lobby');
      setIsBusy(false);
      setShareState('');
      setStatusMessage('Lobby is live. Share the link or QR code so other players can join.');
    };

    const handleLobbyJoined = (payload: { gameId: string; gameType?: GameType }) => {
      setGameCode(payload.gameId);
      if (payload.gameType) {
        setSelectedGameType(payload.gameType);
      }
      setScreen('lobby');
      setIsBusy(false);
      setStatusMessage('Lobby connected. Waiting for the full party to assemble.');
    };

    const handleLobbyUpdated = (payload: LobbyState) => {
      setLobby(payload);
      setSelectedGameType(payload.gameType);
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
      setSelectedGameType(payload.gameType);
      setActiveRound(null);
      setQuestionFeed([]);
      setNumberClues([]);
      setGuessInput('');
      setLatestGuessResult(null);
      setRevealedTargetName('');
      setRevealedSecretNumber(null);
      setFinalScores(null);
      setSelectedGuesserId(payload.players[0]?.user_id || '');
      setSelectedTargetName(getMutualContactName(payload.mutualContacts[0]));
      setSelectedPrompt('');
      setCustomPrompt('');
      setClueText('');
      setScreen('playing');
      setIsBusy(false);
      setStatusMessage(payload.gameType === 'guess_number' ? 'Match started. Host can launch the first number round.' : 'Match started. Host can configure the first round now.');
    };

    const handleRoundStarted = (payload: {
      roundId: string;
      gameType: GameType;
      guesserUserId: string;
      guesserName: string;
      roundNumber: number;
      responderOrder?: Array<{ user_id: string; username: string }>;
      activeResponderUserId?: string | null;
      suggestedCategories?: NumberCategorySuggestion[];
      questionLimit?: number;
    }) => {
      setActiveRound({
        roundId: payload.roundId,
        roundNumber: payload.roundNumber,
        gameType: payload.gameType,
        guesserUserId: payload.guesserUserId,
        guesserName: payload.guesserName,
        responderOrder: payload.responderOrder || [],
        activeResponderUserId: payload.activeResponderUserId ?? null,
        suggestedCategories: payload.suggestedCategories || [],
        questionLimit: payload.questionLimit || (payload.gameType === 'guess_number' ? 3 : 20),
        cluePhaseComplete: payload.gameType === 'guess_number' ? !payload.activeResponderUserId : true,
      });
      setQuestionFeed([]);
      setNumberClues([]);
      setLatestGuessResult(null);
      setGuessInput('');
      setSelectedPrompt('');
      setCustomPrompt('');
      setClueText('');
      setRevealedTargetName('');
      setRevealedSecretNumber(null);
      setIsBusy(false);
      setStatusMessage(
        payload.gameType === 'guess_number'
          ? `Round ${payload.roundNumber} is live. Players are building clues for ${payload.guesserName}.`
          : `Round ${payload.roundNumber} is live. ${payload.guesserName} is the guesser.`
      );
    };

    const handleYourTarget = (payload: { targetName: string }) => {
      setRevealedTargetName(payload.targetName);
    };

    const handleNumberSecret = (payload: { secretNumber: number }) => {
      setRevealedSecretNumber(payload.secretNumber);
    };

    const handleQuestionAnswered = (payload: QuestionEntry) => {
      setQuestionFeed((currentFeed) => [...currentFeed, payload]);
    };

    const handleNumberClueRecorded = (payload: {
      clues: NumberClue[];
      activeResponderUserId: string | null;
      cluePhaseComplete: boolean;
    }) => {
      setNumberClues(payload.clues);
      setActiveRound((currentRound) => {
        if (!currentRound) {
          return currentRound;
        }

        return {
          ...currentRound,
          activeResponderUserId: payload.activeResponderUserId,
          cluePhaseComplete: payload.cluePhaseComplete,
        };
      });
      if (payload.cluePhaseComplete) {
        setStatusMessage('Clue phase complete. The guesser can ask up to three questions and make a final guess.');
      }
    };

    const handleGuessResult = (payload: GuessResult) => {
      setLatestGuessResult(payload);
      setIsBusy(false);
      setStatusMessage(
        payload.gameType === 'guess_number'
          ? payload.isCorrect
            ? `${payload.guesserUsername} nailed the number ${payload.targetNumber}.`
            : `${payload.guesserUsername} guessed ${payload.guessedNumber}. The hidden number was ${payload.targetNumber}.`
          : payload.isCorrect
            ? `${payload.guesserUsername} guessed correctly: ${payload.targetName}.`
            : `${payload.guesserUsername} guessed ${payload.guessedName}. The correct answer was ${payload.targetName}.`
      );
    };

    const handleGameEnded = (payload: { finalScores: LobbyPlayer[] }) => {
      setFinalScores(payload.finalScores);
      setActiveRound(null);
      setIsBusy(false);
      setStatusMessage('Game complete. Final scores are ready.');
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
    socket.on('round-started', handleRoundStarted);
    socket.on('your-target', handleYourTarget);
    socket.on('number-secret', handleNumberSecret);
    socket.on('question-answered', handleQuestionAnswered);
    socket.on('number-clue-recorded', handleNumberClueRecorded);
    socket.on('guess-result', handleGuessResult);
    socket.on('game-ended', handleGameEnded);
    socket.on('error', handleServerError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user-created', handleUserCreated);
      socket.off('game-created', handleGameCreated);
      socket.off('lobby-joined', handleLobbyJoined);
      socket.off('lobby-updated', handleLobbyUpdated);
      socket.off('game-started', handleGameStarted);
      socket.off('round-started', handleRoundStarted);
      socket.off('your-target', handleYourTarget);
      socket.off('number-secret', handleNumberSecret);
      socket.off('question-answered', handleQuestionAnswered);
      socket.off('number-clue-recorded', handleNumberClueRecorded);
      socket.off('guess-result', handleGuessResult);
      socket.off('game-ended', handleGameEnded);
      socket.off('error', handleServerError);
    };
  }, [socket, pendingAction, isTeamMode, totalRounds, selectedGameType]);

  // Emit create-game once userId is confirmed, reading fresh state values to avoid stale closures
  useEffect(() => {
    if (!socket || !userId || pendingAction !== 'create') {
      return;
    }

    socket.emit('create-game', {
      gameType: selectedGameType || 'guess_person',
      isTeamMode,
      totalRounds,
      playerIds: [userId],
    });
    setStatusMessage(`Creating a ${getGameLabel(selectedGameType)} lobby and preparing the invite link.`);
    setPendingAction(null);
  }, [socket, userId, pendingAction, selectedGameType, isTeamMode, totalRounds]);

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

  function chooseGameType(gameType: GameType) {
    setSelectedGameType(gameType);
    setContacts([]);
    setErrorMessage('');
    setGameSummary(null);
    setActiveRound(null);
    setStatusMessage(
      gameType === 'guess_number'
        ? 'Build ridiculous clue rounds around a hidden number from zero to ten.'
        : 'Import contacts or continue without them to set up a Guess the Person lobby.'
    );
    setScreen(gameType === 'guess_person' ? 'welcome' : 'profile');
  }

  async function importContacts() {
    if (!Capacitor.isNativePlatform()) {
      setScreen('profile');
      setStatusMessage('Add contacts manually below, or continue without them.');
      return;
    }

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

  function addManualContact() {
    const name = manualContactInput.trim();
    if (!name) {
      return;
    }
    setContacts((current) => [...current, { name }]);
    setManualContactInput('');
  }

  function removeManualContact(name: string) {
    setContacts((current) => current.filter((c) => (c.name || c.displayName) !== name));
  }

  function registerForLobby(action: 'create' | 'join') {
    if (!socket || connectionState !== 'connected') {
      setErrorMessage('Waiting for the server connection. Try again in a moment.');
      return;
    }

    if (!username.trim()) {
      setErrorMessage('Enter a player name before continuing.');
      return;
    }

    if (action === 'create' && !selectedGameType) {
      setErrorMessage('Choose a game mode before creating a lobby.');
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
          gameType: selectedGameType,
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
      contacts: selectedGameType === 'guess_person' ? contacts : [],
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
      title: `Join my ${getGameLabel(currentGameType)} lobby`,
      text: `Join my ${getGameLabel(currentGameType)} lobby with code ${gameCode}.`,
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
    setStatusMessage('Locking team assignments and starting the match.');
    socket.emit('start-game', {
      gameId: lobby.gameId,
      teamAssignments: lobby.isTeamMode ? teamAssignments : undefined,
    });
  }

  function startRound() {
    if (!socket || !lobby || !selectedGuesserId) {
      return;
    }

    if (currentGameType === 'guess_person' && !selectedTargetName) {
      return;
    }

    setIsBusy(true);
    setLatestGuessResult(null);
    setStatusMessage('Starting the next round.');
    socket.emit('start-round', {
      gameId: lobby.gameId,
      targetContact: currentGameType === 'guess_person' ? selectedTargetName : undefined,
      guesserUserId: selectedGuesserId,
    });
  }

  function recordQuestion(answer: boolean) {
    if (!socket || !activeRound || !questionText.trim() || !roundIsLive) {
      return;
    }

    if (questionFeed.length >= questionLimit) {
      setErrorMessage(`This round allows only ${questionLimit} questions.`);
      return;
    }

    socket.emit('ask-question', {
      roundId: activeRound.roundId,
      questionNumber: questionFeed.length + 1,
      questionText: questionText.trim(),
      answer,
    });
    setQuestionText('');
  }

  function submitNumberClue() {
    if (!socket || !activeRound || !canSubmitNumberClue || !lobby) {
      return;
    }

    socket.emit('submit-number-clue', {
      gameId: lobby.gameId,
      roundId: activeRound.roundId,
      promptText: currentPromptValue,
      clueText: clueText.trim(),
    });
    setSelectedPrompt('');
    setCustomPrompt('');
    setClueText('');
  }

  function submitGuess() {
    if (!socket || !activeRound || !lobby || !guessInput.trim() || !roundIsLive) {
      return;
    }

    if (activeRound.gameType === 'guess_number' && !activeRound.cluePhaseComplete) {
      setErrorMessage('Wait until every non-guesser has submitted a clue.');
      return;
    }

    setIsBusy(true);
    socket.emit('make-guess', {
      roundId: activeRound.roundId,
      guess: guessInput.trim(),
      gameId: lobby.gameId,
    });
  }

  function endGame() {
    if (!socket || !lobby) {
      return;
    }

    setIsBusy(true);
    socket.emit('end-game', { gameId: lobby.gameId });
  }

  function renderLandingScreen() {
    return (
      <section className="panel landing-panel">
        <div className="landing-hero">
          <div className="question-mark-logo">?</div>
          <div className="hero-copy">
            <span className="eyebrow">Two party games, one lobby system</span>
            <h1>Pick The Guessing Game</h1>
            <p>
              Build a live room, invite friends with a link or QR code, and test everything locally in a phone-sized browser view before you touch native builds.
            </p>
          </div>
        </div>

        <div className="game-mode-grid">
          <button className="game-mode-card" onClick={() => chooseGameType('guess_person')}>
            <span className="mode-kicker">Guess the Person</span>
            <strong>Use shared contacts as the hidden answer.</strong>
            <p>Import contacts when available, create a team lobby, and guide one player toward the right name.</p>
            <span className="mode-cta">Play Guess the Person</span>
          </button>

          <button className="game-mode-card game-mode-card-alt" onClick={() => chooseGameType('guess_number')}>
            <span className="mode-kicker">Guess the Number</span>
            <strong>Everyone but the guesser sees the secret number from 0 to 10.</strong>
            <p>Players answer with ridiculous category clues, the guesser asks up to three questions, then goes for the final number.</p>
            <span className="mode-cta">Play Guess the Number</span>
          </button>
        </div>

        {joinCode && (
          <div className="invite-hint">
            <span className="pill">Invite detected</span>
            <p>There is a lobby code in the URL. Pick a mode if you are hosting, or continue and join the shared room after entering your name.</p>
          </div>
        )}
      </section>
    );
  }

  function renderWelcomeScreen() {
    return (
      <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">{getGameLabel(currentGameType)}</span>
          <h1>{getGameLabel(currentGameType)}</h1>
          <p>
            {currentGameType === 'guess_person'
              ? 'Import contacts if you have them, then open a live lobby and let the room work out which shared person is hidden.'
              : 'This mode does not need contacts, so you can jump straight to your player profile and start a ridiculous number lobby.'}
          </p>
        </div>

        <div className="hero-actions">
          <button onClick={importContacts} className="btn btn-primary" disabled={isBusy}>
            {isBusy ? 'Checking Contacts...' : Capacitor.isNativePlatform() ? 'Import Contacts' : 'Add Contacts Manually'}
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
            <strong>QR And Link Sharing</strong>
            <span>One lobby system drives both game modes.</span>
          </div>
          <div>
            <strong>Mobile-Test Ready</strong>
            <span>Responsive layout designed for browser phone emulation.</span>
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
            {currentGameType === 'guess_person'
              ? contacts.length > 0
                ? `Your contact import is loaded with ${contacts.length} entries and ready to sync with the backend.`
                : 'You are continuing without imported contacts for now.'
              : 'Guess the Number skips contacts entirely. You only need a display name to start testing locally.'}
          </p>
        </div>

        <label className="field">
          <span>Display name</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="input" placeholder="Mina, Tom, Jules..." />
        </label>

        <div className="inline-actions">
          <button onClick={() => setScreen('lobby-choice')} className="btn btn-primary" disabled={!username.trim()}>
            Continue
          </button>
          {currentGameType === 'guess_person' && Capacitor.isNativePlatform() && (
            <button onClick={importContacts} className="btn btn-secondary" disabled={isBusy}>
              Retry Contact Import
            </button>
          )}
        </div>

        {currentGameType === 'guess_person' && !Capacitor.isNativePlatform() && (
          <div className="contact-editor">
            <label className="field">
              <span>Add people as contacts</span>
              <div className="inline-actions">
                <input
                  value={manualContactInput}
                  onChange={(e) => setManualContactInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualContact()}
                  className="input"
                  placeholder="Person's name..."
                />
                <button onClick={addManualContact} className="btn btn-secondary" disabled={!manualContactInput.trim()}>
                  Add
                </button>
              </div>
            </label>
            {contacts.length > 0 && (
              <div className="contact-chip-list">
                {contacts.map((c) => (
                  <button
                    key={c.name || c.displayName}
                    className="removable-chip"
                    onClick={() => removeManualContact(c.name || c.displayName || '')}
                  >
                    {c.name || c.displayName} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderLobbyChoiceScreen() {
    return (
      <section className="panel split-panel">
        <div className="card-section">
          <span className="eyebrow">Host {getGameLabel(currentGameType)}</span>
          <h2>Create a new lobby</h2>
          <p>{getGameTagline(currentGameType)} Pick round count, choose teams if you want them, then send the invite around.</p>

          <div className="toggle-row">
            <button className={`chip ${isTeamMode ? 'chip-active' : ''}`} onClick={() => setIsTeamMode(true)}>Team Mode</button>
            <button className={`chip ${!isTeamMode ? 'chip-active' : ''}`} onClick={() => setIsTeamMode(false)}>Solo Mode</button>
          </div>

          <label className="field">
            <span>Rounds</span>
            <input className="input" type="number" min={1} max={10} value={totalRounds} onChange={(event) => setTotalRounds(Number(event.target.value) || 1)} />
          </label>

          <button onClick={() => registerForLobby('create')} className="btn btn-primary" disabled={isBusy || connectionState !== 'connected'}>
            {isBusy && pendingAction === 'create' ? 'Creating Lobby...' : `Create ${getGameLabel(currentGameType)} Lobby`}
          </button>
        </div>

        <div className="card-section muted-card">
          <span className="eyebrow">Join A Match</span>
          <h2>Enter a lobby code</h2>
          <p>Invite links automatically prefill this field. If you are joining, the lobby itself will decide which game mode is active.</p>

          <label className="field">
            <span>Lobby code</span>
            <input className="input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.trim())} placeholder="Paste a code or use an invite link" />
          </label>

          <button onClick={() => registerForLobby('join')} className="btn btn-secondary" disabled={isBusy || connectionState !== 'connected'}>
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
              <h2>{getGameLabel(lobby.gameType)}</h2>
            </div>
            <span className="pill">Code {lobby.gameId}</span>
          </div>

          <p>Share the link or QR code. Players joining from that invite land directly in this lobby and receive live updates over Socket.io.</p>

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
            <span className="pill accent-pill">{getGameLabel(lobby.gameType)} · {lobby.isTeamMode ? 'Team mode' : 'Solo mode'}</span>
          </div>

          <div className="player-grid">
            {lobby.players.map((player) => (
              <div key={player.user_id} className="player-slot">
                <PlayerProfile player={mapPlayerProfile(player)} showFullStats={false} isCurrentPlayer={player.user_id === userId} />
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
            <button onClick={startGame} className="btn btn-primary" disabled={userId !== lobby.hostId || !canStartGame || isBusy}>
              {isBusy ? 'Starting Game...' : `Start ${getGameLabel(lobby.gameType)}`}
            </button>
            {userId !== lobby.hostId && <p className="helper-text">Only the host can launch the match.</p>}
          </div>
        </div>
      </section>
    );
  }

  function renderQuestionCard(placeholder: string) {
    return (
      <div className="round-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Questions</span>
            <h2>{currentGameType === 'guess_number' ? 'Ask up to three questions' : 'Ask and record answers'}</h2>
          </div>
        </div>

        <QuestionCounter
          totalQuestions={questionFeed.length}
          timeLimit={currentGameType === 'guess_number' ? 90 : 120}
          onTimeUp={() => setStatusMessage('Round timer expired. Start the next round or end the game.')}
          isActive={roundIsLive}
        />

        <label className="field">
          <span>Question text</span>
          <input className="input" value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder={placeholder} disabled={!roundIsLive || questionFeed.length >= questionLimit} />
        </label>

        <div className="inline-actions compact-actions">
          <button onClick={() => recordQuestion(true)} className="btn btn-primary" disabled={!roundIsLive || !questionText.trim() || questionFeed.length >= questionLimit}>
            Record Yes
          </button>
          <button onClick={() => recordQuestion(false)} className="btn btn-secondary" disabled={!roundIsLive || !questionText.trim() || questionFeed.length >= questionLimit}>
            Record No
          </button>
        </div>

        <div className="question-log">
          {questionFeed.length === 0 && <p className="helper-text">No questions recorded for this round yet.</p>}
          {questionFeed.map((entry) => (
            <div key={`${entry.questionNumber}-${entry.questionText}`} className="question-item">
              <div>
                <strong>Q{entry.questionNumber}</strong>
                <p>{entry.questionText}</p>
              </div>
              <div className="question-answer-block">
                <span className={`pill ${entry.answer ? 'answer-yes' : 'answer-no'}`}>{entry.answer ? 'Yes' : 'No'}</span>
                <span className="helper-text">{entry.askerUsername}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderGuessCard(placeholder: string) {
    return (
      <div className="round-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Final Guess</span>
            <h2>{currentGameType === 'guess_number' ? 'Submit the hidden number' : 'Submit the final name'}</h2>
          </div>
        </div>

        {isCurrentUserGuesser ? (
          <>
            <label className="field">
              <span>Your guess</span>
              <input
                className="input"
                value={guessInput}
                onChange={(event) => setGuessInput(event.target.value)}
                placeholder={placeholder}
                disabled={!roundIsLive}
                inputMode={currentGameType === 'guess_number' ? 'numeric' : 'text'}
              />
            </label>
            <button
              onClick={submitGuess}
              className="btn btn-primary"
              disabled={!roundIsLive || !guessInput.trim() || isBusy || (currentGameType === 'guess_number' && !activeRound?.cluePhaseComplete)}
            >
              Submit Guess
            </button>
          </>
        ) : (
          <p className="helper-text">Only the active guesser can submit the final answer.</p>
        )}

        {latestGuessResult && (
          <div className={`result-card ${latestGuessResult.isCorrect ? 'result-success' : 'result-fail'}`}>
            <strong>{latestGuessResult.isCorrect ? 'Correct guess' : 'Missed guess'}</strong>
            <p>
              {latestGuessResult.gameType === 'guess_number'
                ? `${latestGuessResult.guesserUsername} guessed ${latestGuessResult.guessedNumber}. Hidden number: ${latestGuessResult.targetNumber}.`
                : `${latestGuessResult.guesserUsername} guessed ${latestGuessResult.guessedName}. Target: ${latestGuessResult.targetName}.`}
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderPersonGameScreen() {
    return (
      <>
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

        <div className="round-layout">
          <div className="round-column">
            <div className="round-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Round Setup</span>
                  <h2>{activeRound ? `Round ${activeRound.roundNumber}` : 'Choose the next round'}</h2>
                </div>
                {isCurrentUserHost && <span className="pill">Host controls</span>}
              </div>

              <p>Host selects a guesser and a mutual contact, then everyone receives live round updates from the shared room.</p>

              <div className="round-controls">
                <label className="field">
                  <span>Guesser</span>
                  <select className="input" value={selectedGuesserId} onChange={(event) => setSelectedGuesserId(event.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                    {playersInGame.map((player) => (
                      <option key={player.user_id} value={player.user_id}>{player.username}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Target contact</span>
                  <select className="input" value={selectedTargetName} onChange={(event) => setSelectedTargetName(event.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                    {mutualContactNames.map((contactName) => (
                      <option key={contactName} value={contactName}>{contactName}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="inline-actions compact-actions">
                <button onClick={startRound} className="btn btn-primary" disabled={!isCurrentUserHost || !canLaunchRound}>
                  {activeRound && latestGuessResult ? 'Start Next Round' : 'Start Round'}
                </button>
                <button onClick={endGame} className="btn btn-secondary" disabled={!isCurrentUserHost || isBusy}>End Game</button>
              </div>
            </div>

            <div className="round-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Target View</span>
                  <h2>{isCurrentUserGuesser ? 'Your hidden target' : 'Guesser target'}</h2>
                </div>
              </div>

              <div className={`target-card ${isCurrentUserGuesser ? 'target-card-live' : 'target-card-blurred'}`}>
                {isCurrentUserGuesser ? (revealedTargetName || 'Waiting for target delivery...') : 'Only the guesser sees the target name'}
              </div>

              {activeRound && <p className="helper-text">{activeRound.guesserName} is guessing in round {activeRound.roundNumber}.</p>}
            </div>
          </div>

          <div className="round-column">
            {renderQuestionCard('Is this person from college?')}
            {renderGuessCard('Type the contact name')}
          </div>
        </div>

        <div className="contact-list">
          {mutualContactNames.slice(0, 8).map((contactName) => (
            <div key={contactName} className="contact-pill">{contactName}</div>
          ))}
        </div>
      </>
    );
  }

  function renderNumberGameScreen() {
    return (
      <>
        <div className="summary-strip">
          <div>
            <strong>{gameSummary?.players.length || 0}</strong>
            <span>Players in match</span>
          </div>
          <div>
            <strong>{activeSuggestions.length}</strong>
            <span>Funny category prompts loaded</span>
          </div>
          <div>
            <strong>0-10</strong>
            <span>Hidden number range</span>
          </div>
        </div>

        <div className="round-layout">
          <div className="round-column">
            <div className="round-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Round Setup</span>
                  <h2>{activeRound ? `Round ${activeRound.roundNumber}` : 'Choose the next guesser'}</h2>
                </div>
                {isCurrentUserHost && <span className="pill">Host controls</span>}
              </div>

              <p>The server secretly picks a number between zero and ten. Everyone except the guesser sees it, then the room builds clues around it.</p>

              <div className="round-controls round-controls-single">
                <label className="field">
                  <span>Guesser</span>
                  <select className="input" value={selectedGuesserId} onChange={(event) => setSelectedGuesserId(event.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                    {playersInGame.map((player) => (
                      <option key={player.user_id} value={player.user_id}>{player.username}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="inline-actions compact-actions">
                <button onClick={startRound} className="btn btn-primary" disabled={!isCurrentUserHost || !canLaunchRound}>
                  {activeRound && latestGuessResult ? 'Start Next Round' : 'Start Round'}
                </button>
                <button onClick={endGame} className="btn btn-secondary" disabled={!isCurrentUserHost || isBusy}>End Game</button>
              </div>
            </div>

            <div className="round-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Secret Number</span>
                  <h2>{isCurrentUserGuesser ? 'You do not get to see it' : 'Your hidden number for this round'}</h2>
                </div>
              </div>

              <div className={`target-card ${!isCurrentUserGuesser && revealedSecretNumber !== null ? 'target-card-live' : 'target-card-blurred'}`}>
                {!activeRound
                  ? 'Waiting for the host to start the round'
                  : isCurrentUserGuesser
                    ? 'Let the clues steer you'
                    : revealedSecretNumber !== null
                      ? revealedSecretNumber
                      : 'Waiting for the number'}
              </div>

              <p className="helper-text">
                {activeRound?.cluePhaseComplete
                  ? 'All clue givers are done. The guesser can now ask up to three questions and lock in a number.'
                  : activeRound
                    ? 'Clues are collected one player at a time so the round stays chaotic but readable.'
                    : 'Start a round to reveal the number to everyone except the guesser.'}
              </p>
            </div>

            <div className="round-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Clue Desk</span>
                  <h2>Respond with a category and a clue</h2>
                </div>
                {activeRound && <span className="pill">{activeRound.cluePhaseComplete ? 'Clue phase done' : 'Clue phase live'}</span>}
              </div>

              {isCurrentUserResponder ? (
                <div className="clue-form">
                  <label className="field">
                    <span>Choose a funny category prompt</span>
                    <div className="suggestion-grid">
                      {activeSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.prompt}
                          type="button"
                          className={`suggestion-chip ${selectedPrompt === suggestion.prompt ? 'suggestion-chip-active' : ''}`}
                          onClick={() => {
                            setSelectedPrompt(suggestion.prompt);
                            setCustomPrompt('');
                          }}
                        >
                          <strong>{suggestion.prompt}</strong>
                          <span>{suggestion.examples.join(' · ')}</span>
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="field">
                    <span>Or type your own category</span>
                    <input className="input" value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Pub, hangover, movie villain, holiday destination..." />
                  </label>

                  <label className="field">
                    <span>Your clue</span>
                    <input className="input" value={clueText} onChange={(event) => setClueText(event.target.value)} placeholder="Ferrari, mid-table, completely cursed..." />
                  </label>

                  <button onClick={submitNumberClue} className="btn btn-primary" disabled={!canSubmitNumberClue}>
                    Submit Clue
                  </button>
                </div>
              ) : (
                <p className="helper-text">
                  {!activeRound
                    ? 'Start the round first.'
                    : activeRound.cluePhaseComplete
                      ? 'Clue phase is complete.'
                      : activeRound.activeResponderUserId
                        ? `${playersInGame.find((player) => player.user_id === activeRound.activeResponderUserId)?.username || 'Another player'} is currently choosing the next clue.`
                        : 'Waiting for the next clue giver.'}
                </p>
              )}

              <div className="question-log">
                {numberClues.length === 0 && <p className="helper-text">No clues submitted yet.</p>}
                {numberClues.map((clue) => (
                  <div key={clue.id} className="question-item clue-item">
                    <div>
                      <strong>{clue.prompt_text}</strong>
                      <p>{clue.clue_text}</p>
                    </div>
                    <div className="question-answer-block">
                      <span className="pill">#{clue.turn_order}</span>
                      <span className="helper-text">{clue.responder_username}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="round-column">
            {renderQuestionCard('Is it closer to zero than ten?')}
            {renderGuessCard('Type a number from 0 to 10')}
          </div>
        </div>
      </>
    );
  }

  function renderPlayingScreen() {
    return (
      <section className="panel stack-panel play-panel">
        <div>
          <span className="eyebrow">Live Match</span>
          <h2>{getGameLabel(currentGameType)}</h2>
          <p>{getGameTagline(currentGameType)} This screen is designed to be testable in a narrow mobile browser viewport on this machine.</p>
        </div>

        {gameSummary?.isTeamMode && displayTeams.length > 0 && <TeamDisplay teams={displayTeams} />}

        {currentGameType === 'guess_number' ? renderNumberGameScreen() : renderPersonGameScreen()}

        {finalScores && (
          <div className="round-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Final Scores</span>
                <h2>Scoreboard</h2>
              </div>
            </div>
            <div className="score-list">
              {finalScores.map((player) => (
                <div key={player.user_id} className="score-row">
                  <span>{player.username}</span>
                  <strong>{player.score}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left"></div>
      <div className="background-glow background-glow-right"></div>

      <header className="topbar">
        <div>
          <span className="eyebrow">Multiplayer guessing games</span>
          <h1 className="title">Guess?</h1>
        </div>
        <div className="status-cluster">
          <span className={`connection-pill connection-${connectionState}`}>{connectionState}</span>
          {currentGameType && <span className="code-pill">{getGameLabel(currentGameType)}</span>}
          {gameCode && <span className="code-pill">Lobby {gameCode}</span>}
        </div>
      </header>

      <main className="app-main">
        <section className="status-banner">
          <p>{statusMessage}</p>
          {errorMessage && <span className="error-banner">{errorMessage}</span>}
        </section>

        {screen === 'landing' && renderLandingScreen()}
        {screen === 'welcome' && renderWelcomeScreen()}
        {screen === 'profile' && renderProfileScreen()}
        {screen === 'lobby-choice' && renderLobbyChoiceScreen()}
        {screen === 'lobby' && renderLobbyScreen()}
        {screen === 'playing' && renderPlayingScreen()}
      </main>
    </div>
  );
}