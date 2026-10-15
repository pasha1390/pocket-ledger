const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const cookieParser = require("cookie-parser");
const { router: authRouter } = require("./auth");
const apiRouter = require("./api");

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1); // behind Render/Railway/nginx

app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  next();
});

// Public config for the frontend (the Google client ID is not a secret).
app.get("/api/config", (req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" }));

app.use("/api/auth", authRouter);
app.use("/api", apiRouter);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Bad request" });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Pocket Ledger running at http://localhost:${PORT}`));
