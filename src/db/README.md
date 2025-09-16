# Database & Migrations

This app uses Drizzle ORM with Expo SQLite.

## Structure

- `src/db/client.ts`: Opens the SQLite database, creates the Drizzle client, and runs migrations.
- `src/db/schema/`: Drizzle schema definitions split by model (`users`, `libraries`, `libraryItems`).
- `src/db/migrations/`: Generated and hand-authored migrations; loaded at runtime via the Expo migrator.

## Drizzle CLI

Config: `drizzle.config.ts`

Scripts:
- `npm run drizzle:generate` — generate migration files from the schema
- `npm run drizzle:push` — generate and apply migration files

Note: In React Native we cannot run node-based CLI at runtime, so we ship migrations and apply them on app start using `drizzle-orm/expo-sqlite/migrator`.

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
