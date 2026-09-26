import { Router } from "express";
import { answerChatQuestion } from "../services/chatService.js";
import { getKnowledgeStatus } from "../services/knowledgeService.js";

export const chatRouter = Router();

function parseHistory(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("history must be an array when provided.");
  }

  return value.map((entry, index) => {
    if (!entry || (entry.role !== "user" && entry.role !== "assistant")) {
      throw new Error(`history[${index}].role must be \"user\" or \"assistant\".`);
    }

    if (typeof entry.content !== "string" || !entry.content.trim()) {
      throw new Error(`history[${index}].content must be a non-empty string.`);
    }

    return {
      role: entry.role,
      content: entry.content.trim(),
    };
  });
}

chatRouter.post("/", async (req, res, next) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      return res.status(400).json({ error: "message is required." });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: "message must be 2000 characters or fewer." });
    }

    let history;
    try {
      history = parseHistory(req.body?.history);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json(await answerChatQuestion(message, history));
  } catch (error) {
    return next(error);
  }
});

chatRouter.get("/status", async (_req, res, next) => {
  try {
    return res.json(await getKnowledgeStatus());
  } catch (error) {
    return next(error);
  }
});
