import { Router } from "express";
import { getPolicies, getPolicyById, getPolicyOptions } from "../services/policyService.js";

export const policiesRouter = Router();

policiesRouter.get("/", async (req, res, next) => {
  try {
    res.json(await getPolicies({
      state: req.query.state,
      category: req.query.category,
      status: req.query.status,
    }));
  } catch (error) { next(error); }
});

policiesRouter.get("/options", async (_req, res, next) => {
  try { res.json(await getPolicyOptions()); }
  catch (error) { next(error); }
});

policiesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid policy id." });
    const policy = await getPolicyById(id);
    if (!policy) return res.status(404).json({ error: "Policy not found." });
    res.json(policy);
  } catch (error) { next(error); }
});
