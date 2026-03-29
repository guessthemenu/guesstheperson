const assert = require('assert/strict');
const { randomUUID } = require('crypto');
const { Client } = require('pg');
const { io } = require('socket.io-client');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3100';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'guesstheperson',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'guesstheperson',
};

function waitForEvent(socket, event, predicate = () => true, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);

    const onEvent = (payload) => {
      try {
        if (!predicate(payload)) return;
        cleanup();
        resolve(payload);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const onError = (payload) => {
      cleanup();
      reject(new Error(payload?.message || `Socket error while waiting for ${event}`));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off('error', onError);
    }

    socket.on(event, onEvent);
    socket.on('error', onError);
  });
}

async function createPlayer(username, contacts = []) {
  const socket = io(API_URL, { transports: ['websocket'] });
  await waitForEvent(socket, 'connect');

  const created = waitForEvent(socket, 'user-created');
  socket.emit('join-game', { username, contacts });
  const user = await created;

  return {
    socket,
    userId: user.userId,
    username: user.username,
  };
}

async function runContactsFlow(suffix, createdGameIds) {
  const mutualName = `Mutual ${suffix}`;
  const playerA = await createPlayer(`contacts-a-${suffix}`, [{ name: mutualName }, { name: `Only A ${suffix}` }]);
  const playerB = await createPlayer(`contacts-b-${suffix}`, [{ name: mutualName }, { name: `Only B ${suffix}` }]);

  try {
    const gameCreated = waitForEvent(playerA.socket, 'game-created');
    playerA.socket.emit('create-game', {
      gameType: 'guess_person',
      personSource: 'contacts',
      isTeamMode: false,
      totalRounds: 1,
      playerIds: [playerA.userId],
    });
    const game = await gameCreated;
    createdGameIds.push(game.gameId);

    const joined = waitForEvent(playerB.socket, 'lobby-joined');
    const lobbyA = waitForEvent(playerA.socket, 'lobby-updated', (payload) => payload.gameId === game.gameId && payload.players.length === 2);
    const lobbyB = waitForEvent(playerB.socket, 'lobby-updated', (payload) => payload.gameId === game.gameId && payload.players.length === 2);
    playerB.socket.emit('join-lobby', { gameId: game.gameId });
    await joined;
    await Promise.all([lobbyA, lobbyB]);

    const startedA = waitForEvent(playerA.socket, 'game-started');
    const startedB = waitForEvent(playerB.socket, 'game-started');
    playerA.socket.emit('start-game', { gameId: game.gameId });
    const [gameA] = await Promise.all([startedA, startedB]);
    assert.equal(gameA.personSource, 'contacts');
    assert.ok(gameA.mutualContacts.some((item) => (item.name || item.contact_name) === mutualName), 'contacts mutual contact missing');

    const roundA = waitForEvent(playerA.socket, 'round-started');
    const roundB = waitForEvent(playerB.socket, 'round-started');
    const targetB = waitForEvent(playerB.socket, 'your-target', (payload) => payload.targetName === mutualName);
    playerA.socket.emit('start-round', {
      gameId: game.gameId,
      targetContact: mutualName,
      guesserUserId: playerA.userId,
    });
    const round = await roundA;
    await Promise.all([roundB, targetB]);

    const pendingA = waitForEvent(playerA.socket, 'question-pending', (payload) => payload.questionText === 'Do they know both of us?');
    const pendingB = waitForEvent(playerB.socket, 'question-pending', (payload) => payload.questionText === 'Do they know both of us?');
    playerA.socket.emit('ask-question', {
      roundId: round.roundId,
      questionNumber: 1,
      questionText: 'Do they know both of us?',
    });
    await Promise.all([pendingA, pendingB]);

    const answeredA = waitForEvent(playerA.socket, 'question-answered', (payload) => payload.questionText === 'Do they know both of us?' && payload.answer === true);
    const answeredB = waitForEvent(playerB.socket, 'question-answered', (payload) => payload.questionText === 'Do they know both of us?' && payload.answer === true);
    playerB.socket.emit('answer-question', {
      roundId: round.roundId,
      questionNumber: 1,
      questionText: 'Do they know both of us?',
      answer: true,
      askerUsername: playerA.username,
    });
    await Promise.all([answeredA, answeredB]);

    const guessA = waitForEvent(playerA.socket, 'guess-result', (payload) => payload.targetName === mutualName);
    const guessB = waitForEvent(playerB.socket, 'guess-result', (payload) => payload.targetName === mutualName);
    playerA.socket.emit('make-guess', { roundId: round.roundId, guess: mutualName, gameId: game.gameId });
    const [guess] = await Promise.all([guessA, guessB]);
    assert.equal(guess.isCorrect, true, 'contacts guess should be correct');
  } finally {
    playerA.socket.disconnect();
    playerB.socket.disconnect();
  }
}

