import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { policiesRouter } from "./routes/policies.js";
import { chatRouter } from "./routes/chat.js";

const app = express();
app.disable("x-powered-by");

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  }
}));

app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "frontier-policy-backend" }));
app.use("/api/policies", policiesRouter);
app.use("/api/chat", chatRouter);
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (String(error?.message || "").startsWith("CORS blocked origin:")) return res.status(403).json({ error: error.message });
  res.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, () => console.log(`Frontier backend listening on port ${config.port}`));
