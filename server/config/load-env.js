import dotenv from "dotenv";

if (!globalThis.__myworldEnvLoaded) {
  dotenv.config();
  globalThis.__myworldEnvLoaded = true;
}
