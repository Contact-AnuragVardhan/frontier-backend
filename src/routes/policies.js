import { Router } from "express";
import { getPolicies, getPolicyById, getPolicyOptions } from "../services/policyService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const policiesRouter = Router();

policiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const policies = await getPolicies({
      state: req.query.state,
      category: req.query.category,
      status: req.query.status,
    });

    return res.json(policies);
  }),
);

policiesRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const options = await getPolicyOptions();
    return res.json(options);
  }),
);

policiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid policy id." });
    }

    const policy = await getPolicyById(id);
    if (!policy) {
      return res.status(404).json({ error: "Policy not found." });
    }

    return res.json(policy);
  }),
);
