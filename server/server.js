import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";

import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// --- Подключаем сервисы ---

 import ocrService from "./services/ocrService.js";
import * as aiService from "./services/aiService.js";

const CLIENT_URL = process.env.CLIENT_URL;
const SERVER_URL = process.env.SERVER_URL;

const OCR_PROVIDER = process.env.OCR_PROVIDER || "google";
const AI_PROVIDER = process.env.AI_PROVIDER || "openai";

console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log("OPENAI:", process.env.OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}


app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(session({ secret: "keyboard cat", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// --- Google OAuth ---
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/google/callback`
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect(CLIENT_URL)
);
app.get("/api/me", (req, res) => res.send(req.user || null));
app.get("/logout", (req, res) => { req.logout(() => res.redirect(CLIENT_URL)); });

// --- Uploads ---

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir, // вместо "uploads/"
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const uniqueName = Date.now() + '.' + ext;
    cb(null, uniqueName);
  }
});


const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error("INVALID_FILE_TYPE");
      err.code = "INVALID_FILE_TYPE";
      cb(err);
    }
  }
});


// --- Временное хранилище метаданных ---
const photos = []; // {id, filename, status, text, title, summary, tags}

// --- Старые endpoint'ы (не меняем) ---
app.post("/api/upload", (req, res) => {
  upload.single("photo")(req, res, function (err) {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "FILE_TOO_LARGE" });
      if (err.message === "INVALID_FILE_TYPE") return res.status(400).json({ error: "INVALID_FILE_TYPE" });
      return res.status(500).json({ error: "UPLOAD_ERROR" });
    }
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });

    // --- Добавляем в массив метаданных для pipeline ---
    photos.push({
      id: req.file.filename,
      filename: req.file.filename,
      status: 'uploaded',
      text: '',
      title: '',
      summary: '',
      tags: []
    });

    res.json({ id: req.file.filename, filename: req.file.filename });
  });
});

app.get("/api/photos", (req, res) => {
  const files = fs.readdirSync(uploadsDir);
  res.json(files); // старый фронтенд видит массив строк
});



app.get("/api/photos/:name", (req, res) => {
  res.sendFile(path.join(uploadsDir, req.params.name));
  
});

app.delete("/api/photos/:name", (req, res) => {
  const filePath = path.join(uploadsDir, req.params.name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.sendStatus(200);
});

// --- Новые endpoint'ы для pipeline ---
app.get("/api/photos-metadata", (req, res) => res.json(photos));

app.get("/api/photos/:id/file", (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  res.sendFile(path.join(uploadsDir, photo.filename));
});



app.get("/api/photos/:id/info", (req, res) => {
  let photo = photos.find(p => p.id === req.params.id);

  // fallback: если фото есть на диске, но нет в массиве
  if (!photo) {
    const filePath = path.join(uploadsDir, req.params.id);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Photo not found" });
    }

    photo = {
      id: req.params.id,
      filename: req.params.id,
      status: 'uploaded',
      text: '',
      title: '',
      summary: '',
      tags: []
    };

    photos.push(photo);
  }

  res.json(photo);
});


app.post("/api/photos/:id/process", async (req, res) => {
  let photo = photos.find(p => p.id === req.params.id);

  if (!photo) {
    // проверяем файл на диске
    const filePath = path.join(uploadsDir, req.params.id);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Photo not found" });
    }

    // создаём временную запись в массиве
    photo = {
      id: req.params.id,
      filename: req.params.id,
      status: 'uploaded',
      text: '',
      title: '',
      summary: '',
      tags: []
    };

    photos.push(photo);
  }

  try {
    photo.status = 'processing';
    const imagePath = path.join(uploadsDir, photo.filename);

    // --- OCR ---
   
       const ocrResult = await ocrService.recognize(imagePath, {
        provider: OCR_PROVIDER,
        apiKey: process.env.YANDEX_API_KEY,
        folderId: process.env.YANDEX_FOLDER_ID
      });

      

        if (ocrResult.error) {
          console.error("OCR ERROR:", ocrResult.error);

          return res.json({
            status: "error",
            error: ocrResult.error
          });
        }


    const text = typeof ocrResult.text === "string" ? ocrResult.text : "";
           
    console.log("OCR TEXT:", text.slice(0, 100));

  if (text.trim().length < 10) {
      photo.status = 'no_text';
      photo.text = text || '';
      return res.json({ message: "No text detected", status: photo.status });
    }


// --- AI ---
      const aiResult = await aiService.process(text, {
        provider: AI_PROVIDER,
        apiKey: process.env.YANDEX_API_KEY,
        folderId: process.env.YANDEX_FOLDER_ID
      });

    
   if (aiResult.error) {
     console.error("AI ERROR:", aiResult.error);

     photo.status = "error";

    return res.json({
    status: "error",
    error: aiResult.error
  });
}


    console.log("AI RESULT:", aiResult);

    photo.title = aiResult.title;
    photo.summary = aiResult.summary;
    photo.tags = aiResult.tags;

    photo.status = "processed";
    photo.text = text;


        return res.json({
      status: photo.status,
      title: photo.title,
      summary: photo.summary,
      tags: photo.tags
      });
    

  } catch (err) {
  console.error("PROCESS ERROR:", err);

  photo.status = 'error';

  let errorMessage = "Processing failed";

  // 👉 обрабатываем OpenAI ошибку
  if (err.code === "insufficient_quota") {
    errorMessage = "AI quota exceeded";
  }

  if (err.status === 429) {
    errorMessage = "Too many requests or quota exceeded";
  }

  photo.error = errorMessage;

  res.status(200).json({
    id: photo.id,
    status: "error",
    error: errorMessage
  });
}

});


// --- Serve frontend ---
app.use(express.static(path.join(__dirname, "../client/dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "../client/dist/index.html")));

app.listen(4000, () => console.log("Server running on http://localhost:4000"));