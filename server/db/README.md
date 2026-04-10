# Local PostgreSQL Setup

This is the first production-lite step for the backend. Right now the app can
already start without PostgreSQL, but the new db layer is ready and waiting for
`DATABASE_URL`.

## 1. Install PostgreSQL locally

On Windows, install PostgreSQL with the official installer and remember:

- host: `localhost`
- port: `5432`
- database name: `myworld`
- username: `postgres`
- password: the one you choose during install

After installation, verify that `psql` works in a new terminal:

```powershell
psql --version
```

## 2. Create the database

Open `psql` and create a local database:

```sql
create database myworld;
```

## 3. Configure environment variables

Copy values from [server/.env.example](/C:/Users/olgak/PROJECTS/myworld/server/.env.example)
into your local `server/.env` and add:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/myworld
DATABASE_SSL=false
SESSION_SECRET=change-me
```

## 4. Install dependencies

From the `server` folder:

```powershell
npm.cmd install
```

## 5. Run migrations

```powershell
npm.cmd run db:migrate
```

## 6. Check database status

```powershell
npm.cmd run db:status
```

## 7. Start the backend

```powershell
npm.cmd start
```

The health endpoint will show database status:

```text
GET /api/health
```

## What is already prepared in code

- `db/index.js`: PostgreSQL connection pool
- `db/migrate.js`: SQL migration runner
- `db/migrations/001_init.sql`: initial schema
- `repositories/usersRepository.js`: user persistence scaffold
- `repositories/photosRepository.js`: photo persistence scaffold

## Current scope

This step prepares PostgreSQL and the schema, but the photo pipeline still uses
the in-memory `photos` array. The next step is moving upload/list/process logic
from memory to PostgreSQL.
