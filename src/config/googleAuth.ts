import { OAuth2Client } from 'google-auth-library';

let client: OAuth2Client | null = null;

export function getGoogleClient() {
  if (!client) {
    client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );
  }
  return client;
}
