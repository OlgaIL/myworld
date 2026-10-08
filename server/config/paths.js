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

function privateUploadDirectory(name) {
  const directory = path.join(uploadsDir, name);
  try {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe upload directory: ${name}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return directory;
}

export const guestUploadsDir = privateUploadDirectory("guests");
export const userUploadsDir = privateUploadDirectory("users");

export function ensurePrivateUploadDirectories() {
  for (const name of ["guests", "users"]) {
    fs.mkdirSync(privateUploadDirectory(name), { recursive: true });
    privateUploadDirectory(name);
  }
}
