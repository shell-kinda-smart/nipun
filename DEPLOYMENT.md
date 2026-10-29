# Deploying PayLens on Vercel

PayLens deploys as one Vercel project:

- Vite builds the React frontend into the dist directory.
- api/index.php runs the existing PHP API through the vercel-php runtime.
- /api/* stays on the same origin as the frontend, so sessions do not need
  cross-site cookie or CORS exceptions.
- PostgreSQL stores all PayLens tables in a dedicated paylens schema.

The database may be shared with another application. PostgreSQL schemas are
separate namespaces, so DB_SCHEMA=paylens prevents PayLens migrations and
queries from reading or changing tables in public or any other schema.

## 1. Environment file

For the zero-configuration demo, import the existing
rags-to-riches/.env file into Vercel's Environment Variables screen. PayLens
uses its DATABASE_URL and ignores the unrelated Rags to Riches variables.
Do not commit this file: the GitHub repository is public.

No additional variables are required. On Vercel, PayLens automatically uses
these safe demo defaults:

| Variable | Value |
|---|---|
| DATABASE_URL | Read from the imported environment file |
| DB_DRIVER | Detected as pgsql from DATABASE_URL |
| DB_SCHEMA | paylens |
| APP_ENV | demo |
| APP_DEMO_MODE | true |
| APP_AUTO_SETUP | true |
| APP_URL | Detected from Vercel |
| APP_FRONTEND_URL | Detected from Vercel |
| APP_TIMEZONE | Asia/Kolkata |
| SESSION_COOKIE_SECURE | true |
| SESSION_COOKIE_SAMESITE | Lax |

Leave VITE_API_URL and CORS_ORIGINS unset. The frontend and API use the same
Vercel origin.

Never paste database credentials into a tracked file. Vercel encrypts project
environment variables; backend/.env is ignored by both Git and Vercel.

## 2. Automatic isolated schema setup

The first API request automatically creates the paylens schema, applies all
pending migrations and loads the fictional demo dataset. PostgreSQL advisory
locking prevents concurrent Vercel cold starts from racing. Existing data is
left alone on later starts.

## 3. Import the GitHub repository

1. Open the Vercel dashboard and choose Add New → Project.
2. Import shell-kinda-smart/nipun.
3. Keep the repository root as the project root.
4. Vercel reads vercel.json; the expected settings are:
   - Framework: Vite
   - Build command: npm run build
   - Output directory: dist
5. Import rags-to-riches/.env in the Environment Variables screen.
6. Select Deploy.
7. Open the deployed site. Its first API request performs the isolated setup.

Future pushes to main create new production deployments automatically.

## 4. Verify the deployment

Check these in order:

~~~text
https://YOUR-DOMAIN/api/auth/demo-users
https://YOUR-DOMAIN/
https://YOUR-DOMAIN/employees
~~~

The first URL must return JSON, the home page must load, and refreshing a
client-side route such as /employees must not return 404.

Then sign in, create or edit a test employee, and confirm the change survives
a refresh. That verifies the PHP function, session cookie and PostgreSQL
schema together.

## Notes

- Vercel's PHP support uses the recommended community vercel-php runtime, not
  an official first-party PHP runtime.
- SQLite must not be used in production because Vercel Functions have an
  ephemeral filesystem.
- Keep the Vercel Function region close to the PostgreSQL region to reduce
  latency.
