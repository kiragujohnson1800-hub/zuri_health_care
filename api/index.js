import app, { ensureInitialAdmin } from "../server/index.js";

let initialization;

export default async function handler(req, res) {
  try {
    if (!initialization) initialization = ensureInitialAdmin();
    await initialization;
  } catch (error) {
    console.error("Vercel API initialization error:", error);
    return res.status(500).json({ message: "Server initialization failed." });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const apiPath = url.searchParams.get("__api_path");

  if (apiPath !== null) {
    url.searchParams.delete("__api_path");
    req.url = `/api/${apiPath}${url.search}`;
  }

  return app(req, res);
}
