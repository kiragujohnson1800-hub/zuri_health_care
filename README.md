# Zuri Healthcare

Hospital appointment management application built with React, Vite, CSS,
Node.js, Express, MySQL, JWT, bcryptjs, and mysql2.

## Requirements

- Node.js 18 or later
- MySQL 8 or later

## Setup

1. Create the app's separate database by running `database/schema.sql` in MySQL.
2. Copy `.env.example` to `.env`.
3. Set your MySQL password and a secure `JWT_SECRET` in `.env`.
4. Install packages with `npm install`.
5. Start the application with `npm run dev`.
6. Open `http://localhost:5173`.

The API runs on `http://localhost:5000`. The server creates an initial
administrator using `ADMIN_EMAIL` and `ADMIN_PASSWORD` when it starts.

Patients can register through the app. Administrators can create doctor
accounts and manage patients and doctors.

Do not open the project directly through XAMPP/Apache before building; the
React source needs Vite to compile it. To serve it with Apache, run
`npm run build` and open the generated `dist` folder through Apache.

## Deploying to Vercel

The Vite frontend is built to `dist`, and `api/index.js` routes `/api/*`
requests to the Express API as a Vercel Function. Import the project into
Vercel with the Vite framework preset, build command `npm run build`, and
output directory `dist`.

Vercel cannot connect to MySQL running on your computer. Create a remotely
accessible MySQL database, import `database/schema.sql` into it, then set
these environment variables in the Vercel project:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`
- `DB_SSL=true` if the provider requires TLS; set `DB_SSL_CA` if it supplies a
  custom CA certificate
- `JWT_SECRET` to a long, unique random value
- `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`

The initial administrator is created on the first API request if that email
does not already exist. Existing account passwords are not overwritten.
Local `.env` values and local demo doctor accounts are not deployed; add real
doctor accounts after deployment.