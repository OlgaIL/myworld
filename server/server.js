import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(session({ secret: "keyboard cat", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// === Google OAuth ===
passport.use(
  new GoogleStrategy(
    {
      clientID: "532493933750-ll9ttnl7gkrllelgkr44h9bfntk0jgjp.apps.googleusercontent.com",
      clientSecret: "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",
      callbackURL: "http://localhost:4000/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// === Auth routes ===
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("http://localhost:5173/")
);
app.get("/api/me", (req, res) => res.send(req.user || null));
app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("http://localhost:5173/"));
});

// === Uploads ===
const upload = multer({ dest: "uploads/" });
app.post("/api/upload", upload.single("photo"), (req, res) => res.send({ filename: req.file.filename }));

app.get("/api/photos", (req, res) => {
  const files = fs.readdirSync("uploads");
  res.json(files);
});

app.get("/api/photos/:name", (req, res) => res.sendFile(path.join(__dirname, "uploads", req.params.name)));

app.delete("/api/photos/:name", (req, res) => {
  fs.unlinkSync(path.join(__dirname, "uploads", req.params.name));
  res.sendStatus(200);
});

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
