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

## 1. Required Vercel environment variables

Add these in Project Settings → Environment Variables for Production, Preview
and Development:

| Variable | Value |
|---|---|
| DATABASE_URL | PostgreSQL/Neon pooled connection URL |
| DB_DRIVER | pgsql |
| DB_SCHEMA | paylens |
| APP_ENV | production for real use; demo for a public fictional-data demo |
| APP_DEBUG | false |
| APP_DEMO_MODE | false for real use; true only with APP_ENV=demo |
| APP_URL | Your final Vercel URL, for example https://nipun.vercel.app |
| APP_FRONTEND_URL | The same Vercel URL |
| APP_TIMEZONE | Asia/Kolkata |
| SESSION_COOKIE_SECURE | true |
| SESSION_COOKIE_SAMESITE | Lax |
| PAYLENS_SEED_PASSWORD | A new strong password |
| APP_SETUP_TOKEN | A temporary random value of at least 32 characters |

Leave VITE_API_URL and CORS_ORIGINS unset. The frontend and API use the same
Vercel origin.

Never paste database credentials into a tracked file. Vercel encrypts project
environment variables; backend/.env is ignored by both Git and Vercel.

## 2. Create and seed the isolated schema

Before the first deployment, run the migrations and optional demo seed with
the same DATABASE_URL, DB_DRIVER=pgsql and DB_SCHEMA=paylens values:

~~~bash
php backend/bin/migrate.php
php backend/bin/setup.php
~~~

migrate.php only applies missing migrations. setup.php leaves an existing
dataset alone.

If PHP is not installed locally, deploy once with APP_SETUP_TOKEN set and call
the protected one-time setup function:

~~~bash
curl -X POST https://YOUR-DOMAIN/api/setup \
  -H "Authorization: Bearer YOUR_APP_SETUP_TOKEN"
~~~

After it succeeds, remove APP_SETUP_TOKEN from Vercel and redeploy. The setup
URL then returns 404. Never commit or share this token.

## 3. Import the GitHub repository

1. Open the Vercel dashboard and choose Add New → Project.
2. Import shell-kinda-smart/nipun.
3. Keep the repository root as the project root.
4. Vercel reads vercel.json; the expected settings are:
   - Framework: Vite
   - Build command: npm run build
   - Output directory: dist
5. Add the environment variables above.
6. Select Deploy.
7. Run the one-time setup call from section 2.
8. Remove APP_SETUP_TOKEN and redeploy.

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
