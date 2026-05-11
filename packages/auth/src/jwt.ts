import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { getJwtSecret } from "@cio-agent/vault/secrets";
import type { JwtPayload, RefreshTokenPayload, TokenPair } from "./types.js";

const ACCESS_TOKEN_TTL  = 15 * 60;        // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

async function getKeys(): Promise<{ privateKey: string; publicKey: string }> {
  const secret = await getJwtSecret();
  return { privateKey: secret.private_key, publicKey: secret.public_key };
}

export async function signTokenPair(
  payload: Omit<JwtPayload, "jti" | "iat" | "exp">,
): Promise<TokenPair> {
  const { privateKey } = await getKeys();
  const jti = randomUUID();

  const access_token = jwt.sign(
    { ...payload, jti },
    privateKey,
    { algorithm: "RS256", expiresIn: ACCESS_TOKEN_TTL },
  );

  const refresh_token = jwt.sign(
    { sub: payload.sub, tenant_id: payload.tenant_id, jti: randomUUID() },
    privateKey,
    { algorithm: "RS256", expiresIn: REFRESH_TOKEN_TTL },
  );

  return { access_token, refresh_token, expires_in: ACCESS_TOKEN_TTL };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { publicKey } = await getKeys();
  const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
  return decoded as JwtPayload;
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const { publicKey } = await getKeys();
  const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
  return decoded as RefreshTokenPayload;
}

export async function decodeTokenUnsafe(
  token: string,
): Promise<JwtPayload | null> {
  const decoded = jwt.decode(token);
  return decoded as JwtPayload | null;
}
