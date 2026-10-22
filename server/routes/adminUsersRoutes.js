import { Router } from "express";
import { getAdminUsersSummary, listAdminUsers, parseAdminUserFilters } from "../repositories/adminUsersRepository.js";

export function createAdminUsersRouter({ requireAdmin, mapUser, loadVisits,
  listUsers = listAdminUsers, summary = getAdminUsersSummary }) {
  const router = Router();
  router.get("/admin-api/users-summary", requireAdmin, async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json(await summary());
  });
  router.get("/admin-api/users", requireAdmin, async (req, res, next) => {
    try {
      const filters = parseAdminUserFilters(req.query);
      const result = await listUsers(filters);
      const visits = await loadVisits(result.users);
      res.set("Cache-Control", "private, no-store");
      res.json({ ...result, users: result.users.map(user => mapUser(user, { metrikaVisits: visits })) });
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: "INVALID_USER_FILTERS" });
      next(error);
    }
  });
  return router;
}
