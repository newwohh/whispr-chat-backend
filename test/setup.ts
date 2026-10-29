import { copyFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll } from "bun:test";
import { resetSqliteDb } from "../src/db/sqlite";

const sourceDb = resolve(process.cwd(), "db.sqlite3");
const testDb = resolve(process.cwd(), "test_db.sqlite3");

beforeAll(() => {
  if (existsSync(sourceDb)) {
    copyFileSync(sourceDb, testDb);
  }
  process.env.SQLITE_PATH = testDb;
  resetSqliteDb();
});

afterAll(() => {
  resetSqliteDb();
  if (existsSync(testDb)) {
    try {
      unlinkSync(testDb);
    } catch {
      // ignore
    }
  }
});
