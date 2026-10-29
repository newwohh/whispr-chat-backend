import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { CONFIG } from "../config";
import type { UserRecord } from "../types";
import {
  findUserByEmail,
  createUser,
  updateUserPassword,
  updateLastLogin,
} from "../db/sqlite";

const secretKeyBytes = new TextEncoder().encode(CONFIG.SECRET_KEY);

/**
 * Verify password against either Django's pbkdf2_sha256 format or Bun's native bcrypt/argon2 format.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("pbkdf2_sha256$")) {
    const parts = storedHash.split("$");
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedDigest = parts[3];

      const computedDigest = crypto
        .pbkdf2Sync(password, salt, iterations, 32, "sha256")
        .toString("base64");

      return crypto.timingSafeEqual(
        Buffer.from(computedDigest),
        Buffer.from(expectedDigest)
      );
    }
  }

  // Fallback to Bun native password verification (bcrypt / argon2)
  try {
    return await Bun.password.verify(password, storedHash);
  } catch {
    return false;
  }
}

/**
 * Hash password using Django-compatible pbkdf2_sha256 so the SQLite database remains
 * 100% interoperable with both Django and Bun.
 */
export function hashPasswordDjangoPbkdf2(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64").replace(/[+/=]/g, "a").slice(0, 22);
  const iterations = 600000;
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("base64");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

/**
 * Generate SimpleJWT-compatible access and refresh tokens.
 */
export async function getTokensForUser(user: { id: number | string }) {
  const userIdStr = String(user.id);
  const now = Math.floor(Date.now() / 1000);

  const accessJti = crypto.randomUUID().replace(/-/g, "");
  const refreshJti = crypto.randomUUID().replace(/-/g, "");

  const accessExpiry = now + CONFIG.JWT_ACCESS_EXPIRATION_SECONDS;
  const refreshExpiry = now + CONFIG.JWT_REFRESH_EXPIRATION_SECONDS;

  const access = await new SignJWT({
    token_type: "access",
    user_id: userIdStr,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(accessExpiry)
    .setJti(accessJti)
    .sign(secretKeyBytes);

  const refresh = await new SignJWT({
    token_type: "refresh",
    user_id: userIdStr,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(refreshExpiry)
    .setJti(refreshJti)
    .sign(secretKeyBytes);

  return {
    refresh,
    access,
  };
}

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secretKeyBytes, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string): Promise<UserRecord | null> {
  const user = findUserByEmail(email);
  if (!user) return null;

  const valid = await verifyPassword(password, user.password);
  if (!valid) return null;

  updateLastLogin(user.id);
  return user;
}

export async function registerUser(data: {
  email: string;
  name: string;
  password: string;
  password2?: string;
  tc?: string | null;
}): Promise<UserRecord> {
  const { email, name, password, tc } = data;
  const passwordHash = hashPasswordDjangoPbkdf2(password);
  return createUser(email, name, passwordHash, tc || "True");
}
