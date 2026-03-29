import React, { useEffect, useRef, useState } from 'react';
import { Contacts } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { io, Socket } from 'socket.io-client';
import PlayerProfile from './PlayerProfile';
import QuestionCounter from './QuestionCounter';
import TeamDisplay from './TeamDisplay';
import './App.css';

type Screen = 'landing' | 'contact-import' | 'profile' | 'number-mode' | 'lobby-choice' | 'lobby' | 'playing' | 'solo-number';
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
  categoryPickerUserId: string | null;
  chosenCategory: string | null;
  totalClueSlots: number;
};

type QuestionEntry = {
  questionNumber: number;
  questionText: string;
  answer: boolean | undefined;
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
  scores?: Array<{ user_id: string; username: string; score: number }>;
  nextGuesserUserId?: string | null;
};

type SoloClue = {
  category: string;
  clue: string;
};

const DEFAULT_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const DEFAULT_TEAM_NAMES = ['Solar Club', 'Tidal Crew'];

const NUMBER_CATEGORY_SUGGESTIONS: NumberCategorySuggestion[] = [
  { prompt: 'Cars', examples: ['shopping trolley', 'reliable hatchback', 'Ferrari'] },
  { prompt: 'Holiday energy', examples: ['missed the flight', 'city break', 'private island'] },
  { prompt: 'Restaurant vibe', examples: ['microwave chips', 'solid local bistro', 'impossible reservation'] },
  { prompt: 'Hangover severity', examples: ['fresh as rain', 'need chips', 'seeing God'] },
  { prompt: 'Office productivity', examples: ['asleep at desk', 'getting through emails', 'CEO on launch day'] },
  { prompt: 'Footballer ability', examples: ['Sunday league bench', 'Championship starter', "Ballon d'Or"] },
  { prompt: 'House party status', examples: ['everyone left', 'good playlist', 'legendary'] },
  { prompt: 'Fashion choice', examples: ['bin bag', 'safe smart casual', 'runway menace'] },
  { prompt: 'Weather drama', examples: ['barely a drizzle', 'proper storm', 'end times'] },
  { prompt: 'Kebab quality', examples: ['regret', '2am dependable', 'worth travelling for'] },
  { prompt: 'Pet chaos', examples: ['sleepy goldfish', 'cheeky terrier', 'escaped zoo animal'] },
  { prompt: 'DJ set', examples: ['Bluetooth glitch', 'wedding dancefloor', 'headline festival set'] },
  { prompt: 'Cooking skill', examples: ['beans on toast', 'decent Sunday roast', 'Michelin star chef'] },
  { prompt: 'Dance moves', examples: ['stood still', 'awkward shuffle', 'centre of the floor'] },
  { prompt: 'Gym effort', examples: ['walked past it', 'steady routine', 'personal trainer level'] },
  { prompt: 'Texting speed', examples: ['left on read', 'replies eventually', 'instant reply'] },
  { prompt: 'Netflix binge', examples: ['fell asleep ep 1', 'decent series', 'finished in one sitting'] },
  { prompt: 'Road trip role', examples: ['asleep in the back', 'playlist DJ', 'driving cross-country'] },
  { prompt: 'Morning alarm', examples: ['slept through it', 'two snoozes', 'up before it rings'] },
  { prompt: 'Karaoke confidence', examples: ['hid in the corner', 'solid rendition', 'full stage presence'] },
  { prompt: 'Coffee dependency', examples: ['never touch it', 'one a day', 'IV drip'] },
  { prompt: 'Pub quiz knowledge', examples: ['guessing every round', 'handy teammate', 'carrying the team'] },
  { prompt: 'Selfie game', examples: ['blurry thumb shot', 'decent angle', 'influencer level'] },
  { prompt: 'Parallel parking', examples: ['gave up and walked', 'three-point attempt', 'first time perfect'] },
  { prompt: 'Fancy dress effort', examples: ['forgot it was fancy dress', 'last minute hat', 'full costume commitment'] },
  { prompt: 'BBQ skills', examples: ['burnt everything', 'solid burger flip', 'pitmaster'] },
  { prompt: 'Spotify Wrapped', examples: ['three songs on repeat', 'decent mix', 'genre-hopping legend'] },
  { prompt: 'Haggling ability', examples: ['paid full price', 'got a fiver off', 'should be on a market stall'] },
  { prompt: 'Airport behaviour', examples: ['nearly missed the flight', 'there on time', 'four hours early'] },
  { prompt: 'Christmas jumper', examples: ['plain black tee', 'subtle festive', 'full flashing reindeer'] },
  { prompt: 'WhatsApp group chat', examples: ['muted it', 'occasional reply', 'sends 40 messages a day'] },
  { prompt: 'DIY ability', examples: ['called someone else', 'YouTube tutorial job', 'could build a house'] },
  { prompt: 'Festival survival', examples: ['went home day one', 'managed the weekend', 'still going Monday'] },
  { prompt: 'Board game seriousness', examples: ['not bothered', 'competitive streak', 'flipped the table'] },
  { prompt: 'Takeaway order', examples: ['plain chips', 'regular favourite', 'ordered the whole menu'] },
  { prompt: 'Swimming ability', examples: ['doggy paddle', 'steady lengths', 'Olympic trials'] },
  { prompt: 'Wedding speech', examples: ['mumbled thanks', 'got a few laughs', 'standing ovation'] },
  { prompt: 'Plant parent', examples: ['killed a cactus', 'a few on the windowsill', 'indoor jungle'] },
  { prompt: 'Uber rating', examples: ['been warned', 'solid 4.7', 'perfect 5.0'] },
  { prompt: 'Cinema snacks', examples: ['smuggled water', 'small popcorn', 'large combo plus nachos'] },
  { prompt: 'Work email sign-off', examples: ['no sign-off', 'kind regards', 'warmest wishes and a smiley'] },
  { prompt: 'Gossip level', examples: ['knows nothing', 'hears things', 'central intelligence'] },
  { prompt: 'Umbrella readiness', examples: ['always gets soaked', 'checks the forecast', 'carries one year-round'] },
  { prompt: 'Flat pack assembly', examples: ['spare parts left over', 'followed the instructions', 'no instructions needed'] },
  { prompt: 'Tip generosity', examples: ['exact change', 'rounds up a bit', 'doubles the bill'] },
  { prompt: 'Bread knowledge', examples: ['white sliced', 'nice sourdough', 'bakes their own'] },
  { prompt: 'Train commute', examples: ['wrong platform', 'knows the quiet carriage', 'first class regular'] },
  { prompt: 'Birthday planning', examples: ['forgot their own', 'quiet dinner', 'three-day festival'] },
  { prompt: 'Shoe collection', examples: ['one pair of trainers', 'a few options', 'needs another wardrobe'] },
  { prompt: 'Dog walk commitment', examples: ['five-minute loop', 'proper lap of the park', 'three-hour countryside hike'] },
  { prompt: 'Playlist control', examples: ['lets anyone play', 'curated queue', 'will fight for the aux'] },
  { prompt: 'Christmas shopping', examples: ['petrol station gifts', 'done in November', 'handmade everything'] },
  { prompt: 'Nap ability', examples: ['can never nap', 'quick twenty minutes', 'four-hour coma'] },
  { prompt: 'Dentist visits', examples: ['avoiding for years', 'goes when reminded', 'every six months like clockwork'] },
  { prompt: 'Spice tolerance', examples: ['mild korma', 'medium vindaloo', 'eats chillies raw'] },
  { prompt: 'Sofa comfort', examples: ['sat on the floor', 'decent cushion', 'never leaving this spot'] },
  { prompt: 'Secret keeping', examples: ['told everyone', 'mostly reliable', 'vault'] },
  { prompt: 'Camping luxury', examples: ['sleeping bag on mud', 'decent tent and stove', 'glamping with Wi-Fi'] },
  { prompt: 'Podcast habit', examples: ['what is a podcast', 'a few favourites', 'subscribed to everything'] },
  { prompt: 'Photo album', examples: ['three photos on phone', 'organised folders', '50,000 and counting'] },
  { prompt: 'Fancy restaurant', examples: ['intimidated by the menu', 'enjoyed the evening', 'sent the wine back'] },
  { prompt: 'Snow day reaction', examples: ['stayed in bed', 'quick snowball fight', 'built a full igloo'] },
  { prompt: 'Laundry schedule', examples: ['the sniff test', 'weekly wash', 'ironed and folded daily'] },
  { prompt: 'Lie-in potential', examples: ['up at 6am regardless', 'nice sleep till 9', 'midday and counting'] },
  { prompt: 'Charity run', examples: ['walked the whole thing', 'decent jog', 'smashed a PB'] },
  { prompt: 'Cheese knowledge', examples: ['cheddar only', 'knows a brie from a gouda', 'runs a cheese board'] },
  { prompt: 'Theme park thrill', examples: ['stayed on the bench', 'one big ride', 'front row every coaster'] },
  { prompt: 'Hotel mini bar', examples: ['did not touch it', 'one snack', 'emptied the lot'] },
  { prompt: 'Voicemail length', examples: ['never leaves one', 'quick message', 'full monologue'] },
  { prompt: 'WiFi fix skill', examples: ['turned it off and on', 'reset the router', 'rewired the house'] },
  { prompt: 'Jacket potato', examples: ['dry with butter', 'cheese and beans', 'loaded with everything'] },
  { prompt: 'Taxi chat', examples: ['headphones in', 'polite small talk', 'life story by destination'] },
  { prompt: 'Sunday plan', examples: ['did absolutely nothing', 'casual pub lunch', 'full day itinerary'] },
  { prompt: 'Sports watch', examples: ['checked the score later', 'watched the highlights', 'screamed at the TV'] },
  { prompt: 'Ice cream order', examples: ['single scoop vanilla', 'double with a flake', 'sundae with everything'] },
  { prompt: 'Garden effort', examples: ['concrete yard', 'mows when it gets long', 'award-winning flowerbeds'] },
  { prompt: 'Joke telling', examples: ['forgot the punchline', 'gets a chuckle', 'has the room in tears'] },
  { prompt: 'Sunburn risk', examples: ['factor 50 every hour', 'a bit pink', 'lobster red by noon'] },
  { prompt: 'Queue patience', examples: ['left immediately', 'mild frustration', 'waited two hours happily'] },
  { prompt: 'Wallet organisation', examples: ['receipts everywhere', 'cards in order', 'colour-coded budgeting'] },
  { prompt: 'New Year resolution', examples: ['never made one', 'lasted a week', 'still going in December'] },
  { prompt: 'Packing style', examples: ['one bag last minute', 'sensible checklist', 'two suitcases for a weekend'] },
  { prompt: 'Horror film', examples: ['eyes covered', 'jumped once or twice', 'laughed through it'] },
  { prompt: 'Sandwich filling', examples: ['plain ham', 'club sandwich', 'tower of everything'] },
  { prompt: 'Wi-Fi password anger', examples: ['gave up', 'asked three times', 'memorised it instantly'] },
  { prompt: 'Museum visit', examples: ['walked past it', 'had a browse', 'read every plaque'] },
  { prompt: 'Alarm snooze count', examples: ['zero snoozes', 'two or three', 'lost count'] },
  { prompt: 'Pizza order debate', examples: ['whatever is fine', 'strong opinion', 'wrote a spreadsheet'] },
  { prompt: 'Train snack', examples: ['nothing', 'a coffee', 'M&S meal deal plus extras'] },
  { prompt: 'Country pub', examples: ['drove past it', 'quick pint', 'stayed all afternoon'] },
  { prompt: 'Car wash frequency', examples: ['never', 'when it rains', 'every weekend without fail'] },
  { prompt: 'First date effort', examples: ['jeans and a t-shirt', 'smart casual', 'three outfit changes'] },
  { prompt: 'Dessert commitment', examples: ['too full', 'split one', 'ordered two'] },
  { prompt: 'Monday morning', examples: ['barely alive', 'coffee and carry on', 'genuinely excited'] },
  { prompt: 'Beach day', examples: ['forgot the suncream', 'towel and a book', 'full gazebo setup'] },
  { prompt: 'Kitchen drawer', examples: ['cannot open it', 'mildly chaotic', 'everything has a place'] },
  { prompt: 'Password memory', examples: ['reset every time', 'a few memorised', 'never forgotten one'] },
  { prompt: 'Roundabout confidence', examples: ['went round twice', 'hesitant but fine', 'owns the roundabout'] },
  { prompt: 'Crisp flavour loyalty', examples: ['ready salted only', 'rotates favourites', 'whatever is on offer'] },
];

