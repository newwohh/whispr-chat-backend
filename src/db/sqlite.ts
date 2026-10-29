import { Database } from "bun:sqlite";
import { CONFIG } from "../config";
import type { UserRecord } from "../types";

let dbInstance: Database | null = null;

export function resetSqliteDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getSqliteDb(): Database {
  if (!dbInstance) {
    const dbPath = process.env.SQLITE_PATH || CONFIG.SQLITE_PATH;
    dbInstance = new Database(dbPath, { create: true });
    // Ensure app_user table exists if running fresh
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS "app_user" (
        "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        "password" varchar(128) NOT NULL,
        "last_login" datetime NULL,
        "email" varchar(255) NOT NULL UNIQUE,
        "name" varchar(200) NOT NULL,
        "is_active" bool NOT NULL,
        "is_admin" bool NOT NULL,
        "created_at" datetime NOT NULL,
        "updated_at" datetime NOT NULL,
        "tc" varchar(11) NULL
      );
    `);
  }
  return dbInstance;
}

export function findUserByEmail(email: string): UserRecord | null {
  const db = getSqliteDb();
  const query = db.query<UserRecord, [string]>(
    `SELECT * FROM app_user WHERE email = ? LIMIT 1`
  );
  return query.get(email.toLowerCase().trim());
}

export function findUserById(id: number): UserRecord | null {
  const db = getSqliteDb();
  const query = db.query<UserRecord, [number]>(
    `SELECT * FROM app_user WHERE id = ? LIMIT 1`
  );
  return query.get(id);
}

export function getAllUsers(): Array<{ id: number; name: string }> {
  const db = getSqliteDb();
  const query = db.query<{ id: number; name: string }, []>(
    `SELECT id, name FROM app_user ORDER BY id ASC`
  );
  return query.all();
}

export function createUser(
  email: string,
  name: string,
  passwordHash: string,
  tc: string | null = "True"
): UserRecord {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const normalizedEmail = email.toLowerCase().trim();

  const insert = db.prepare(`
    INSERT INTO app_user (
      email, name, password, tc, is_active, is_admin, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 1, 0, ?, ?
    )
  `);

  const info = insert.run(normalizedEmail, name, passwordHash, tc, now, now);
  const newId = Number(info.lastInsertRowid);

  return {
    id: newId,
    email: normalizedEmail,
    name,
    password: passwordHash,
    tc,
    is_active: 1,
    is_admin: 0,
    created_at: now,
    updated_at: now,
  };
}

export function updateUserPassword(userId: number, newPasswordHash: string): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  db.run(`UPDATE app_user SET password = ?, updated_at = ? WHERE id = ?`, [
    newPasswordHash,
    now,
    userId,
  ]);
}

export function updateLastLogin(userId: number): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  db.run(`UPDATE app_user SET last_login = ?, updated_at = ? WHERE id = ?`, [
    now,
    now,
    userId,
  ]);
}
