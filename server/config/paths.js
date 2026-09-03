import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const serverRootDir = path.resolve(__dirname, "..");
export const clientDistDir = path.resolve(serverRootDir, "../client/dist");
const configuredUploadsDir = path.join(serverRootDir, "uploads");

if (!fs.existsSync(configuredUploadsDir)) {
  fs.mkdirSync(configuredUploadsDir, { recursive: true });
}

export const uploadsDir = fs.realpathSync(configuredUploadsDir);
