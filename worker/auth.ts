import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Server-side verification of the Cloudflare Access JWT (Security Blueprint L1).
 * Being behind Access at the edge is not enough — we verify the
 * `Cf-Access-Jwt-Assertion` header so hitting the raw `*.workers.dev` URL directly
 * cannot bypass authentication.
 */
export interface AccessConfig {
  teamDomain: string; // e.g. your-team.cloudflareaccess.com
  aud: string; // the Access application's Application Audience (AUD) tag
}

// Cache the remote key set per team domain (keys rotate; jose refetches as needed).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccessJwt(token: string, cfg: AccessConfig): Promise<void> {
  const issuer = `https://${cfg.teamDomain}`;
  let jwks = jwksCache.get(cfg.teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(cfg.teamDomain, jwks);
  }
  await jwtVerify(token, jwks, { issuer, audience: cfg.aud });
}
