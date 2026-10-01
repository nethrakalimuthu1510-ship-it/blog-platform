const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const POST_SELECT = `
  SELECT p.id, p.title, p.body, p.created_at, p.updated_at, p.user_id,
         u.username AS author,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.user_id`;

const COMMENT_SELECT = `
  SELECT c.id, c.body, c.created_at, c.updated_at, c.user_id, u.username AS author
  FROM comments c JOIN users u ON u.id = c.user_id`;

function validatePost(body) {
  const title = String(body.title || '').trim();
  const text = String(body.body || '').trim();
  if (!title || title.length > 150) return { error: 'Title is required (max 150 characters).' };
  if (!text || text.length > 20000) return { error: 'Post body is required (max 20,000 characters).' };
  return { title, body: text };
}

// List posts (search + pagination)
router.get('/', (req, res) => {
  const limit = 8;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const q = `%${String(req.query.q || '').trim()}%`;
  const where = 'WHERE p.title LIKE @q OR p.body LIKE @q';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM posts p ${where}`).get({ q }).n;
  const rows = db
    .prepare(`${POST_SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT @limit OFFSET @offset`)
    .all({ q, limit, offset: (page - 1) * limit });

  const posts = rows.map(({ body, ...rest }) => ({
    ...rest,
    excerpt: body.length > 220 ? body.slice(0, 220).trimEnd() + '…' : body,
  }));
  res.json({ posts, page, pages: Math.max(1, Math.ceil(total / limit)), total });
});

// Single post
router.get('/:id', (req, res) => {
  const post = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json({ post });
});

// Create
router.post('/', requireAuth, (req, res) => {
  const v = validatePost(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const info = db
    .prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)')
    .run(req.user.id, v.title, v.body);
  res.status(201).json({ post: db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(info.lastInsertRowid) });
});

// Update (author only)
router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own posts.' });

  const v = validatePost(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  db.prepare("UPDATE posts SET title = ?, body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(v.title, v.body, req.params.id);
  res.json({ post: db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.params.id) });
});

// Delete (author only; comments cascade)
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own posts.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Comments on a post
router.get('/:id/comments', (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const comments = db.prepare(`${COMMENT_SELECT} WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`).all(req.params.id);
  res.json({ comments });
});

router.post('/:id/comments', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const text = String(req.body.body || '').trim();
  if (!text || text.length > 2000) return res.status(400).json({ error: 'Comment is required (max 2,000 characters).' });
  const info = db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)').run(req.params.id, req.user.id, text);
  res.status(201).json({ comment: db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid) });
});

module.exports = router;
