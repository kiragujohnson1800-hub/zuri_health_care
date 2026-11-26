import app, { ensureInitialAdmin } from "./index.js";

const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  console.log(`Zuri Healthcare API listening on port ${port}`);
  ensureInitialAdmin().catch((error) => {
    console.error("Database setup error:", error.message);
  });
});
