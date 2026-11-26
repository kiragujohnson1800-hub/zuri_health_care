import mysql from "mysql2/promise";

const ssl = process.env.DB_SSL_CA
  ? { ca: process.env.DB_SSL_CA }
  : process.env.DB_SSL === "true"
    ? {}
    : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "zuri_health_care",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || (process.env.VERCEL ? 2 : 10)),
  ...(ssl ? { ssl } : {}),
  dateStrings: true
});

export default pool;