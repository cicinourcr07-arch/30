import dns from "node:dns";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import app from "./api/_app.ts";

dns.setDefaultResultOrder("ipv4first");

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Universal YouTube Narrative Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
