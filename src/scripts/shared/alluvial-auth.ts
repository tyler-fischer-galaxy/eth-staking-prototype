process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';
let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

export const getAlluvialToken = async (): Promise<string> => {
if (process.env.ALLUVIAL_OAUTH && process.env.ALLUVIAL_OAUTH_EXPIRES_AT) {
  const expiresAt = parseInt(process.env.ALLUVIAL_OAUTH_EXPIRES_AT);
  if (Date.now() < expiresAt - 60_000) {
    return process.env.ALLUVIAL_OAUTH;
  }
}

  const now = Date.now();
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(`${process.env.ALLUVIAL_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.ALLUVIAL_CLIENT_ID,
      client_secret: process.env.ALLUVIAL_CLIENT_SECRET,
      audience: process.env.ALLUVIAL_API_URL,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    throw new Error(`Alluvial auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;

updateEnvFile(cachedToken as string, tokenExpiresAt);
  return cachedToken as string;
};

const updateEnvFile = (token: string, expiresAt: number) => {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  const updates: Record<string, string> = {
    ALLUVIAL_OAUTH: token,
    ALLUVIAL_OAUTH_EXPIRES_AT: expiresAt.toString(),
  };

  for (const [key, value] of Object.entries(updates)) {
    if (envContent.match(new RegExp(`^${key}=`, 'm'))) {
      envContent = envContent.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
};
