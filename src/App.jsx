import { useEffect, useState } from "react";
import "./styles.css";

const API = "/api";
const token = () => localStorage.getItem("zuri-token");

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("overview");
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(token()));

  function notify(text, isError = false) {
    setMessage(isError ? "" : text);
    setError(isError ? text : "");
    window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 3500);
  }

  async function loadData(currentUser = user) {
    if (!currentUser) return;

    try {
      const [appointmentData, doctorData] = await Promise.all([
        api("/appointments"),
        api("/doctors")
      ]);

      setAppointments(appointmentData);
      setDoctors(doctorData);

      if (currentUser.role === "admin") {
        setUsers(await api("/admin/users"));
      }
    } catch (err) {
      notify(err.message, true);
    }
  }

  useEffect(() => {
    if (!token()) {
      setLoading(false);
      return;
    }

    api("/auth/me")
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        return loadData(currentUser);
      })
      .catch(() => {
        localStorage.removeItem("zuri-token");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) loadData(user);
  }, [user]);

  function signOut() {
    localStorage.removeItem("zuri-token");
    setUser(null);
    setPage("overview");
  }

  if (loading) return <main className="loading">Loading Zuri Healthcare…</main>;
  if (!user) return <AuthPage onLogin={setUser} notify={notify} />;

  const refresh = () => loadData(user);

  return (
    <div className="layout">
      <Sidebar user={user} page={page} setPage={setPage} signOut={signOut} />

      <main className="main">
        <header className="topbar">
          <span>Zuri Healthcare / {pageLabel(page, user.role)}</span>
          <span>{user.name} · {user.role}</span>
        </header>

        <div className="content">
          {page === "overview" && user.role === "patient" && (
            <PatientDashboard
              user={user}
              appointments={appointments}
              doctors={doctors}
              setPage={setPage}
            />
          )}

          {page === "overview" && user.role === "doctor" && (
            <DoctorDashboard
              user={user}
              appointments={appointments}
              onStatus={changeStatus}
            />
          )}

          {page === "overview" && user.role === "admin" && (
            <AdminDashboard users={users} appointments={appointments} />
          )}

          {page === "doctors" && user.role === "patient" && (
            <DoctorsPage
              doctors={doctors}
              onBooked={refresh}
              notify={notify}
            />
          )}

          {page === "doctors" && user.role === "admin" && (
            <UserManagement
              role="doctor"
              users={users}
              refresh={refresh}
              notify={notify}
            />
          )}

          {page === "patients" && user.role === "admin" && (
            <UserManagement
              role="patient"
              users={users}
              refresh={refresh}
              notify={notify}
            />
          )}

          {page === "appointments" && (
            <AppointmentsPage
              user={user}
              appointments={appointments}
              onStatus={changeStatus}
              setPage={setPage}
            />
          )}
        </div>
      </main>

      {(message || error) && (
        <div className={`toast ${error ? "toast-error" : ""}`}>
          {error || message}
        </div>
      )}
    </div>
  );

  async function changeStatus(id, status) {
    try {
      await api(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      notify(`Appointment ${status}.`);
      refresh();
    } catch (err) {
      notify(err.message, true);
    }
  }
}

function pageLabel(page, role) {
  if (page === "overview") return "Overview";
  if (page === "patients") return "Patients";
  if (page === "doctors") return role === "patient" ? "Find a doctor" : "Doctors";
  return "Appointments";
}

