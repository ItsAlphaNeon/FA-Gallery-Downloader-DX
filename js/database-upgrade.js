import { cleanupFileStructure, deleteInvalidFiles, fixInvalidUsernames } from "./download-content.js";

async function fixFavoritesUsernames(db) {
  await db.exec(`
    CREATE TABLE favTemp (
      id TEXT UNIQUE ON CONFLICT IGNORE,
      url TEXT,
      username TEXT
    )`);
  await db.exec(`
    INSERT INTO favTemp
    SELECT LOWER(id) AS id, url, LOWER(username) AS username FROM favorites
  `);
  await db.exec(`INSERT INTO favorites SELECT * FROM favTemp`);
  await db.exec(`DELETE FROM favorites WHERE LOWER(id) <> id`);
  return await db.exec(`DROP TABLE favTemp`);
}

async function createThumbnailInfo(db) {
  await db.exec('ALTER TABLE subdata ADD COLUMN thumbnail_url TEXT')
    .catch(() => {});
  await db.exec(`
    ALTER TABLE subdata
    ADD COLUMN thumbnail_name TEXT
  `).catch(() => {});
  return db.exec(`
  ALTER TABLE subdata
  ADD COLUMN is_thumbnail_saved INTEGER default 0
`).catch(() => {});
}

/**
 * Used for making future upgrades/updates to the database, to enforce
 * a schema.
 * @returns If an error occurred or not. If yes, we need to exit!
 */
export async function upgradeDatabase(db) {
  let { user_version:version } = await db.get('PRAGMA user_version');
  const startVersion = version;
  switch(version) {
    case 0:
    case 1:
      await db.exec('ALTER TABLE subdata ADD COLUMN username TEXT')
        .catch(() => {/* Column already exists, just continue */});
      version = 2;
    case 2:
      await db.exec(`
      CREATE TABLE IF NOT EXISTS commentdata (
        id TEXT UNIQUE ON CONFLICT REPLACE,
        submission_id TEXT,
        width TEXT,
        username TEXT,
        desc TEXT,
        subtitle TEXT,
        date TEXT
      )`);
      version = 3;
    case 3:
      await db.exec(`
      CREATE TABLE IF NOT EXISTS ownedaccounts (
        username TEXT UNIQUE ON CONFLICT IGNORE
      )`);
      await db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT UNIQUE ON CONFLICT IGNORE,
        url TEXT,
        username TEXT
      )`);
      version = 4;
    case 4:
      await db.exec('ALTER TABLE subdata ADD COLUMN moved_content INTEGER default 0')
      .catch(() => {/* Column already exists, just continue */});
      version = 5;
    case 5:
      await fixFavoritesUsernames(db);
      version = 6;
    case 6:
      await db.exec(`
      CREATE TABLE IF NOT EXISTS usersettings (
        latest_browser_version TEXT
      )`);
      await db.exec(`
        INSERT INTO usersettings(latest_browser_version)
        VALUES('')
      `);
      version = 7;
    case 7:
      await createThumbnailInfo(db);
      version = 8;  
    case 8:
      await db.exec(`ALTER TABLE subdata ADD COLUMN rating TEXT`)
      .catch(() => {});
      await db.exec(`ALTER TABLE subdata ADD COLUMN category TEXT`)
      .catch(() => {});
      version = 9;
    case 9:
      await db.exec(`ALTER TABLE subdata ADD COLUMN account_name TEXT`)
      .catch(() => {});
      await db.exec(`ALTER TABLE commentdata ADD COLUMN account_name TEXT`)
      .catch(() => {});
      await db.exec(`
        UPDATE subdata
        SET 
          account_name = REPLACE(username, '_', '')
        where username IS NOT NULL
      `);
      await db.exec(`
        UPDATE commentdata
        SET 
          account_name = REPLACE(username, '_', '')
        where username IS NOT NULL
      `);
      version = 10;
    case 10:
      // Should only need to do these once
      await cleanupFileStructure();
      await deleteInvalidFiles();
      version = 11;
    case 11:
      await db.exec(`ALTER TABLE subdata ADD COLUMN content_missing INTEGER default 0`).catch(() => {});
      await db.exec(`ALTER TABLE subdata ADD COLUMN thumbnail_missing INTEGER default 0`).catch(() => {});
      version = 12;
    case 12:
      await fixInvalidUsernames();
      version = 13;
    case 13:
      // FA now exposes a permanent per-account UUID ("Unique ID") on profile pages.
      // Track users by it so username changes don't split a user's data.
      await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        uuid TEXT PRIMARY KEY,
        username TEXT,
        account_name TEXT,
        pretty_username TEXT,
        registered TEXT,
        previous_usernames TEXT,
        first_seen TEXT,
        last_seen TEXT
      )`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_account_name ON users(account_name)`);
      await db.exec(`ALTER TABLE subdata ADD COLUMN user_uuid TEXT`).catch(() => {});
      await db.exec(`ALTER TABLE favorites ADD COLUMN user_uuid TEXT`).catch(() => {});
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_subdata_user_uuid ON subdata(user_uuid)`);
      version = 14;
    case 14:
      // FA renders dates as text in a timezone that varies by session; store the real epoch too.
      await db.exec(`ALTER TABLE subdata ADD COLUMN uploaded_at INTEGER`).catch(() => {});
      await db.exec(`ALTER TABLE commentdata ADD COLUMN posted_at INTEGER`).catch(() => {});
      version = 15;
    case 15: {
      // Comment usernames were saved as "Display Name   ~login" with embedded whitespace. Keep just the login.
      // One transaction: tens of thousands of separately committed updates take hours on a hard drive.
      const rows = await db.all(`SELECT id, username FROM commentdata WHERE username LIKE '%' || char(10) || '%'`);
      await db.exec('BEGIN');
      try {
        for (const { id, username } of rows) {
          const name = username.match(/~\s*(\S+)\s*$/)?.[1] || username.trim().split(/\s+/)[0];
          await db.run('UPDATE commentdata SET username = ?, account_name = ? WHERE id = ?', name, name.replace(/_/g, ''), id);
        }
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
      version = 16;
    }

    default:
      // An up-to-date database matches no case and lands here too; only compact after a real upgrade.
      if (version === startVersion) return;
      await db.exec(`VACUUM`);
      await db.exec(`PRAGMA user_version = ${version}`);
      console.log(`Database now at: v${version}`);
  }
}