# Marginalia: Blog Platform with Comments

A full-stack blog: users register and log in, write, edit and delete posts, and discuss them in comments.

**Stack:** Node.js + Express (REST API), SQLite (built-in `node:sqlite`), JWT auth with bcrypt-hashed passwords, and a vanilla JS single-page frontend served by the same server.

## Run it

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`, so nothing needs compiling).

```bash
npm install
cp .env.example .env      # then set JWT_SECRET to a long random string
npm start
```

Open http://localhost:3000. The database file is created automatically in `data/blog.db`.

## Folder structure

```
blog-platform/
├── package.json
├── .env.example
├── server/
│   ├── index.js            Express app, static hosting, error handling
│   ├── config.js           Environment settings
│   ├── db.js               SQLite connection and schema (users, posts, comments)
│   ├── middleware/auth.js  JWT check (requireAuth)
│   └── routes/
│       ├── auth.js         Register, login, current user
│       ├── posts.js        Post CRUD, search/pagination, comments per post
│       └── comments.js     Edit and delete a comment
└── public/
    ├── index.html
    ├── style.css
    └── app.js              Views, hash router, API client
```

## REST API

Send the token as `Authorization: Bearer <token>` for routes marked with a lock.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | | `{username, email, password}` returns `{token, user}` |
| POST | /api/auth/login | | `{identifier, password}` (username or email) |
| GET | /api/auth/me | lock | Current user |
| GET | /api/posts?q=&page= | | List posts, 8 per page, optional search |
| GET | /api/posts/:id | | One post |
| POST | /api/posts | lock | `{title, body}` |
| PUT | /api/posts/:id | lock | Author only |
| DELETE | /api/posts/:id | lock | Author only; deletes its comments too |
| GET | /api/posts/:id/comments | | Comments on a post |
| POST | /api/posts/:id/comments | lock | `{body}` |
| PUT | /api/comments/:id | lock | Comment author only |
| DELETE | /api/comments/:id | lock | Comment author or post author |

## Quick API test

```bash
curl -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"ada","email":"ada@example.com","password":"password123"}'
```

## Security notes

- Passwords are hashed with bcrypt; SQL uses prepared statements.
- The frontend inserts user content as text nodes only, so posts and comments cannot inject HTML.
- Before deploying publicly, add HTTPS, rate limiting on `/api/auth`, and a strong `JWT_SECRET`.

## Ideas to extend

Likes, tags, user profile pages, Markdown rendering (sanitized), image uploads, email verification, switching SQLite for PostgreSQL.
