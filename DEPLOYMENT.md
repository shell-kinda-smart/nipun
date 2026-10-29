# Deploying PayLens

The application is two pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| The repository root | Vite + React + TypeScript, built to `dist/` | Vercel |
| `backend/` | PHP 8.2+ API, no framework, no Composer | Any PHP 8.2+ host with MySQL 8 |

The frontend is static and deploys to Vercel in one click. The API is PHP and
needs a PHP host — Vercel does not run this application on its own.

---

## 1. The API

### What it needs

- PHP 8.2 or newer with `pdo_mysql`
- MySQL 8.x
- The document root pointed at `backend/public`

### On the server

```bash
# 1. The database
mysql -u root -p -e "CREATE DATABASE paylens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. The code
git clone <your repository> paylens
cd paylens

# 3. The environment — every value is also settable as a real environment
#    variable, which is what a PaaS deployment should use.
cp backend/.env.example backend/.env
```

Set these in `backend/.env` (or as environment variables):

```ini
APP_ENV=production
APP_DEBUG=false
APP_DEMO_MODE=true          # keep the one-click demo sign-in; turn off for a real deployment
APP_URL=https://api.example.com
APP_FRONTEND_URL=https://paylens.vercel.app

DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paylens
DB_USERNAME=paylens
DB_PASSWORD=<a strong password>

SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=None # only when the frontend is on another host
CORS_ORIGINS=https://paylens.vercel.app

PAYLENS_SEED_PASSWORD=<a strong password>
```

> `CORS_ORIGINS` is a comma-separated list of the exact origins allowed to
> call the API. `SESSION_COOKIE_SAMESITE=None` and `SESSION_COOKIE_SECURE=true`
> are needed only when the frontend and the API are on **different** hosts:
> a browser only sends a cross-site session cookie under those two settings.
> Both hosts must be on HTTPS.

### Create the schema and the demo data

```bash
php backend/bin/migrate.php      # apply every migration
php backend/bin/setup.php         # load the demo dataset
```

`setup.php` is safe to re-run: it applies pending migrations and leaves an
existing dataset alone.

### Serve it

With Nginx, the document root is `backend/public` and every request that is
not a file is handed to `backend/public/router.php`:

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    root /var/www/paylens/backend/public;
    index index.php;

    location / {
        try_files $uri $uri/ /router.php$is_args$args;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

The built-in PHP server works too, for a quick check:

```bash
php -S 127.0.0.1:8080 -t backend/public backend/public/router.php
```

### Check it

```bash
curl https://api.example.com/api/auth/demo-users
```

---

## 2. The frontend on Vercel

### With the Git repository

1. Push the code to GitHub, GitLab or Bitbucket.
2. In Vercel, **Add New → Project** and import the repository.
3. Leave everything on the defaults. `vercel.json` already sets the build
   command, the output directory and the SPA rewrite.
4. Set the environment variable:

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://api.example.com` |

   Leave it unset if the API is served from the same origin as the frontend.

5. **Deploy.**

### From the command line

```bash
npm install -g vercel
vercel login
vercel --prod --build-env VITE_API_URL=https://api.example.com
```

### Why the rewrite is needed

The frontend uses the HTML5 history API, so `/employees/EMP001` is a real
URL. Without the rewrite in `vercel.json`, Vercel would answer it with a 404
instead of `index.html`. The rewrite deliberately leaves `/api/*` alone.

---

## 3. Putting both on one host

This is the simpler arrangement, and it avoids CORS and cross-site cookies
entirely: build the frontend and serve it from the same origin as the API.

```bash
npm run build
cp -r dist/* /var/www/paylens/backend/public/
```

Nginx then serves `index.html` for any path that is not a file and not under
`/api`:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location /api/ {
    try_files $uri $uri/ /router.php$is_args$args;
}
```

Leave `VITE_API_URL` unset and `CORS_ORIGINS` empty in this arrangement.

---

## 4. Before the demo

- [ ] `APP_ENV=production` and `APP_DEBUG=false`
- [ ] `PAYLENS_SEED_PASSWORD` changed from the default
- [ ] `DB_PASSWORD` is not the default
- [ ] Both hosts on HTTPS
- [ ] `CORS_ORIGINS` lists the frontend's exact origin
- [ ] `php backend/tests/run.php` passes
- [ ] The demo accounts are signable from the deployed frontend
