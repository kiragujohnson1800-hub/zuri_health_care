import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { requireAuth, allowRoles } from "./auth.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());

const query = async (sql, params = []) =>
  (await pool.execute(sql, params))[0];

function handleError(res, error) {
  console.error(error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ message: "That email is already registered." });
  }

  return res.status(500).json({ message: "Server error. Please try again." });
}

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({
        message: "Name, email, and a password of at least 8 characters are required."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    await query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES (?, ?, ?, 'patient', ?)`,
      [name.trim(), email.trim().toLowerCase(), hash, phone || null]
    );

    res.status(201).json({ message: "Registration successful. Please sign in." });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const [user] = await query("SELECT * FROM users WHERE email = ?", [email]);

    if (!user || !(await bcrypt.compare(req.body.password || "", user.password_hash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/api/doctors", requireAuth, async (_req, res) => {
  try {
    res.json(
      await query(
        `SELECT id, name, specialty
         FROM users WHERE role = 'doctor' ORDER BY name`
      )
    );
  } catch (error) {
    handleError(res, error);
  }
});

const appointmentQuery = `
  SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date,
         a.appointment_time, a.reason, a.status,
         p.name AS patient_name, p.email AS patient_email,
         d.name AS doctor_name, d.specialty AS doctor_specialty
  FROM appointments a
  JOIN users p ON p.id = a.patient_id
  JOIN users d ON d.id = a.doctor_id
`;

app.get("/api/appointments", requireAuth, async (req, res) => {
  try {
    let sql = appointmentQuery;
    let params = [];

    if (req.user.role === "patient") {
      sql += " WHERE a.patient_id = ?";
      params = [req.user.id];
    } else if (req.user.role === "doctor") {
      sql += " WHERE a.doctor_id = ?";
      params = [req.user.id];
    }

    sql += " ORDER BY a.appointment_date DESC, a.appointment_time DESC";
    res.json(await query(sql, params));
  } catch (error) {
    handleError(res, error);
  }
});

app.post(
  "/api/appointments",
  requireAuth,
  allowRoles("patient"),
  async (req, res) => {
    try {
      const { doctorId, date, time, reason } = req.body;

      if (!doctorId || !date || !time || !reason?.trim()) {
        return res.status(400).json({
          message: "Choose a doctor, date, time, and reason for your visit."
        });
      }

      const [doctor] = await query(
        "SELECT id FROM users WHERE id = ? AND role = 'doctor'",
        [doctorId]
      );

      if (!doctor) {
        return res.status(400).json({ message: "Doctor not found." });
      }

      const result = await query(
        `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, appointment_time, reason)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, doctorId, date, time, reason.trim()]
      );

      res.status(201).json({
        id: result.insertId,
        message: "Appointment request sent."
      });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.patch(
  "/api/appointments/:id/status",
  requireAuth,
  allowRoles("doctor", "admin"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["approved", "declined", "completed"].includes(status)) {
        return res.status(400).json({ message: "Invalid appointment status." });
      }

      const [appointment] = await query(
        "SELECT id, doctor_id FROM appointments WHERE id = ?",
        [req.params.id]
      );

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found." });
      }

      if (
        req.user.role === "doctor" &&
        (appointment.doctor_id !== req.user.id ||
          !["approved", "declined"].includes(status))
      ) {
        return res.status(403).json({ message: "You cannot update this appointment." });
      }

      await query("UPDATE appointments SET status = ? WHERE id = ?", [
        status,
        req.params.id
      ]);

      res.json({ message: "Appointment updated." });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get(
  "/api/admin/users",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const role = ["patient", "doctor"].includes(req.query.role)
        ? req.query.role
        : null;

      const sql = role
        ? "SELECT id, name, email, role, phone, specialty FROM users WHERE role = ? ORDER BY name"
        : "SELECT id, name, email, role, phone, specialty FROM users WHERE role IN ('patient', 'doctor') ORDER BY name";

      res.json(await query(sql, role ? [role] : []));
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const { name, email, password, role, phone, specialty } = req.body;

      if (
        !name ||
        !email ||
        !password ||
        password.length < 8 ||
        !["patient", "doctor"].includes(role)
      ) {
        return res.status(400).json({ message: "Check the account details and try again." });
      }

      const hash = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, phone, specialty)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name.trim(),
          email.trim().toLowerCase(),
          hash,
          role,
          phone || null,
          role === "doctor" ? specialty || null : null
        ]
      );

      res.status(201).json({ id: result.insertId, message: "User created." });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.put(
  "/api/admin/users/:id",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const { name, email, phone, specialty, password } = req.body;
      const [user] = await query(
        "SELECT id, role FROM users WHERE id = ? AND role IN ('patient', 'doctor')",
        [req.params.id]
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      if (password) {
        if (password.length < 8) {
          return res.status(400).json({ message: "Password must be at least 8 characters." });
        }

        const hash = await bcrypt.hash(password, 12);
        await query(
          `UPDATE users
           SET name=?, email=?, phone=?, specialty=?, password_hash=?
           WHERE id=?`,
          [name, email, phone || null, specialty || null, hash, user.id]
        );
      } else {
        await query(
          `UPDATE users SET name=?, email=?, phone=?, specialty=? WHERE id=?`,
          [name, email, phone || null, specialty || null, user.id]
        );
      }

      res.json({ message: "User updated." });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.delete(
  "/api/admin/users/:id",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const result = await query(
        "DELETE FROM users WHERE id = ? AND role IN ('patient', 'doctor')",
        [req.params.id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "User not found." });
      }

      res.json({ message: "User deleted." });
    } catch (error) {
      handleError(res, error);
    }
  }
);

export async function ensureInitialAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@zurihealthcare.com";
  const [admin] = await query("SELECT id FROM users WHERE email = ?", [email]);

  if (admin) return;

  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const hash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT IGNORE INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, 'admin')`,
    [process.env.ADMIN_NAME || "Zuri Administrator", email, hash]
  );

  if (result.affectedRows) {
    console.log(`Created initial admin account: ${email}`);
  }
}

export default app;