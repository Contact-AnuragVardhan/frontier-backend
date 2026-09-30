import { Router } from "express";
import {
  createContactSubmission,
  createNewsletterSubmission,
  createParentChapterSubmission,
} from "../services/siteSubmissionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const siteRouter = Router();

siteRouter.post(
  "/newsletter",
  asyncHandler(async (req, res) => {
    const result = await createNewsletterSubmission(req.body?.email);
    return res.status(201).json({ ok: true, submissionId: result.id });
  }),
);

siteRouter.post(
  "/contact",
  asyncHandler(async (req, res) => {
    const result = await createContactSubmission(req.body);
    return res.status(201).json({ ok: true, submissionId: result.id });
  }),
);

siteRouter.post(
  "/parent-chapter",
  asyncHandler(async (req, res) => {
    const result = await createParentChapterSubmission(req.body);
    return res.status(201).json({ ok: true, submissionId: result.id });
  }),
);