const PERSON_QUESTION_SUGGESTIONS = [
  'Is this person male?',
  'Is this person female?',
  'Have I known them for more than 5 years?',
  'Do they live nearby?',
  'Are they a family member?',
  'Did I meet them through work?',
  'Did I meet them through school or uni?',
  'Are they older than me?',
  'Have I seen them in the last month?',
  'Do they have children?',
  'Are they in a relationship?',
  'Would I go on holiday with them?',
  'Do they have a pet?',
  'Are they taller than average?',
  'Do they drive?',
  'Have we been on a night out together?',
  'Do they support a football team?',
  'Are they on social media a lot?',
  'Would I call them in an emergency?',
  'Do they have a beard or glasses?',
];

function getInviteCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('game') || '';
}

function getInviteTypeFromUrl(): GameType | null {
  const t = new URLSearchParams(window.location.search).get('type');
  if (t === 'guess_number' || t === 'guess_person') return t;
  return null;
}

function extractGameCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get('game') || trimmed;
  } catch {
    return trimmed;
  }
}

function createInviteUrl(gameId: string, gameType?: GameType | null) {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('game', gameId);
  if (gameType) inviteUrl.searchParams.set('type', gameType);
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
  if (!useTeamMode) return [] as TeamCard[];
  const teams = new Map<string, TeamCard>();
  players.forEach((player, index) => {
    const teamName = teamAssignments[player.user_id] || player.team_name || DEFAULT_TEAM_NAMES[index % DEFAULT_TEAM_NAMES.length];
    if (!teams.has(teamName)) {
      teams.set(teamName, { id: teamName.toLowerCase().replace(/\s+/g, '-'), team_name: teamName, score: 0, members: [] });
    }
    const team = teams.get(teamName)!;
    team.score += player.score || 0;
    team.members.push({ id: player.user_id, username: player.username, avatar_url: player.avatar_url });
  });
  return Array.from(teams.values());
}

function mapPlayerProfile(player: LobbyPlayer) {
  return {
    id: player.user_id, username: player.username, avatar_url: player.avatar_url,
    total_games: 0, wins: 0, losses: 0, total_correct_guesses: 0, total_questions_asked: 0, win_rate: 0,
  };
}

function generateComputerClue(secretNumber: number, category: NumberCategorySuggestion): string {
  if (secretNumber <= 3) return category.examples[0];
  if (secretNumber <= 7) return category.examples[1];
  return category.examples[2];
}

