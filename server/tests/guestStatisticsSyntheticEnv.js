import dotenv from "dotenv";
// The runner passes synthetic configuration and local DB URL. Suites must
// never recover private API settings by rereading the real .env.
dotenv.config = () => ({ parsed: {} });
globalThis.__myworldEnvLoaded = true;
