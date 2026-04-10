export function requireAuthenticatedUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  next();
}