function pickRandom<T>(items: T[], count: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, Math.min(count, items.length));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [selectedGameType, setSelectedGameType] = useState<GameType | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState(getInviteCodeFromUrl());
  const [inviteGameType] = useState<GameType | null>(getInviteTypeFromUrl());
  const [userId, setUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameCode, setGameCode] = useState(getInviteCodeFromUrl());
  const [isTeamMode, setIsTeamMode] = useState(true);
  const [totalRounds, setTotalRounds] = useState(3);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);
  const pendingActionRef = useRef(pendingAction);
  pendingActionRef.current = pendingAction;
  const [shareState, setShareState] = useState('');
  const [gameSummary, setGameSummary] = useState<GameStartedPayload | null>(null);
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [revealedTargetName, setRevealedTargetName] = useState('');
  const [revealedSecretNumber, setRevealedSecretNumber] = useState<number | null>(null);
  const [selectedGuesserId, setSelectedGuesserId] = useState('');
  const [selectedTargetName, setSelectedTargetName] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionFeed, setQuestionFeed] = useState<QuestionEntry[]>([]);
  const [numberClues, setNumberClues] = useState<NumberClue[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [clueText, setClueText] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [latestGuessResult, setLatestGuessResult] = useState<GuessResult | null>(null);
  const [finalScores, setFinalScores] = useState<LobbyPlayer[] | null>(null);
  const [manualContactInput, setManualContactInput] = useState('');
  const [playerScores, setPlayerScores] = useState<Array<{ user_id: string; username: string; score: number }>>([]);

  // Solo number game state
  const [soloMode, setSoloMode] = useState(false);
  const [soloSecretNumber, setSoloSecretNumber] = useState<number | null>(null);
  const [soloClues, setSoloClues] = useState<SoloClue[]>([]);
  const [soloGuess, setSoloGuess] = useState('');
  const [soloResult, setSoloResult] = useState<{ isCorrect: boolean; secretNumber: number } | null>(null);
  const [soloCategories, setSoloCategories] = useState<NumberCategorySuggestion[]>([]);

  const currentGameType = activeRound?.gameType || gameSummary?.gameType || lobby?.gameType || selectedGameType;
  const inviteUrl = gameCode ? createInviteUrl(gameCode, currentGameType) : '';
  const teams = lobby ? mapTeams(lobby.players, teamAssignments, lobby.isTeamMode) : [];
  const canStartGame = !!lobby && lobby.players.length >= 2 && (!lobby.isTeamMode || Object.keys(teamAssignments).length === lobby.players.length);
  const playersInGame = gameSummary?.players || lobby?.players || [];
  const mutualContactNames = (gameSummary?.mutualContacts || []).map((contact) => getMutualContactName(contact)).filter(Boolean);
  const activeSuggestions = activeRound?.suggestedCategories || gameSummary?.categorySuggestions || [];
  const isCurrentUserHost = !!userId && !!lobby && lobby.hostId === userId;
  const isCurrentUserGuesser = !!userId && !!activeRound && activeRound.guesserUserId === userId;
  const roundIsLive = !!activeRound && !latestGuessResult;
  const questionLimit = activeRound?.questionLimit || (currentGameType === 'guess_number' ? 3 : 20);
  const canLaunchRound = !!socket && !!lobby && !!gameSummary && !!selectedGuesserId && !roundIsLive && !isBusy && (currentGameType === 'guess_number' || !!selectedTargetName);
  const displayTeams = lobby ? mapTeams(playersInGame, teamAssignments, lobby.isTeamMode) : [];

  // Socket connection
  useEffect(() => {
    const nextSocket = io(DEFAULT_API_URL, { transports: ['websocket', 'polling'] });
    setSocket(nextSocket);
    return () => { nextSocket.disconnect(); };
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setConnectionState('connected');
      setErrorMessage('');
      // Re-authenticate and rejoin game room after reconnect
      if (username && gameCode) {
        socket.emit('join-game', { username, contacts: [], gameId: gameCode });
      } else if (username && lobby?.gameId) {
        socket.emit('join-game', { username, contacts: [], gameId: lobby.gameId });
      }
    };
    const handleDisconnect = () => { setConnectionState('disconnected'); };

    const handleUserCreated = (payload: { userId: string; username: string }) => {
      setUserId(payload.userId);
      setUsername(payload.username);

      setIsBusy(false);
      setErrorMessage('');
      if (pendingActionRef.current === 'join') {
        setStatusMessage('Joining the lobby from your invite link.');
        setPendingAction(null);
        return;
      }
      if (!pendingActionRef.current) {
        setScreen('lobby-choice');
        setStatusMessage('Host a new game or join an existing one.');
      }
    };

    const handleGameCreated = (payload: { gameId: string; gameType: GameType }) => {
      setGameCode(payload.gameId);
      setSelectedGameType(payload.gameType);
      setScreen('lobby');
      setIsBusy(false);
      setShareState('');
      setStatusMessage('Lobby is live. Share the link so other players can join.');
    };

    const handleLobbyJoined = (payload: { gameId: string; gameType?: GameType }) => {
      setGameCode(payload.gameId);
      if (payload.gameType) setSelectedGameType(payload.gameType);
      setScreen('lobby');
      setIsBusy(false);
      setStatusMessage('Connected to lobby. Waiting for players.');
    };

    const handleLobbyUpdated = (payload: LobbyState) => {
      setLobby(payload);
      setSelectedGameType(payload.gameType);
      setScreen('lobby');
      setGameCode(payload.gameId);
      setIsBusy(false);
      setErrorMessage('');
      setStatusMessage(payload.players.length > 1 ? 'Lobby synced.' : 'Invite at least one more player.');
      setTeamAssignments((cur) => {
        const next = payload.players.reduce<Record<string, string>>((acc, p, i) => {
          acc[p.user_id] = p.team_name || cur[p.user_id] || DEFAULT_TEAM_NAMES[i % DEFAULT_TEAM_NAMES.length];
          return acc;
        }, {});
        return payload.isTeamMode ? next : {};
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
      setPlayerScores(payload.players.map(p => ({ user_id: p.user_id, username: p.username, score: p.score || 0 })));
      setSelectedGuesserId(payload.players[0]?.user_id || '');
      setSelectedTargetName(getMutualContactName(payload.mutualContacts[0]));
      setCustomPrompt('');
      setClueText('');
      setScreen('playing');
      setIsBusy(false);
      setStatusMessage('Match started. Host can launch the first round.');
    };

    const handleRoundStarted = (payload: {
      roundId: string; gameType: GameType; guesserUserId: string; guesserName: string;
      roundNumber: number; responderOrder?: Array<{ user_id: string; username: string }>;
      activeResponderUserId?: string | null; suggestedCategories?: NumberCategorySuggestion[];
      questionLimit?: number; categoryPickerUserId?: string | null; totalClueSlots?: number;
    }) => {
      setActiveRound({
        roundId: payload.roundId, roundNumber: payload.roundNumber, gameType: payload.gameType,
        guesserUserId: payload.guesserUserId, guesserName: payload.guesserName,
        responderOrder: payload.responderOrder || [],
        activeResponderUserId: payload.activeResponderUserId ?? null,
        suggestedCategories: payload.suggestedCategories || [],
        questionLimit: payload.questionLimit || (payload.gameType === 'guess_number' ? 3 : 20),
        cluePhaseComplete: payload.gameType === 'guess_number' ? false : true,
        categoryPickerUserId: payload.categoryPickerUserId ?? null,
        chosenCategory: null,
        totalClueSlots: payload.totalClueSlots || 3,
      });
      setQuestionFeed([]);
      setNumberClues([]);
      setLatestGuessResult(null);
      setGuessInput('');
      setCustomPrompt('');
      setClueText('');
      setRevealedTargetName('');
      setRevealedSecretNumber(null);
      setIsBusy(false);
      setStatusMessage(`Round ${payload.roundNumber} is live. ${payload.guesserName} is the guesser.`);
    };

    const handleYourTarget = (payload: { targetName: string }) => { setRevealedTargetName(payload.targetName); };
    const handleNumberSecret = (payload: { secretNumber: number }) => { setRevealedSecretNumber(payload.secretNumber); };
    const handleQuestionAnswered = (payload: QuestionEntry) => {
      setQuestionFeed((f) => {
        // If there's a pending question with same number, update it with the answer
        const idx = f.findIndex((q) => q.questionNumber === payload.questionNumber && q.answer === undefined);
        if (idx >= 0) {
          const updated = [...f];
          updated[idx] = { ...updated[idx], answer: payload.answer };
          return updated;
        }
        return [...f, payload];
      });
    };
    const handleQuestionPending = (payload: { questionNumber: number; questionText: string; askerUsername: string }) => {
      setQuestionFeed((f) => [...f, { ...payload, answer: undefined }]);
    };

    const handleNumberClueRecorded = (payload: { clues: NumberClue[]; activeResponderUserId: string | null; cluePhaseComplete: boolean; nextCategoryPickerUserId?: string | null }) => {
      setNumberClues(payload.clues);
      setActiveRound((cur) => cur ? {
        ...cur,
        activeResponderUserId: payload.activeResponderUserId,
        cluePhaseComplete: payload.cluePhaseComplete,
        categoryPickerUserId: payload.nextCategoryPickerUserId ?? null,
        chosenCategory: null,
      } : cur);
      setCustomPrompt('');
      setClueText('');
      if (payload.cluePhaseComplete) setStatusMessage('All clues are in. Make your guess!');
    };

    const handleCategoryChosen = (payload: { category: string }) => {
      setActiveRound((cur) => cur ? { ...cur, chosenCategory: payload.category } : cur);
      setStatusMessage(`Category chosen: ${payload.category}. Submit your clue!`);
    };

    const handleGuessResult = (payload: GuessResult) => {
      setLatestGuessResult(payload);
      setIsBusy(false);
      if (payload.scores) setPlayerScores(payload.scores);
      if (payload.nextGuesserUserId) setSelectedGuesserId(payload.nextGuesserUserId);
      setStatusMessage(
        payload.gameType === 'guess_number'
          ? payload.isCorrect ? `${payload.guesserUsername} nailed ${payload.targetNumber}!` : `${payload.guesserUsername} guessed ${payload.guessedNumber}. It was ${payload.targetNumber}.`
          : payload.isCorrect ? `${payload.guesserUsername} guessed correctly: ${payload.targetName}!` : `${payload.guesserUsername} guessed ${payload.guessedName}. It was ${payload.targetName}.`
      );
    };

    const handleGameEnded = (payload: { finalScores: LobbyPlayer[] }) => {
      setFinalScores(payload.finalScores);
      setActiveRound(null);
      setIsBusy(false);
      setStatusMessage('Game complete.');
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
    socket.on('question-pending', handleQuestionPending);
    socket.on('number-clue-recorded', handleNumberClueRecorded);
    socket.on('category-chosen', handleCategoryChosen);
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
      socket.off('question-pending', handleQuestionPending);
      socket.off('number-clue-recorded', handleNumberClueRecorded);
      socket.off('category-chosen', handleCategoryChosen);
      socket.off('guess-result', handleGuessResult);
      socket.off('game-ended', handleGameEnded);
      socket.off('error', handleServerError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Auto-create game after user registration
  useEffect(() => {
    if (!socket || !userId || pendingAction !== 'create') return;
    socket.emit('create-game', { gameType: selectedGameType || 'guess_person', isTeamMode, totalRounds, playerIds: [userId] });
    setStatusMessage(`Creating a ${getGameLabel(selectedGameType)} lobby...`);
    setPendingAction(null);
  }, [socket, userId, pendingAction, selectedGameType, isTeamMode, totalRounds]);

  // Poll lobby state while on the lobby screen to catch missed updates
  useEffect(() => {
    if (!socket || screen !== 'lobby' || !gameCode) return;
    const interval = setInterval(() => {
      socket.emit('request-lobby-state', { gameId: gameCode });
    }, 3000);
    return () => clearInterval(interval);
  }, [socket, screen, gameCode]);

  // Update URL with game code
  useEffect(() => {
    if (!gameCode) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('game', gameCode);
    if (currentGameType) nextUrl.searchParams.set('type', currentGameType);
    window.history.replaceState({}, '', nextUrl.toString());
  }, [gameCode, currentGameType]);

  /* ── Navigation ── */

  function chooseGameType(gameType: GameType) {
    setSelectedGameType(gameType);
    setContacts([]);
    setErrorMessage('');
    setGameSummary(null);
    setActiveRound(null);
    setSoloMode(false);
    setSoloSecretNumber(null);
    setSoloClues([]);
    setSoloGuess('');
    setSoloResult(null);

    if (gameType === 'guess_person') {
      setScreen('contact-import');
      setStatusMessage('');
    } else {
      setScreen('profile');
      setStatusMessage('');
    }
  }

  function goHome() {
    setScreen('landing');
    setSelectedGameType(null);
    setErrorMessage('');
    setStatusMessage('');
    setSoloMode(false);
  }

  /* ── Contacts ── */

  async function importContacts() {
    if (!Capacitor.isNativePlatform()) {
      setScreen('profile');
      setStatusMessage('Add contacts manually below.');
      return;
    }
    setIsBusy(true);
    setErrorMessage('');
    setStatusMessage('Requesting contact access...');
    try {
      const result = await Contacts.getContacts({ projection: { name: true, phones: true, emails: true } });
      const imported = (result.contacts || []) as ContactRecord[];
      if (imported.length === 0) {
        setErrorMessage('No contacts found on this device.');
        setIsBusy(false);
        return;
      }
      setContacts(imported);
      setScreen('profile');
      setStatusMessage(`Imported ${imported.length} contacts.`);
    } catch {
      setErrorMessage('Contact access was denied. Grant permission in Settings and try again.');
    } finally {
      setIsBusy(false);
    }
  }

  function addManualContact() {
    const name = manualContactInput.trim();
    if (!name) return;
    setContacts((cur) => [...cur, { name }]);
    setManualContactInput('');
  }

  function removeManualContact(name: string) {
    setContacts((cur) => cur.filter((c) => (c.name || c.displayName) !== name));
  }

  /* ── Lobby actions ── */

  function registerForLobby(action: 'create' | 'join') {
    if (!socket || connectionState !== 'connected') {
      setErrorMessage('Waiting for server connection.');
      return;
    }
    if (!username.trim()) { setErrorMessage('Enter a player name.'); return; }
    if (action === 'create' && !selectedGameType) { setErrorMessage('Choose a game mode first.'); return; }
    if (action === 'join' && !joinCode.trim()) { setErrorMessage('Paste a lobby code or use an invite link.'); return; }

    setIsBusy(true);
    setPendingAction(action);
    setErrorMessage('');
    setStatusMessage(action === 'create' ? 'Creating lobby...' : 'Joining lobby...');

    // Always go through join-game to ensure the socket is authenticated on the backend
    socket.emit('join-game', {
      username: username.trim(),
      contacts: selectedGameType === 'guess_person' ? contacts : [],
      gameId: action === 'join' ? joinCode.trim() : undefined,
    });
  }

  function assignTeam(playerId: string, teamName: string) {
    setTeamAssignments((cur) => ({ ...cur, [playerId]: teamName }));
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    const sharePayload = { title: `Join my ${getGameLabel(currentGameType)} lobby`, text: `Join with code ${gameCode}`, url: inviteUrl };
    try {
      if (Capacitor.isNativePlatform()) { await Share.share(sharePayload); }
      else if (navigator.share) { await navigator.share(sharePayload); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(inviteUrl); setShareState('Link copied!'); return; }
      setShareState('Invite shared.');
    } catch { setShareState('Share was cancelled.'); }
  }

  async function copyInviteLink() {
    if (!inviteUrl || !navigator.clipboard) { setShareState('Clipboard unavailable.'); return; }
    await navigator.clipboard.writeText(inviteUrl);
    setShareState('Link copied!');
  }

  /* ── Game actions ── */

  function startGame() {
    if (!socket || !lobby) return;
    setIsBusy(true);
    setErrorMessage('');
    socket.emit('start-game', { gameId: lobby.gameId, teamAssignments: lobby.isTeamMode ? teamAssignments : undefined });
  }

  function startRound() {
    if (!socket || !lobby || !selectedGuesserId) return;
    if (currentGameType === 'guess_person' && !selectedTargetName) return;
    setIsBusy(true);
    setLatestGuessResult(null);
    socket.emit('start-round', {
      gameId: lobby.gameId,
      targetContact: currentGameType === 'guess_person' ? selectedTargetName : undefined,
      guesserUserId: selectedGuesserId,
    });
  }

  function recordQuestion(answer?: boolean) {
    if (!socket || !activeRound || !questionText.trim() || !roundIsLive) return;
    const answeredCount = questionFeed.filter((q) => q.answer !== undefined).length;
    if (answeredCount >= questionLimit) { setErrorMessage(`Only ${questionLimit} questions allowed.`); return; }
    // Person mode guesser sends question without an answer
    if (currentGameType === 'guess_person' && answer === undefined) {
      socket.emit('ask-question', { roundId: activeRound.roundId, questionNumber: answeredCount + 1, questionText: questionText.trim() });
    } else {
      socket.emit('ask-question', { roundId: activeRound.roundId, questionNumber: answeredCount + 1, questionText: questionText.trim(), answer });
    }
    setQuestionText('');
  }

  function answerQuestion(questionNumber: number, answer: boolean) {
    if (!socket || !activeRound || !roundIsLive) return;
    const pending = questionFeed.find((q) => q.questionNumber === questionNumber && q.answer === undefined);
    if (!pending) return;
    socket.emit('answer-question', {
      roundId: activeRound.roundId,
      questionNumber: pending.questionNumber,
      questionText: pending.questionText,
      answer,
      askerUsername: pending.askerUsername,
    });
  }

  function pickCategory(category: string) {
    if (!socket || !activeRound || !lobby) return;
    socket.emit('pick-category', { gameId: lobby.gameId, roundId: activeRound.roundId, category });
  }

  function submitNumberClue() {
    if (!socket || !activeRound || !lobby || !clueText.trim() || !activeRound.chosenCategory) return;
    if (isCurrentUserGuesser) return;
    socket.emit('submit-number-clue', { gameId: lobby.gameId, roundId: activeRound.roundId, promptText: activeRound.chosenCategory, clueText: clueText.trim() });
    setClueText('');
  }

  function submitGuess() {
    if (!socket || !activeRound || !lobby || !guessInput.trim() || !roundIsLive) return;
    setIsBusy(true);
    socket.emit('make-guess', { roundId: activeRound.roundId, guess: guessInput.trim(), gameId: lobby.gameId });
  }

  function endGame() {
    if (!socket || !lobby) return;
    setIsBusy(true);
    socket.emit('end-game', { gameId: lobby.gameId });
  }

  /* ── Solo number game ── */

  async function startSoloGame() {
    const secret = Math.floor(Math.random() * 11);
    let allCategories = [...NUMBER_CATEGORY_SUGGESTIONS];
    try {
      const res = await fetch(`${DEFAULT_API_URL}/api/categories`);
      if (res.ok) {
        const custom: NumberCategorySuggestion[] = await res.json();
        const builtInPrompts = new Set(NUMBER_CATEGORY_SUGGESTIONS.map(c => c.prompt.toLowerCase()));
        const filtered = custom.filter(c => !builtInPrompts.has(c.prompt.toLowerCase()) && c.examples.length > 0);
        allCategories = [...allCategories, ...filtered];
      }
    } catch { /* use built-in only */ }
    const cats = pickRandom(allCategories, 10);
    setSoloSecretNumber(secret);
    setSoloCategories(cats);
    setSoloClues([]);
    setSoloGuess('');
    setSoloResult(null);
    setScreen('solo-number');
    setStatusMessage('Pick 3 categories to get clues from the computer, then guess the number.');
  }

  function pickSoloCategory(cat: NumberCategorySuggestion) {
    if (soloClues.length >= 3 || soloSecretNumber === null) return;
    if (soloClues.some((c) => c.category === cat.prompt)) return;
    const clue = generateComputerClue(soloSecretNumber, cat);
    setSoloClues((cur) => [...cur, { category: cat.prompt, clue }]);
    if (soloClues.length + 1 >= 3) {
      setStatusMessage('All 3 clues received. Make your guess!');
    }
  }

  function submitSoloGuess() {
    if (soloSecretNumber === null || !soloGuess.trim()) return;
    const guessed = parseInt(soloGuess, 10);
    if (isNaN(guessed) || guessed < 0 || guessed > 10) { setErrorMessage('Enter a number from 0 to 10.'); return; }
    setSoloResult({ isCorrect: guessed === soloSecretNumber, secretNumber: soloSecretNumber });
    setStatusMessage(guessed === soloSecretNumber ? `Correct! The number was ${soloSecretNumber}.` : `Wrong! You guessed ${guessed}, but it was ${soloSecretNumber}.`);
  }

  function replaySolo() {
    startSoloGame();
  }

  /* ── Render: Landing ── */

  function renderLandingScreen() {
    return (
      <section className="landing-screen landing-screen-home">
        <h1 className="landing-title">Guess?</h1>
        <div className="landing-choices">
          <button className="landing-card landing-card-menu" onClick={() => window.open('https://www.guessthemenu.com', '_blank', 'noopener,noreferrer')}>
            <span className="landing-card-icon">&#127860;</span>
            <span className="landing-card-label">The Menu</span>
          </button>
          <button className="landing-card landing-card-person" onClick={() => chooseGameType('guess_person')}>
            <span className="landing-card-icon">&#128100;</span>
            <span className="landing-card-label">The Person</span>
          </button>
          <button className="landing-card landing-card-number" onClick={() => chooseGameType('guess_number')}>
            <span className="landing-card-icon">#</span>
            <span className="landing-card-label">The Number</span>
          </button>
        </div>
        {joinCode && (
          <button className="invite-banner" onClick={() => {
            if (inviteGameType) setSelectedGameType(inviteGameType);
            if (inviteGameType === 'guess_person') {
              setScreen('contact-import');
            } else {
              setScreen('profile');
              setStatusMessage('');
            }
          }}>
            <span className="invite-banner-icon">&#128279;</span>
            <span className="invite-banner-text">You've been invited to <strong>{inviteGameType ? getGameLabel(inviteGameType) : 'a game'}</strong></span>
            <span className="invite-banner-action">Join &rarr;</span>
          </button>
        )}
      </section>
    );
  }

  /* ── Render: Contact Import ── */

  function renderContactImportScreen() {
    return (
      <section className="panel stack-panel screen-panel screen-panel-contact">
        <button className="btn-back" onClick={goHome}>&larr; Back</button>
        <h2>Add Contacts</h2>

        {Capacitor.isNativePlatform() ? (
          <button onClick={importContacts} className="btn btn-primary" disabled={isBusy}>
            {isBusy ? 'Importing...' : 'Import Contacts'}
          </button>
        ) : (
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
                <button onClick={addManualContact} className="btn btn-secondary" disabled={!manualContactInput.trim()}>Add</button>
              </div>
            </label>
            {contacts.length > 0 && (
              <div className="contact-chip-list">
                {contacts.map((c) => (
                  <button key={c.name || c.displayName} className="removable-chip" onClick={() => removeManualContact(c.name || c.displayName || '')}>
                    {c.name || c.displayName} &#10005;
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setScreen('profile'); setStatusMessage(`${contacts.length} contacts ready.`); }}
              className="btn btn-primary"
              disabled={contacts.length < 2}
            >
              Continue with {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
            </button>
            {contacts.length < 2 && contacts.length > 0 && (
              <p className="helper-text">Add at least 2 contacts to play.</p>
            )}
          </div>
        )}
      </section>
    );
  }

  /* ── Render: Number Mode Choice ── */

  function renderNumberModeScreen() {
    return (
      <section className="landing-screen landing-screen-mode">
        <button className="btn-back" onClick={goHome}>&larr; Back</button>
        <h2 className="mode-title">Guess the Number</h2>
        <p className="landing-subtitle">How do you want to play?</p>
        <div className="landing-choices">
          <button className="landing-card landing-card-solo" onClick={() => {
            setSoloMode(true);
            setScreen('profile'); setStatusMessage('');
          }}>
            <span className="landing-card-icon">&#129302;</span>
            <span className="landing-card-label">Solo</span>
            <span className="landing-card-desc">Play against the computer</span>
          </button>
          <button className="landing-card landing-card-multi" onClick={() => {
            setSoloMode(false);
            setScreen('profile'); setStatusMessage('');
          }}>
            <span className="landing-card-icon">&#128101;</span>
            <span className="landing-card-label">Play with Friends</span>
            <span className="landing-card-desc">Create a lobby and share the link</span>
          </button>
        </div>
      </section>
    );
  }

  /* ── Render: Profile ── */

  function renderProfileScreen() {
    const isPersonMode = currentGameType === 'guess_person';
    const canContinue = username.trim().length > 0;

    function handleContinue() {
      if (soloMode && selectedGameType === 'guess_number') {
        startSoloGame();
      } else if (joinCode.trim()) {
        registerForLobby('join');
      } else {
        setScreen('lobby-choice');
        setStatusMessage('Host a new game or join an existing one.');
      }
    }

    const hasInvite = !!joinCode.trim();
    const backTarget = hasInvite ? 'landing' : (isPersonMode ? 'contact-import' : 'number-mode');

    return (
      <section className="panel stack-panel screen-panel screen-panel-profile">
        <button className="btn-back" onClick={() => setScreen(backTarget)}>&larr; Back</button>
        <div>
          <h2>What's your name?</h2>
        </div>
        <label className="field">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" placeholder="Your name..." onKeyDown={(e) => e.key === 'Enter' && canContinue && handleContinue()} />
        </label>
        <button onClick={handleContinue} className="btn btn-primary" disabled={!canContinue}>
          {soloMode ? 'Start Solo Game' : hasInvite ? 'Join Lobby' : 'Continue'}
        </button>
      </section>
    );
  }

  /* ── Render: Lobby Choice ── */

  function renderLobbyChoiceScreen() {
    return (
      <section className="panel split-panel screen-panel screen-panel-lobby-choice">
        <div className="card-section">
          <span className="eyebrow">Host {getGameLabel(currentGameType)}</span>
          <h2>Create a new lobby</h2>
          <p>{getGameTagline(currentGameType)}</p>
          <div className="toggle-row">
            <button className={`chip ${isTeamMode ? 'chip-active' : ''}`} onClick={() => setIsTeamMode(true)}>Team Mode</button>
            <button className={`chip ${!isTeamMode ? 'chip-active' : ''}`} onClick={() => setIsTeamMode(false)}>Free for All</button>
          </div>
          <label className="field">
            <span>Rounds</span>
            <input className="input" type="number" min={1} max={10} value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value) || 1)} />
          </label>
          <button onClick={() => registerForLobby('create')} className="btn btn-primary" disabled={isBusy || connectionState !== 'connected'}>
            {isBusy && pendingAction === 'create' ? 'Creating...' : 'Create Lobby'}
          </button>
        </div>
        <div className="card-section muted-card">
          <span className="eyebrow">Join A Match</span>
          <h2>Enter a lobby code</h2>
          <p>Paste a lobby code from an invite link.</p>
          <label className="field">
            <span>Lobby code</span>
            <input className="input" value={joinCode} onChange={(e) => setJoinCode(extractGameCode(e.target.value))} placeholder="Paste code or invite link..." />
          </label>
          <button onClick={() => registerForLobby('join')} className="btn btn-secondary" disabled={isBusy || connectionState !== 'connected'}>
            {isBusy && pendingAction === 'join' ? 'Joining...' : 'Join Lobby'}
          </button>
        </div>
      </section>
    );
  }

  /* ── Render: Lobby ── */

  function renderLobbyScreen() {
    if (!lobby) return null;
    return (
      <section className="layout-grid screen-panel screen-panel-lobby">
        <div className="panel invite-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Lobby Invite</span>
              <h2>{getGameLabel(lobby.gameType)}</h2>
            </div>
            <span className="pill">Code: {lobby.gameId}</span>
          </div>
          <p>Share this link with players. Anyone with the link can join directly.</p>
          <div className="share-box">
            <input className="input share-input" readOnly value={inviteUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
            <div className="inline-actions compact-actions">
              <button onClick={shareInvite} className="btn btn-primary">Share</button>
              <button onClick={copyInviteLink} className="btn btn-secondary">Copy Link</button>
            </div>
            {shareState && <p className="helper-text">{shareState}</p>}
          </div>
        </div>

        <div className="panel players-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Players</span>
              <h2>{lobby.players.length} in lobby</h2>
            </div>
            <span className="pill accent-pill">{lobby.isTeamMode ? 'Team mode' : 'Free for all'}</span>
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
                    {DEFAULT_TEAM_NAMES.map((tn) => (
                      <button key={tn} className={`chip ${teamAssignments[player.user_id] === tn ? 'chip-active' : ''}`} onClick={() => assignTeam(player.user_id, tn)}>{tn}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {teams.length > 0 && <TeamDisplay teams={teams} />}
          <div className="inline-actions compact-actions">
            <button onClick={startGame} className="btn btn-primary" disabled={userId !== lobby.hostId || !canStartGame || isBusy}>
              {isBusy ? 'Starting...' : 'Start Game'}
            </button>
            {userId !== lobby.hostId && <p className="helper-text">Only the host can start.</p>}
          </div>
        </div>
      </section>
    );
  }

  /* ── Render: Solo Number Game ── */

  function renderSoloNumberScreen() {
    return (
      <section className="panel stack-panel solo-panel screen-panel screen-panel-solo">
        <button className="btn-back" onClick={goHome}>&larr; New Game</button>
        <div>
          <span className="eyebrow">Solo Mode</span>
          <h2>Guess the Number</h2>
          <p>The computer picked a secret number from 0 to 10. Pick 3 categories to get clues, then make your guess.</p>
        </div>

        {!soloResult && (
          <>
            <div className="solo-categories">
              <h3>Pick a category ({soloClues.length}/3)</h3>
              <div className="suggestion-grid">
                {soloCategories.map((cat) => {
                  const used = soloClues.some((c) => c.category === cat.prompt);
                  return (
                    <button
                      key={cat.prompt}
                      className={`suggestion-chip ${used ? 'suggestion-chip-used' : ''}`}
                      onClick={() => pickSoloCategory(cat)}
                      disabled={used || soloClues.length >= 3}
                    >
                      <strong>{cat.prompt}</strong>
                      <span>{cat.examples.join(' \u00B7 ')}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {soloClues.length > 0 && (
              <div className="solo-clues">
                <h3>Clues from the computer</h3>
                <div className="question-log">
                  {soloClues.map((c, i) => (
                    <div key={i} className="question-item clue-item">
                      <div>
                        <strong>{c.category}</strong>
                        <p>{c.clue}</p>
                      </div>
                      <span className="pill">#{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {soloClues.length >= 3 && (
              <div className="solo-guess-area">
                <label className="field">
                  <span>Your guess (0-10)</span>
                  <input className="input" value={soloGuess} onChange={(e) => setSoloGuess(e.target.value)} inputMode="numeric" placeholder="0-10" onKeyDown={(e) => e.key === 'Enter' && submitSoloGuess()} />
                </label>
                <button onClick={submitSoloGuess} className="btn btn-primary" disabled={!soloGuess.trim()}>Submit Guess</button>
              </div>
            )}
          </>
        )}

        {soloResult && (
          <div className={`result-card ${soloResult.isCorrect ? 'result-success' : 'result-fail'}`}>
            <strong>{soloResult.isCorrect ? 'Correct!' : 'Wrong!'}</strong>
            <p>The secret number was <strong>{soloResult.secretNumber}</strong>.</p>
            {soloClues.length > 0 && (
              <div className="solo-clue-recap">
                {soloClues.map((c, i) => (
                  <span key={i} className="pill">{c.category}: {c.clue}</span>
                ))}
              </div>
            )}
            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button onClick={replaySolo} className="btn btn-primary">Play Again</button>
              <button onClick={goHome} className="btn btn-secondary">Home</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  /* ── Render: Shared game components ── */

  function renderQuestionCard(placeholder: string) {
    const isPersonGame = currentGameType === 'guess_person';
    const askedQuestions = new Set(questionFeed.map((q) => q.questionText.toLowerCase()));
    const suggestions = isPersonGame
      ? PERSON_QUESTION_SUGGESTIONS.filter((q) => !askedQuestions.has(q.toLowerCase()))
      : [];
    // In person mode: only the guesser asks questions, others answer. In number mode: original behavior.
    const canAskQuestions = isPersonGame ? isCurrentUserGuesser : true;
    const canAnswerQuestions = isPersonGame ? !isCurrentUserGuesser : true;
    return (
      <div className="round-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Questions</span>
            <h2>{isPersonGame
              ? (isCurrentUserGuesser ? 'Ask your questions' : 'Answer the questions')
              : 'Up to 3 questions'}</h2>
          </div>
        </div>
        <QuestionCounter totalQuestions={questionFeed.length} timeLimit={isPersonGame ? 120 : 90} onTimeUp={() => setStatusMessage('Timer expired.')} isActive={roundIsLive} />
        {canAskQuestions && (
          <>
            {suggestions.length > 0 && roundIsLive && questionFeed.length < questionLimit && (
              <div className="suggestion-chips">
                {suggestions.map((q) => (
                  <button key={q} className="suggestion-chip" onClick={() => setQuestionText(q)}>{q}</button>
                ))}
              </div>
            )}
            <label className="field">
              <span>Question</span>
              <input className="input" value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder={placeholder} disabled={!roundIsLive || questionFeed.length >= questionLimit} />
            </label>
          </>
        )}
        {isPersonGame && canAskQuestions && (
          <div className="inline-actions compact-actions">
            <button onClick={() => recordQuestion(undefined)} className="btn btn-primary" disabled={!roundIsLive || !questionText.trim() || questionFeed.length >= questionLimit}>Ask</button>
          </div>
        )}
        {!isPersonGame && (
          <div className="inline-actions compact-actions">
            <button onClick={() => recordQuestion(true)} className="btn btn-primary" disabled={!roundIsLive || !questionText.trim() || questionFeed.length >= questionLimit}>Yes</button>
            <button onClick={() => recordQuestion(false)} className="btn btn-secondary" disabled={!roundIsLive || !questionText.trim() || questionFeed.length >= questionLimit}>No</button>
          </div>
        )}
        <div className="question-log">
          {questionFeed.length === 0 && <p className="helper-text">{canAskQuestions ? 'No questions yet.' : 'Waiting for questions from the guesser...'}</p>}
          {questionFeed.map((e, i) => (
            <div key={`${e.questionNumber}-${e.questionText}`} className="question-item">
              <div><strong>Q{e.questionNumber}</strong><p>{e.questionText}</p></div>
              <div className="question-answer-block">
                {e.answer !== undefined ? (
                  <>
                    <span className={`pill ${e.answer ? 'answer-yes' : 'answer-no'}`}>{e.answer ? 'Yes' : 'No'}</span>
                    <span className="helper-text">{e.askerUsername}</span>
                  </>
                ) : isPersonGame && canAnswerQuestions && i === questionFeed.length - 1 ? (
                  <div className="inline-actions compact-actions">
                    <button onClick={() => answerQuestion(e.questionNumber, true)} className="btn btn-primary btn-sm">Yes</button>
                    <button onClick={() => answerQuestion(e.questionNumber, false)} className="btn btn-secondary btn-sm">No</button>
                  </div>
                ) : (
                  <span className="pill">Waiting...</span>
                )}
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
            <h2>{currentGameType === 'guess_number' ? 'Submit the number' : 'Submit the name'}</h2>
          </div>
        </div>
        {isCurrentUserGuesser ? (
          <>
            <label className="field">
              <span>Your guess</span>
              <input className="input" value={guessInput} onChange={(e) => setGuessInput(e.target.value)} placeholder={placeholder} disabled={!roundIsLive} inputMode={currentGameType === 'guess_number' ? 'numeric' : 'text'} />
            </label>
            <button onClick={submitGuess} className="btn btn-primary" disabled={!roundIsLive || !guessInput.trim() || isBusy}>
              Submit Guess
            </button>
          </>
        ) : (
          <p className="helper-text">Only the guesser can submit.</p>
        )}
        {latestGuessResult && (
          <div className={`result-card ${latestGuessResult.isCorrect ? 'result-success' : 'result-fail'}`}>
            <strong>{latestGuessResult.isCorrect ? 'Correct!' : 'Wrong!'}</strong>
            <p>
              {latestGuessResult.gameType === 'guess_number'
                ? `${latestGuessResult.guesserUsername} guessed ${latestGuessResult.guessedNumber}. Answer: ${latestGuessResult.targetNumber}.`
                : `${latestGuessResult.guesserUsername} guessed ${latestGuessResult.guessedName}. Answer: ${latestGuessResult.targetName}.`}
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ── Render: Person Game ── */

  function renderPersonGameScreen() {
    return (
      <>
        <div className="summary-strip">
          <div><strong>{gameSummary?.players.length || 0}</strong><span>Players</span></div>
          <div><strong>{gameSummary?.mutualContacts.length || 0}</strong><span>Mutual contacts</span></div>
          <div><strong>{lobby?.totalRounds || totalRounds}</strong><span>Rounds</span></div>
        </div>
        <div className="round-layout">
          <div className="round-column">
            <div className="round-card">
              <div className="panel-heading">
                <div><span className="eyebrow">Round Setup</span><h2>{activeRound ? `Round ${activeRound.roundNumber}` : 'Next round'}</h2></div>
                {isCurrentUserHost && <span className="pill">Host</span>}
              </div>
              <div className="round-controls">
                <label className="field">
                  <span>Guesser</span>
                  <select className="input" value={selectedGuesserId} onChange={(e) => setSelectedGuesserId(e.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                    {playersInGame.map((p) => <option key={p.user_id} value={p.user_id}>{p.username}</option>)}
                  </select>
                </label>
                {!isCurrentUserGuesser && (
                  <label className="field">
                    <span>Target contact</span>
                    <select className="input" value={selectedTargetName} onChange={(e) => setSelectedTargetName(e.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                      {mutualContactNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="inline-actions compact-actions">
                <button onClick={startRound} className="btn btn-primary" disabled={!isCurrentUserHost || !canLaunchRound}>
                  {activeRound && latestGuessResult ? 'Next Round' : 'Start Round'}
                </button>
                <button onClick={endGame} className="btn btn-secondary" disabled={!isCurrentUserHost || isBusy}>End Game</button>
              </div>
            </div>
            <div className="round-card">
              <span className="eyebrow">Target</span>
              <div className={`target-card ${isCurrentUserGuesser ? 'target-card-blurred' : 'target-card-live'}`}>
                {isCurrentUserGuesser ? 'Hidden from you' : (revealedTargetName || 'Waiting...')}
              </div>
            </div>
          </div>
          <div className="round-column">
            {renderQuestionCard('Is this person from college?')}
            {renderGuessCard('Type the contact name')}
          </div>
        </div>
      </>
    );
  }

  /* ── Render: Number Game ── */

  function renderNumberGameScreen() {
    const isNonGuesser = !!userId && !!activeRound && activeRound.guesserUserId !== userId;
    const isCategoryPicker = isNonGuesser && (
      activeRound!.categoryPickerUserId === userId ||
      (!activeRound!.categoryPickerUserId && activeRound!.responderOrder.length <= 1)
    );
    const categoryPickerName = activeRound?.responderOrder.find((r) => r.user_id === activeRound?.categoryPickerUserId)?.username || (activeRound?.responderOrder[0]?.username) || 'Someone';
    const totalSlots = activeRound?.totalClueSlots || 3;
    const allCluesIn = activeRound?.cluePhaseComplete || false;
    const usedCategories = new Set(numberClues.map(c => c.prompt_text.toLowerCase()));
    const availableSuggestions = activeSuggestions.filter(s => !usedCategories.has(s.prompt.toLowerCase()));
    const sortedScores = [...playerScores].sort((a, b) => b.score - a.score);

    return (
      <>
        {/* Scoreboard */}
        <div className="summary-strip">
          {sortedScores.map((p) => (
            <div key={p.user_id}><strong>{p.score}</strong><span>{p.username}</span></div>
          ))}
          <div><strong>{activeRound ? `R${activeRound.roundNumber}` : '-'}</strong><span>Round</span></div>
        </div>
        <div className="round-layout">
          <div className="round-column">
            {/* Round Setup */}
            <div className="round-card">
              <div className="panel-heading">
                <div><span className="eyebrow">Round Setup</span><h2>{activeRound ? `Round ${activeRound.roundNumber}` : 'Next guesser'}</h2></div>
                {isCurrentUserHost && <span className="pill">Host</span>}
              </div>
              <div className="round-controls round-controls-single">
                <label className="field">
                  <span>Guesser</span>
                  <select className="input" value={selectedGuesserId} onChange={(e) => setSelectedGuesserId(e.target.value)} disabled={!isCurrentUserHost || roundIsLive}>
                    {playersInGame.map((p) => <option key={p.user_id} value={p.user_id}>{p.username}</option>)}
                  </select>
                </label>
              </div>
              <div className="inline-actions compact-actions">
                <button onClick={startRound} className="btn btn-primary" disabled={!isCurrentUserHost || !canLaunchRound}>
                  {activeRound && latestGuessResult ? 'Next Round' : 'Start Game'}
                </button>
                <button onClick={endGame} className="btn btn-secondary" disabled={!isCurrentUserHost || isBusy}>End Game</button>
              </div>
            </div>

            {/* Secret Number - hidden from guesser */}
            <div className="round-card">
              <span className="eyebrow">Secret Number</span>
              <div className={`target-card ${!isCurrentUserGuesser && revealedSecretNumber !== null ? 'target-card-live' : 'target-card-blurred'}`}>
                {!activeRound ? 'Waiting for round' : isCurrentUserGuesser ? 'Hidden from you' : revealedSecretNumber !== null ? revealedSecretNumber : 'Waiting...'}
              </div>
            </div>
          </div>

          <div className="round-column">
            {/* Category Picker — current clue-giver picks */}
            {activeRound && !activeRound.chosenCategory && isCategoryPicker && !allCluesIn && roundIsLive && (
              <div className="round-card">
                <div className="panel-heading">
                  <div><span className="eyebrow">Clue {numberClues.length + 1} of {totalSlots}</span><h2>Pick a category</h2></div>
                </div>
                <div className="suggestion-grid">
                  {availableSuggestions.map((s) => (
                    <button key={s.prompt} className="suggestion-chip" onClick={() => pickCategory(s.prompt)}>
                      <strong>{s.prompt}</strong><span>{s.examples.join(' \u00B7 ')}</span>
                    </button>
                  ))}
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Or type your own</span>
                  <div className="inline-actions compact-actions">
                    <input className="input" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="Custom category..." onKeyDown={(e) => e.key === 'Enter' && customPrompt.trim() && pickCategory(customPrompt.trim())} />
                    <button className="btn btn-primary" disabled={!customPrompt.trim()} onClick={() => { pickCategory(customPrompt.trim()); setCustomPrompt(''); }}>Pick</button>
                  </div>
                </label>
              </div>
            )}

            {/* Waiting for category pick — guesser and other players */}
            {activeRound && !activeRound.chosenCategory && !isCategoryPicker && !allCluesIn && roundIsLive && (
              <div className="round-card">
                <div className="panel-heading"><div><span className="eyebrow">Clue {numberClues.length + 1} of {totalSlots}</span><h2>Waiting...</h2></div></div>
                <p className="helper-text">{isCurrentUserGuesser ? `${categoryPickerName} is choosing a category.` : `${categoryPickerName} is picking the category.`}</p>
              </div>
            )}

            {/* Category chosen — current clue-giver submits clue */}
            {activeRound && activeRound.chosenCategory && isCategoryPicker && !allCluesIn && roundIsLive && (
              <div className="round-card">
                <div className="panel-heading">
                  <div><span className="eyebrow">Clue {numberClues.length + 1} of {totalSlots}</span><h2>{activeRound.chosenCategory}</h2></div>
                  <span className="pill">Your turn</span>
                </div>
                <p className="helper-text">The secret number is <strong>{revealedSecretNumber}</strong>. Give a clue for &ldquo;{activeRound.chosenCategory}&rdquo; that hints at this number (0&nbsp;=&nbsp;low, 10&nbsp;=&nbsp;high).</p>
                <label className="field">
                  <span>Your clue</span>
                  <input className="input" value={clueText} onChange={(e) => setClueText(e.target.value)} placeholder="Type your clue..." onKeyDown={(e) => e.key === 'Enter' && clueText.trim() && submitNumberClue()} />
                </label>
                <button onClick={submitNumberClue} className="btn btn-primary" disabled={!clueText.trim()}>Submit Clue</button>
              </div>
            )}

            {/* Category chosen — others waiting for clue */}
            {activeRound && activeRound.chosenCategory && !isCategoryPicker && !allCluesIn && roundIsLive && (
              <div className="round-card">
                <div className="panel-heading"><div><span className="eyebrow">Clue {numberClues.length + 1} of {totalSlots}</span><h2>{activeRound.chosenCategory}</h2></div></div>
                <p className="helper-text">{categoryPickerName} is writing a clue...</p>
              </div>
            )}

            {/* Live clue feed */}
            <div className="round-card">
              <div className="panel-heading">
                <div><span className="eyebrow">Clues</span><h2>Category clues</h2></div>
                {activeRound && <span className="pill">{numberClues.length}/{totalSlots}</span>}
              </div>
              <div className="question-log">
                {numberClues.length === 0 && <p className="helper-text">{activeRound ? 'Clues will appear here...' : 'Start a round to begin.'}</p>}
                {numberClues.map((c) => (
                  <div key={c.id} className="question-item clue-item">
                    <div><strong>{c.prompt_text}</strong></div>
                    <div className="question-answer-block">
                      <span className="pill">{c.clue_text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Guess card — guesser only */}
            {renderGuessCard('Number from 0 to 10')}

            {/* Result */}
            {latestGuessResult && (
              <div className={`round-card ${latestGuessResult.isCorrect ? 'result-success' : 'result-fail'}`}>
                <strong>{latestGuessResult.isCorrect ? 'Correct!' : 'Wrong!'}</strong>
                <p>
                  {`${latestGuessResult.guesserUsername} guessed ${latestGuessResult.guessedNumber}. The answer was ${latestGuessResult.targetNumber}.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  /* ── Render: Playing ── */

  function renderPlayingScreen() {
    return (
      <section className="panel stack-panel play-panel screen-panel screen-panel-playing">
        <div>
          <span className="eyebrow">Live Match</span>
          <h2>{getGameLabel(currentGameType)}</h2>
        </div>
        {gameSummary?.isTeamMode && displayTeams.length > 0 && <TeamDisplay teams={displayTeams} />}
        {currentGameType === 'guess_number' ? renderNumberGameScreen() : renderPersonGameScreen()}
        {finalScores && (
          <div className="round-card">
            <div className="panel-heading"><div><span className="eyebrow">Final Scores</span><h2>Scoreboard</h2></div></div>
            <div className="score-list">
              {finalScores.map((p) => (<div key={p.user_id} className="score-row"><span>{p.username}</span><strong>{p.score}</strong></div>))}
            </div>
            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button onClick={goHome} className="btn btn-primary">New Game</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  /* ── Main Render ── */

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left"></div>
      <div className="background-glow background-glow-right"></div>

      {screen !== 'landing' && (
        <header className="topbar">
          <div>
            <h1 className="title" style={{ cursor: 'pointer' }} onClick={goHome}>Guess?</h1>
          </div>
          <div className="status-cluster">
            <span className={`connection-pill connection-${connectionState}`}>{connectionState}</span>
            {currentGameType && <span className="code-pill">{getGameLabel(currentGameType)}</span>}
            {gameCode && <span className="code-pill">Lobby {gameCode}</span>}
          </div>
        </header>
      )}

      <main className="app-main">
        {statusMessage && screen !== 'landing' && (
          <section className="status-banner">
            <p>{statusMessage}</p>
            {errorMessage && <span className="error-banner">{errorMessage}</span>}
          </section>
        )}

        {screen === 'landing' && renderLandingScreen()}
        {screen === 'contact-import' && renderContactImportScreen()}
        {screen === 'profile' && renderProfileScreen()}
        {screen === 'number-mode' && renderNumberModeScreen()}
        {screen === 'lobby-choice' && renderLobbyChoiceScreen()}
        {screen === 'lobby' && renderLobbyScreen()}
        {screen === 'playing' && renderPlayingScreen()}
        {screen === 'solo-number' && renderSoloNumberScreen()}
      </main>
    </div>
  );
}
