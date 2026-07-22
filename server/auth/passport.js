import passport from "passport";
import axios from "axios";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  VK_CLIENT_ID,
  VK_CLIENT_SECRET,
  YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET
} from "../config/private-env.js";
import { isAuthProviderEnabled, SERVER_URL } from "../config/env.js";
import {
  findUserById,
  mapUserForSession,
  upsertGoogleUser,
  upsertVkUser,
  upsertYandexUser
} from "../repositories/usersRepository.js";

if (isAuthProviderEnabled("google") && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
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
}

if (isAuthProviderEnabled("yandex") && YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET) {
  const yandexStrategy = new OAuth2Strategy(
    {
      authorizationURL: "https://oauth.yandex.ru/authorize",
      tokenURL: "https://oauth.yandex.ru/token",
      clientID: YANDEX_CLIENT_ID,
      clientSecret: YANDEX_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/yandex/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.default_email || profile.emails?.[0] || null;
        const displayName = profile.real_name || profile.display_name || profile.login || "User";
        const avatarUrl = profile.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
          : null;
        const appUser = await upsertYandexUser({
          yandexId: profile.id,
          email,
          displayName,
          avatarUrl
        });

        done(null, mapUserForSession(appUser));
      } catch (error) {
        done(error);
      }
    }
  );

  yandexStrategy.userProfile = async function userProfile(accessToken, done) {
    try {
      const response = await axios.get("https://login.yandex.ru/info", {
        params: {
          format: "json"
        },
        headers: {
          Authorization: `OAuth ${accessToken}`
        },
        timeout: 10000
      });

      done(null, response.data);
    } catch (error) {
      done(error);
    }
  };

  passport.use("yandex", yandexStrategy);
}

if (isAuthProviderEnabled("vk") && VK_CLIENT_ID && VK_CLIENT_SECRET) {
  const vkStrategy = new OAuth2Strategy(
    {
      authorizationURL: "https://id.vk.com/authorize",
      tokenURL: "https://id.vk.com/oauth2/auth",
      clientID: VK_CLIENT_ID,
      clientSecret: VK_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/vk/callback`,
      scope: ["vkid.personal_info", "email"],
      scopeSeparator: " ",
      state: true,
      pkce: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const vkId = profile.user_id || profile.id || profile.sub;
        if (!vkId) {
          return done(new Error("VK ID did not return a user identifier"));
        }

        const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.name || "User";
        const appUser = await upsertVkUser({
          vkId: String(vkId),
          email: profile.email || null,
          displayName,
          avatarUrl: profile.avatar || profile.picture || null
        });

        return done(null, mapUserForSession(appUser));
      } catch (error) {
        return done(error);
      }
    }
  );

  vkStrategy.tokenParams = function tokenParams(options) {
    return {
      device_id: options.deviceId,
      state: options.callbackState
    };
  };

  vkStrategy.userProfile = async function userProfile(accessToken, done) {
    try {
      const response = await axios.post(
        "https://id.vk.com/oauth2/user_info",
        new URLSearchParams({ access_token: accessToken, client_id: VK_CLIENT_ID }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000
        }
      );

      done(null, response.data?.user || response.data);
    } catch (error) {
      done(error);
    }
  };

  passport.use("vk", vkStrategy);
}

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
