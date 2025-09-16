# Database & Migrations

This app uses Drizzle ORM with Expo SQLite.

## Structure

- `src/db/client.ts`: Opens the SQLite database, creates the Drizzle client, and runs migrations.
- `src/db/schema/`: Drizzle schema definitions split by model (`users`, `libraries`, `libraryItems`).
- `src/db/migrations/`: SQL migrations; loaded at runtime via the Expo migrator.

## SQL Migrations (Expo-friendly)

Per Drizzle docs for Expo SQLite, we bundle SQL migrations directly into the app so they run on-device.

Refs: [Drizzle <> Expo SQLite docs](https://orm.drizzle.team/docs/connect-expo-sqlite)

### Generate migrations

- Generate SQL migrations from schema changes:
```bash
npx drizzle-kit generate
```

This will emit `.sql` files under `src/db/migrations`. Review and commit them.

### Runtime

- `src/db/migrations/index.ts` imports the `.sql` files (as strings via inline-import) and exposes them to `drizzle-orm/expo-sqlite/migrator`.
- `ensureDatabaseInitialized()` runs migrations on app start.

## Workflow

1) Edit schema in `src/db/schema/*`.
2) Generate migrations:
```bash
npm run drizzle:generate
```
This writes files into `src/db/migrations`. Review them into version control.

3) On next app run, `ensureDatabaseInitialized()` applies pending migrations automatically.

## Model Types

Each schema file exports Drizzle table and row types:
- `UserRow` from `users.ts`
- `LibraryRow` from `libraries.ts`
- `LibraryItemRow` from `libraryItems.ts`

If you add columns or tables, re-run `npm run drizzle:generate` to produce an updated migration and commit both the schema and migration.
