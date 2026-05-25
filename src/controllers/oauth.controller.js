import {
  handleOAuthCallback,
  exchangeGoogleCode
} from '../services/oauth.service.js';

export const googleCallback = async (req, res) => {
  try {
    const { code, token } = req.body;

    if (!code && !token) {
      return res.status(400).json({
        error: 'Authorization code or token is required'
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'Google OAuth is not configured'
      });
    }

    let googleUserInfo;

    // If JWT token is provided, decode it directly
    if (token) {
      try {
        // Google JWT tokens have 3 parts: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid token format');
        }
        
        // Decode the payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        googleUserInfo = {
          providerId: payload.sub,
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.picture
        };
      } catch (tokenError) {
        console.error('Token decode error:', tokenError.message);
        return res.status(400).json({
          error: 'Invalid token format'
        });
      }
    } else {
      // Exchange authorization code for token (existing flow)
      googleUserInfo = await exchangeGoogleCode(code);
    }

    // Handle OAuth callback (create/update user)
    const { user, token: authToken, isNewUser } = await handleOAuthCallback(
      'google',
      googleUserInfo.providerId,
      googleUserInfo.email,
      googleUserInfo.name,
      googleUserInfo.avatarUrl
    );

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role
      },
      token: authToken,
      isNewUser,
      message: isNewUser
        ? 'Welcome! Your account has been created.'
        : 'Welcome back!'
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error.message);
    res.status(400).json({
      error: error.message || 'Google authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getOAuthConfig = async (req, res) => {
  try {
    const config = {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || null,
        redirectUri: process.env.GITHUB_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/github/callback`,
        enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || null,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/google/callback`,
        enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
      }
    };

    res.json(config);
  } catch (error) {
    console.error('Get OAuth config error:', error.message);
    res.status(500).json({
      error: 'Failed to get OAuth configuration'
    });
  }
};
