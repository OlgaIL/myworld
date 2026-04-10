import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "../config/private-env.js";
import { SERVER_URL } from "../config/env.js";
import { findUserById, mapUserForSession, upsertGoogleUser } from "../repositories/usersRepository.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const appUser = await upsertGoogleUser({
          googleId: profile.id,
          email: profile.emails?.[0]?.value || null,
          displayName: profile.displayName || "User",
          avatarUrl: profile.photos?.[0]?.value || null
        });

        done(null, mapUserForSession(appUser));
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id);
    done(null, mapUserForSession(user));
  } catch (error) {
    done(error);
  }
});

export default passport;
