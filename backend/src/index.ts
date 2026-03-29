import express from 'express';
import http from 'http';
import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB, pool } from './db';
import { setupSocketHandlers } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const FACEBOOK_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v19.0';
const facebookAuthStates = new Map<string, {
  userId: string;
  platform: 'web' | 'native';
  origin?: string;
  createdAt: number;
}>();

// Middleware
app.use(cors());
app.use(express.json());

function getFacebookConfig() {
  const clientId = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${apiBaseUrl.replace(/\/$/, '')}/api/facebook/auth/callback`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendWebAuthResult(res: express.Response, origin: string, payload: { status: 'success' | 'error'; message: string }) {
  const safeOrigin = escapeHtml(origin || '*');
  const safePayload = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  res.send(`<!doctype html>
<html>
  <body>
    <script>
      (function () {
        const payload = ${safePayload};
        if (window.opener) {
          window.opener.postMessage({ type: 'facebook-auth', ...payload }, ${JSON.stringify(safeOrigin)});
          window.close();
          return;
        }
        document.body.innerText = payload.message;
      }());
    </script>
  </body>
</html>`);
}

async function fetchFacebookJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Facebook request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function upsertFacebookConnection(args: {
  userId: string;
  accessToken: string;
  expiresIn?: number;
  profile: { id: string; name?: string; picture?: { data?: { url?: string } } };
  friends: Array<{ id: string }>;
}) {
  const { userId, accessToken, expiresIn, profile, friends } = args;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  await pool.query(
    `INSERT INTO facebook_accounts (user_id, facebook_user_id, facebook_name, avatar_url, access_token, token_expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       facebook_user_id = EXCLUDED.facebook_user_id,
       facebook_name = EXCLUDED.facebook_name,
       avatar_url = EXCLUDED.avatar_url,
       access_token = EXCLUDED.access_token,
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      profile.id,
      profile.name || null,
      profile.picture?.data?.url || null,
      accessToken,
      expiresAt,
    ]
  );

  await pool.query(
    `UPDATE users
     SET avatar_url = COALESCE($2, avatar_url)
     WHERE id = $1`,
    [userId, profile.picture?.data?.url || null]
  );

  await pool.query('DELETE FROM facebook_app_friends WHERE user_id = $1', [userId]);

  if (friends.length > 0) {
    const friendIds = friends.map((friend) => friend.id);
    const knownUsers = await pool.query(
      `SELECT user_id, facebook_user_id
       FROM facebook_accounts
       WHERE facebook_user_id = ANY($1)`,
      [friendIds]
    );

    for (const row of knownUsers.rows) {
      await pool.query(
        `INSERT INTO facebook_app_friends (user_id, friend_user_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
        [userId, row.user_id]
      );
    }
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Fetch custom categories contributed by players
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT prompt, examples FROM custom_categories ORDER BY usage_count DESC, created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching custom categories:', err);
    res.json([]);
  }
});

app.get('/api/facebook/status', async (req, res) => {
  const userId = String(req.query.userId || '').trim();

  if (!userId) {
    res.status(400).json({ message: 'userId is required' });
    return;
  }

  try {
    const [accountResult, friendCountResult] = await Promise.all([
      pool.query(
        `SELECT facebook_name, avatar_url, updated_at
         FROM facebook_accounts
         WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS friend_count FROM facebook_app_friends WHERE user_id = $1',
        [userId]
      ),
    ]);

    const account = accountResult.rows[0];

    res.json({
      connected: !!account,
      facebookName: account?.facebook_name || null,
      avatarUrl: account?.avatar_url || null,
      friendCount: friendCountResult.rows[0]?.friend_count || 0,
      updatedAt: account?.updated_at ? new Date(account.updated_at).toISOString() : null,
    });
  } catch (err) {
    console.error('Error loading Facebook status:', err);
    res.status(500).json({ message: 'Failed to load Facebook status' });
  }
});

app.get('/api/facebook/auth/start', async (req, res) => {
  const config = getFacebookConfig();
  if (!config) {
    res.status(500).json({ message: 'Facebook auth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.' });
    return;
  }

  const userId = String(req.query.userId || '').trim();
  const platform = req.query.platform === 'native' ? 'native' : 'web';
  const origin = String(req.query.origin || req.headers.origin || 'http://localhost:3001').trim();

  if (!userId) {
    res.status(400).json({ message: 'userId is required' });
    return;
  }

  const state = randomUUID();
  facebookAuthStates.set(state, { userId, platform, origin, createdAt: Date.now() });

  const authUrl = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'public_profile,user_friends');
  authUrl.searchParams.set('state', state);

  res.redirect(authUrl.toString());
});

app.get('/api/facebook/auth/callback', async (req, res) => {
  const config = getFacebookConfig();
  const state = String(req.query.state || '').trim();
  const code = String(req.query.code || '').trim();

  const authState = facebookAuthStates.get(state);
  facebookAuthStates.delete(state);

  if (!config || !authState) {
    res.status(400).send('Facebook auth state is invalid or expired.');
    return;
  }

  const sendNativeRedirect = (status: 'success' | 'error', message: string) => {
    const redirectUrl = new URL('com.guesstheperson.app://facebook-auth');
    redirectUrl.searchParams.set('status', status);
    redirectUrl.searchParams.set('message', message);
    res.redirect(redirectUrl.toString());
  };

  try {
    if (!code) {
      throw new Error('Facebook did not return an authorization code.');
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', config.clientId);
    tokenUrl.searchParams.set('client_secret', config.clientSecret);
    tokenUrl.searchParams.set('redirect_uri', config.redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenData = await fetchFacebookJson<{ access_token: string; expires_in?: number }>(tokenUrl.toString());
    const accessToken = tokenData.access_token;

    const profile = await fetchFacebookJson<{ id: string; name?: string; picture?: { data?: { url?: string } } }>(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me?fields=id,name,picture&access_token=${encodeURIComponent(accessToken)}`
    );

    const friends = await fetchFacebookJson<{ data?: Array<{ id: string }> }>(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/friends?access_token=${encodeURIComponent(accessToken)}`
    );

    await upsertFacebookConnection({
      userId: authState.userId,
      accessToken,
      expiresIn: tokenData.expires_in,
      profile,
      friends: friends.data || [],
    });

    if (authState.platform === 'native') {
      sendNativeRedirect('success', 'Facebook connected.');
      return;
    }

    sendWebAuthResult(res, authState.origin || 'http://localhost:3001', {
      status: 'success',
      message: 'Facebook connected.',
    });
  } catch (err) {
    console.error('Error completing Facebook auth:', err);
    const message = err instanceof Error ? err.message : 'Facebook authentication failed.';

    if (authState.platform === 'native') {
      sendNativeRedirect('error', message);
      return;
    }

    sendWebAuthResult(res, authState.origin || 'http://localhost:3001', {
      status: 'error',
      message,
    });
  }
});

// Initialize database
initDB().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, () => {
  console.log(`🎮 GuessThePerson server running on port ${PORT}`);
});