function Sidebar({ user, page, setPage, signOut }) {
  const links =
    user.role === "admin"
      ? [["overview", "Overview"], ["patients", "Patients"], ["doctors", "Doctors"], ["appointments", "Appointments"]]
      : user.role === "doctor"
        ? [["overview", "Overview"], ["appointments", "My appointments"]]
        : [["overview", "Overview"], ["doctors", "Find a doctor"], ["appointments", "Appointments"]];

  return (
    <aside className="sidebar">
      <div className="brand">✚ <strong>Zuri Healthcare</strong></div>
      <small className="menu-title">MENU</small>

      <nav>
        {links.map(([id, label]) => (
          <button
            key={id}
            className={page === id ? "nav-link active" : "nav-link"}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <span>{user.name}</span>
        <small>{user.role}</small>
        <button className="button secondary full" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  );
}

function AuthPage({ onLogin, notify }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: ""
  });
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);

    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(form)
        });
      }

      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          password: form.password
        })
      });

      localStorage.setItem("zuri-token", result.token);
      onLogin(result.user);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">✚ <strong>Zuri Healthcare</strong></div>
        <p className="eyebrow">YOUR HEALTHCARE PORTAL</p>
        <h1>{mode === "login" ? "Welcome back" : "Create a patient account"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Sign in to access your healthcare dashboard."
            : "Register to find doctors and request appointments."}
        </p>

        <div className="tabs">
          <button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>
            Register
          </button>
        </div>

        <form className="form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Full name
                <input name="name" value={form.name} onChange={update} required />
              </label>
              <label>
                Phone number
                <input name="phone" value={form.phone} onChange={update} />
              </label>
            </>
          )}

          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={update} required />
          </label>

          <label>
            Password
            <input type="password" name="password" value={form.password} minLength="8" onChange={update} required />
          </label>

          <button className="button primary full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PatientDashboard({ user, appointments, doctors, setPage }) {
  const pending = appointments.filter((item) => item.status === "pending").length;
  const upcoming = appointments.filter((item) => item.status === "approved").length;

  return (
    <>
      <PageTitle
        title={`Welcome, ${user.name}`}
        subtitle="Your healthcare overview."
        action={<button className="button primary" onClick={() => setPage("doctors")}>Book an appointment</button>}
      />

      <Stats items={[
        ["Available doctors", doctors.length],
        ["Pending requests", pending],
        ["Approved appointments", upcoming]
      ]} />

      <section className="panel">
        <h2>Recent appointments</h2>
        <AppointmentTable appointments={appointments.slice(0, 5)} role="patient" />
      </section>
    </>
  );
}

function DoctorDashboard({ user, appointments, onStatus }) {
  const pending = appointments.filter((item) => item.status === "pending").length;

  return (
    <>
      <PageTitle title={`Welcome, Dr. ${user.name}`} subtitle="Review your schedule and appointment requests." />
      <Stats items={[
        ["All appointments", appointments.length],
        ["Pending requests", pending],
        ["Approved appointments", appointments.filter((item) => item.status === "approved").length]
      ]} />
      <section className="panel">
        <h2>Appointment requests</h2>
        <AppointmentTable appointments={appointments.slice(0, 8)} role="doctor" onStatus={onStatus} />
      </section>
    </>
  );
}

function AdminDashboard({ users, appointments }) {
  return (
    <>
      <PageTitle title="Administrator dashboard" subtitle="Manage users and appointment activity." />
      <Stats items={[
        ["Patients", users.filter((item) => item.role === "patient").length],
        ["Doctors", users.filter((item) => item.role === "doctor").length],
        ["Appointments", appointments.length]
      ]} />
      <section className="panel">
        <h2>Recent appointments</h2>
        <AppointmentTable appointments={appointments.slice(0, 8)} role="admin" />
      </section>
    </>
  );
}