async function runFacebookFlow(suffix, createdGameIds) {
  const db = new Client(DB_CONFIG);
  await db.connect();

  let host;
  let guest;
  let targetUserId;

  try {
    const hostName = `facebook-a-${suffix}`;
    const guestName = `facebook-b-${suffix}`;
    const targetName = `facebook-target-${suffix}`;

    host = await createPlayer(hostName);
    guest = await createPlayer(guestName);
    targetUserId = randomUUID();

    await db.query(
      `INSERT INTO users (id, username)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING`,
      [targetUserId, targetName]
    );

    const facebookRows = [
      [host.userId, `fb-host-${suffix}`, hostName, 'token-host'],
      [guest.userId, `fb-guest-${suffix}`, guestName, 'token-guest'],
      [targetUserId, `fb-target-${suffix}`, targetName, 'token-target'],
    ];

    for (const row of facebookRows) {
      await db.query(
        `INSERT INTO facebook_accounts (user_id, facebook_user_id, facebook_name, access_token, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           facebook_user_id = EXCLUDED.facebook_user_id,
           facebook_name = EXCLUDED.facebook_name,
           access_token = EXCLUDED.access_token,
           updated_at = CURRENT_TIMESTAMP`,
        row
      );
    }

    await db.query('DELETE FROM facebook_app_friends WHERE user_id = ANY($1)', [[host.userId, guest.userId]]);
    await db.query(
      `INSERT INTO facebook_app_friends (user_id, friend_user_id)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
      [host.userId, targetUserId, guest.userId, targetUserId]
    );

    const status = await fetch(`${API_URL}/api/facebook/status?userId=${encodeURIComponent(host.userId)}`).then((res) => res.json());
    assert.equal(status.connected, true, 'facebook status should report a connected account');
    assert.equal(status.friendCount, 1, 'facebook status should report seeded app friend');

    const gameCreated = waitForEvent(host.socket, 'game-created');
    host.socket.emit('create-game', {
      gameType: 'guess_person',
      personSource: 'facebook',
      isTeamMode: false,
      totalRounds: 1,
      playerIds: [host.userId],
    });
    const game = await gameCreated;
    createdGameIds.push(game.gameId);
    assert.equal(game.personSource, 'facebook');

    const joined = waitForEvent(guest.socket, 'lobby-joined');
    const lobbyA = waitForEvent(host.socket, 'lobby-updated', (payload) => payload.gameId === game.gameId && payload.players.length === 2);
    const lobbyB = waitForEvent(guest.socket, 'lobby-updated', (payload) => payload.gameId === game.gameId && payload.players.length === 2);
    guest.socket.emit('join-lobby', { gameId: game.gameId });
    await joined;
    await Promise.all([lobbyA, lobbyB]);

    const startedA = waitForEvent(host.socket, 'game-started');
    const startedB = waitForEvent(guest.socket, 'game-started');
    host.socket.emit('start-game', { gameId: game.gameId });
    const [gameA] = await Promise.all([startedA, startedB]);
    assert.equal(gameA.personSource, 'facebook');
    assert.ok(gameA.mutualContacts.some((item) => (item.name || item.contact_name) === targetName), 'facebook mutual target missing');

    const roundA = waitForEvent(host.socket, 'round-started');
    const roundB = waitForEvent(guest.socket, 'round-started');
    const targetB = waitForEvent(guest.socket, 'your-target', (payload) => payload.targetName === targetName);
    host.socket.emit('start-round', {
      gameId: game.gameId,
      targetContact: targetName,
      guesserUserId: host.userId,
    });
    const round = await roundA;
    await Promise.all([roundB, targetB]);

    const pendingA = waitForEvent(host.socket, 'question-pending', (payload) => payload.questionText === 'Is this a Facebook mutual?');
    const pendingB = waitForEvent(guest.socket, 'question-pending', (payload) => payload.questionText === 'Is this a Facebook mutual?');
    host.socket.emit('ask-question', {
      roundId: round.roundId,
      questionNumber: 1,
      questionText: 'Is this a Facebook mutual?',
    });
    await Promise.all([pendingA, pendingB]);

    const answeredA = waitForEvent(host.socket, 'question-answered', (payload) => payload.questionText === 'Is this a Facebook mutual?' && payload.answer === true);
    const answeredB = waitForEvent(guest.socket, 'question-answered', (payload) => payload.questionText === 'Is this a Facebook mutual?' && payload.answer === true);
    guest.socket.emit('answer-question', {
      roundId: round.roundId,
      questionNumber: 1,
      questionText: 'Is this a Facebook mutual?',
      answer: true,
      askerUsername: host.username,
    });
    await Promise.all([answeredA, answeredB]);

    const guessA = waitForEvent(host.socket, 'guess-result', (payload) => payload.targetName === targetName);
    const guessB = waitForEvent(guest.socket, 'guess-result', (payload) => payload.targetName === targetName);
    host.socket.emit('make-guess', { roundId: round.roundId, guess: targetName, gameId: game.gameId });
    const [guess] = await Promise.all([guessA, guessB]);
    assert.equal(guess.isCorrect, true, 'facebook guess should be correct');
  } finally {
    if (host) host.socket.disconnect();
    if (guest) guest.socket.disconnect();
    await db.end();
  }
}

async function cleanupTestData(suffix, createdGameIds) {
  const cleanup = new Client(DB_CONFIG);
  await cleanup.connect();
  try {
    if (createdGameIds.length > 0) {
      await cleanup.query('DELETE FROM games WHERE id = ANY($1)', [createdGameIds]);
    }
    await cleanup.query('DELETE FROM users WHERE username = ANY($1)', [[
      `contacts-a-${suffix}`,
      `contacts-b-${suffix}`,
      `facebook-a-${suffix}`,
      `facebook-b-${suffix}`,
      `facebook-target-${suffix}`,
    ]]);
  } finally {
    await cleanup.end();
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const createdGameIds = [];

  await fetch(`${API_URL}/api/health`).then((res) => res.json()).then((payload) => {
    assert.equal(payload.status, 'ok');
  });

  try {
    await runContactsFlow(suffix, createdGameIds);
    await runFacebookFlow(suffix, createdGameIds);
    console.log('Gameplay validation passed for contacts and Facebook mutuals.');
  } finally {
    await cleanupTestData(suffix, createdGameIds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});