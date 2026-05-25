import prisma from '../lib/prisma.js';
import { signAuthToken } from '../utils/authToken.js';

/**
 * Handle OAuth callback and user creation/login
 */
export async function handleOAuthCallback(
  provider,
  providerId,
  email,
  name,
  avatarUrl = null
) {
  try {
    // Check if user exists by OAuth provider
    let user = await prisma.user.findFirst({
      where: {
        AND: [
          { oauthProvider: provider },
          { oauthId: providerId }
        ]
      }
    });

    // If not found by provider, check by email
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email }
      });

      if (user) {
        // Link OAuth to existing email account
        user = await prisma.user.update({
          where: { email },
          data: {
            oauthProvider: provider,
            oauthId: providerId,
            avatarUrl: avatarUrl || user.avatarUrl
          }
        });
      }
    }

    // Create new user if doesn't exist
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          oauthProvider: provider,
          oauthId: providerId,
          avatarUrl,
          passwordHash: null // OAuth users don't have passwords
        }
      });
    }

    const token = signAuthToken(user);

    return {
      user,
      token,
      isNewUser: !user.oauthProvider || user.passwordHash === null
    };
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error.message);
    throw error;
  }
}

/**
 * Exchange OAuth authorization code for user info
 */
export async function exchangeGitHubCode(code) {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(`GitHub token error: ${tokenData.error_description}`);
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    const githubUser = await userResponse.json();

    if (!githubUser.id) {
      throw new Error('Failed to get GitHub user info');
    }

    return {
      providerId: githubUser.id.toString(),
      email: githubUser.email || `${githubUser.login}@github.local`,
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url
    };
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    throw error;
  }
}

/**
 * Exchange Google authorization code for user info
 */
export async function exchangeGoogleCode(code) {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.GOOGLE_REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(`Google token error: ${tokenData.error_description}`);
    }

    // Get user info from Google
    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const googleUser = await userResponse.json();

    if (!googleUser.id) {
      throw new Error('Failed to get Google user info');
    }

    return {
      providerId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.picture
    };
  } catch (error) {
    console.error('Google OAuth error:', error.message);
    throw error;
  }
}