function DoctorsPage({ doctors, onBooked, notify }) {
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");

  async function book(event) {
    event.preventDefault();

    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctorId: selected.id,
          date,
          time,
          reason
        })
      });

      notify("Appointment request sent.");
      setSelected(null);
      setDate("");
      setTime("");
      setReason("");
      onBooked();
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <>
      <PageTitle title="Find a doctor" subtitle="Choose a doctor and request an appointment." />

      <div className="doctor-grid">
        {doctors.map((doctor) => (
          <article className="panel doctor-card" key={doctor.id}>
            <div className="doctor-avatar">✚</div>
            <h2>{doctor.name}</h2>
            <p>{doctor.specialty || "General Practitioner"}</p>
            <button className="button primary full" onClick={() => setSelected(doctor)}>
              Request appointment
            </button>
          </article>
        ))}
        {!doctors.length && (
          <p className="empty">
            No doctors are available yet. Ask an administrator to add doctor accounts.
          </p>
        )}
      </div>

      {selected && (
        <Modal title={`Request with ${selected.name}`} close={() => setSelected(null)}>
          <form className="form" onSubmit={book}>
            <label>
              Date
              <input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
            <label>
              Reason for visit
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
            </label>
            <button className="button primary full">Send request</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function AppointmentsPage({ user, appointments, onStatus, setPage }) {
  return (
    <>
      <PageTitle
        title={user.role === "admin" ? "All appointments" : "Appointments"}
        subtitle="Review appointment dates, reasons, and request status."
        action={user.role === "patient" && (
          <button className="button primary" onClick={() => setPage("doctors")}>Book appointment</button>
        )}
      />
      <section className="panel">
        <AppointmentTable appointments={appointments} role={user.role} onStatus={onStatus} />
      </section>
    </>
  );
}

function AppointmentTable({ appointments, role, onStatus }) {
  if (!appointments.length) return <p className="empty">No appointments to show.</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{role === "patient" ? "Doctor" : "Patient"}</th>
            {role !== "patient" && <th>Doctor</th>}
            <th>Date</th>
            <th>Time</th>
            <th>Reason</th>
            <th>Status</th>
            {role === "doctor" && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {appointments.map((item) => (
            <tr key={item.id}>
              <td>{role === "patient" ? item.doctor_name : item.patient_name}</td>
              {role !== "patient" && <td>{item.doctor_name}</td>}
              <td>{String(item.appointment_date).slice(0, 10)}</td>
              <td>{String(item.appointment_time).slice(0, 5)}</td>
              <td>{item.reason}</td>
              <td><span className={`status ${item.status}`}>{item.status}</span></td>
              {role === "doctor" && (
                <td>
                  {item.status === "pending" ? (
                    <div className="actions">
                      <button onClick={() => onStatus(item.id, "approved")}>Approve</button>
                      <button onClick={() => onStatus(item.id, "declined")}>Decline</button>
                    </div>
                  ) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserManagement({ role, users, refresh, notify }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    specialty: ""
  });

  const people = users.filter((item) => item.role === role);

  function openForm(person = null) {
    setEditing(person || "new");
    setForm(person
      ? { name: person.name, email: person.email, password: "", phone: person.phone || "", specialty: person.specialty || "" }
      : { name: "", email: "", password: "", phone: "", specialty: "" });
  }

  async function save(event) {
    event.preventDefault();

    try {
      if (editing === "new") {
        await api("/admin/users", {
          method: "POST",
          body: JSON.stringify({ ...form, role })
        });
      } else {
        await api(`/admin/users/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
      }

      setEditing(null);
      await refresh();
      notify("User saved.");
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function remove(person) {
    if (!window.confirm(`Delete ${person.name}?`)) return;

    try {
      await api(`/admin/users/${person.id}`, { method: "DELETE" });
      await refresh();
      notify("User deleted.");
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <>
      <PageTitle
        title={`Manage ${role}s`}
        subtitle={`Add, edit, view, or delete ${role} accounts.`}
        action={<button className="button primary" onClick={() => openForm()}>Add {role}</button>}
      />

      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th>
                {role === "doctor" && <th>Specialty</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.email}</td>
                  <td>{person.phone || "—"}</td>
                  {role === "doctor" && <td>{person.specialty || "—"}</td>}
                  <td className="actions">
                    <button onClick={() => openForm(person)}>Edit</button>
                    <button onClick={() => remove(person)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!people.length && <p className="empty">No {role}s have been added.</p>}
        </div>
      </section>

      {editing && (
        <Modal title={editing === "new" ? `Add ${role}` : `Edit ${role}`} close={() => setEditing(null)}>
          <form className="form" onSubmit={save}>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            {role === "doctor" && (
              <label>Specialty<input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></label>
            )}
            <label>
              {editing === "new" ? "Temporary password" : "New password (optional)"}
              <input
                type="password"
                minLength="8"
                required={editing === "new"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <button className="button primary full">Save user</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function PageTitle({ title, subtitle, action }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Stats({ items }) {
  return (
    <div className="stats">
      {items.map(([label, value]) => (
        <div className="panel stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, close, children }) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close}>×</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export default App;