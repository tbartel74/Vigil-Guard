import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database types
export interface User {
  id?: number;
  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at?: string;
  last_login?: string;
  is_active: boolean;
  can_view_monitoring: boolean;
  can_view_configuration: boolean;
  can_manage_users: boolean;
  force_password_change: boolean;
  timezone: string;
}

export interface Session {
  id?: string;
  user_id: number;
  token: string;
  expires_at: string;
  created_at?: string;
}

class UserDatabase {
  private db: any;

  constructor() {
    // Create data directory if it doesn't exist
    const dataDir = join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    const dbPath = join(dataDir, 'users.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeTables();
    this.createDefaultAdmin();
  }

  private initializeTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        is_active BOOLEAN DEFAULT 1,
        can_view_monitoring BOOLEAN DEFAULT 0,
        can_view_configuration BOOLEAN DEFAULT 0,
        can_manage_users BOOLEAN DEFAULT 0,
        force_password_change BOOLEAN DEFAULT 0,
        timezone TEXT DEFAULT 'UTC'
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indices for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);

    // Migrate existing tables - add permissions columns if they don't exist
    this.migratePermissions();
  }

  private migratePermissions() {
    try {
      // Check if permissions columns exist
      const tableInfo = this.db.pragma('table_info(users)');
      const columns = tableInfo.map((col: any) => col.name);

      if (!columns.includes('can_view_monitoring')) {
        this.db.exec('ALTER TABLE users ADD COLUMN can_view_monitoring BOOLEAN DEFAULT 0');
        console.log('Added can_view_monitoring column');
      }

      if (!columns.includes('can_view_configuration')) {
        this.db.exec('ALTER TABLE users ADD COLUMN can_view_configuration BOOLEAN DEFAULT 0');
        console.log('Added can_view_configuration column');
      }

      if (!columns.includes('can_manage_users')) {
        this.db.exec('ALTER TABLE users ADD COLUMN can_manage_users BOOLEAN DEFAULT 0');
        console.log('Added can_manage_users column');
      }

      if (!columns.includes('force_password_change')) {
        this.db.exec('ALTER TABLE users ADD COLUMN force_password_change BOOLEAN DEFAULT 0');
        console.log('Added force_password_change column');
      }

      if (!columns.includes('timezone')) {
        this.db.exec('ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT \'UTC\'');
        console.log('Added timezone column');
      }

      // Update existing admin user to have all permissions
      this.db.exec(`
        UPDATE users
        SET can_view_monitoring = 1,
            can_view_configuration = 1,
            can_manage_users = 1
        WHERE role = 'admin' AND (
          can_view_monitoring = 0 OR
          can_view_configuration = 0 OR
          can_manage_users = 0
        )
      `);
    } catch (error) {
      console.error('Migration error:', error);
    }
  }

  private async createDefaultAdmin() {
    const adminExists = this.db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE role = ?'
    ).get('admin') as { count: number };

    if (adminExists.count === 0) {
      // Enforce WEB_UI_ADMIN_PASSWORD is set (no fallback) - OWASP ASVS V2.1
      if (!process.env.WEB_UI_ADMIN_PASSWORD || process.env.WEB_UI_ADMIN_PASSWORD.length < 12) {
        throw new Error(
          'SECURITY ERROR: WEB_UI_ADMIN_PASSWORD environment variable must be set and at least 12 characters long. ' +
          'Generate one using: ./install.sh or manually: openssl rand -base64 32 | tr -d "/+=\\n" | head -c 32'
        );
      }
      const defaultPassword = process.env.WEB_UI_ADMIN_PASSWORD;
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      this.createUser({
        username: 'admin',
        email: 'admin@vigilguard.local',
        password_hash: hashedPassword,
        role: 'admin',
        is_active: true,
        can_view_monitoring: true,
        can_view_configuration: true,
        can_manage_users: true,
        force_password_change: true,
        timezone: 'UTC'
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 Default Admin Account Created');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('Username: admin');
      console.log('Password: [Set via WEB_UI_ADMIN_PASSWORD in .env - see install.sh output]');
      console.log('Source: WEB_UI_ADMIN_PASSWORD environment variable');
      console.log('');
      console.log('⚠️  IMPORTANT: Use password from install.sh output!');
      console.log('⚠️  You will be required to change it on first login.');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  // User operations
  async createUser(user: User): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, email, password_hash, role, is_active,
                         can_view_monitoring, can_view_configuration, can_manage_users, force_password_change, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      user.username,
      user.email,
      user.password_hash,
      user.role || 'user',
      user.is_active ? 1 : 0,
      user.can_view_monitoring ? 1 : 0,
      user.can_view_configuration ? 1 : 0,
      user.can_manage_users ? 1 : 0,
      user.force_password_change ? 1 : 0,
      user.timezone || 'UTC'
    );

    return result.lastInsertRowid as number;
  }

  getUserByUsername(username: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  }

  getUserByEmail(email: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as User | undefined;
  }

  getUserById(id: number): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  }

  updateLastLogin(userId: number): void {
    const stmt = this.db.prepare(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(userId);
  }

  updatePassword(userId: number, hashedPassword: string): void {
    const stmt = this.db.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    );
    stmt.run(hashedPassword, userId);
  }

  getAllUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as User[];
  }

  deleteUser(userId: number): void {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(userId);
  }

  toggleUserActive(userId: number): void {
    const stmt = this.db.prepare(
      'UPDATE users SET is_active = NOT is_active WHERE id = ?'
    );
    stmt.run(userId);
  }

  updateUser(userId: number, updates: Partial<User>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.can_view_monitoring !== undefined) {
      fields.push('can_view_monitoring = ?');
      values.push(updates.can_view_monitoring ? 1 : 0);
    }
    if (updates.can_view_configuration !== undefined) {
      fields.push('can_view_configuration = ?');
      values.push(updates.can_view_configuration ? 1 : 0);
    }
    if (updates.can_manage_users !== undefined) {
      fields.push('can_manage_users = ?');
      values.push(updates.can_manage_users ? 1 : 0);
    }
    if (updates.force_password_change !== undefined) {
      fields.push('force_password_change = ?');
      values.push(updates.force_password_change ? 1 : 0);
    }
    if (updates.timezone !== undefined) {
      fields.push('timezone = ?');
      values.push(updates.timezone);
    }

    if (fields.length === 0) return;

    values.push(userId);
    const stmt = this.db.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);
  }

  // Check if there are other users with user management permission
  canRemoveUserManagementPermission(userId: number): boolean {
    const count = this.db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE can_manage_users = 1 AND is_active = 1 AND id != ?'
    ).get(userId) as { count: number };

    return count.count > 0;
  }

  // Force password change
  setForcePasswordChange(userId: number, force: boolean): void {
    const stmt = this.db.prepare(
      'UPDATE users SET force_password_change = ? WHERE id = ?'
    );
    stmt.run(force ? 1 : 0, userId);
  }

  clearForcePasswordChange(userId: number): void {
    this.setForcePasswordChange(userId, false);
  }

  // Session operations
  createSession(userId: number, token: string, expiresIn: number = 86400): string {
    const sessionId = `sess_${Date.now()}_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(sessionId, userId, token, expiresAt);
    return sessionId;
  }

  getSessionByToken(token: string): Session | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE token = ? AND expires_at > datetime('now')
    `);
    return stmt.get(token) as Session | undefined;
  }

  deleteSession(token: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    stmt.run(token);
  }

  deleteUserSessions(userId: number): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?');
    stmt.run(userId);
  }

  cleanupExpiredSessions(): void {
    const stmt = this.db.prepare(
      "DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"
    );
    stmt.run();
  }

  // Utility methods
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const userDb = new UserDatabase();

// Cleanup expired sessions periodically (every hour)
setInterval(() => {
  userDb.cleanupExpiredSessions();
}, 3600000);
