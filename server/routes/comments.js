const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Edit own comment
router.put('/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT id, user_id FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own comments.' });

  const text = String(req.body.body || '').trim();
  if (!text || text.length > 2000) return res.status(400).json({ error: 'Comment is required (max 2,000 characters).' });

  db.prepare("UPDATE comments SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(text, comment.id);
  const updated = db
    .prepare(`SELECT c.id, c.body, c.created_at, c.updated_at, c.user_id, u.username AS author
              FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`)
    .get(comment.id);
  res.json({ comment: updated });
});

// Delete: the comment's author or the post's author
router.delete('/:id', requireAuth, (req, res) => {
  const row = db
    .prepare(`SELECT c.id, c.user_id, p.user_id AS post_owner
              FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?`)
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Comment not found.' });
  if (row.user_id !== req.user.id && row.post_owner !== req.user.id)
    return res.status(403).json({ error: 'You cannot delete this comment.' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(row.id);
  res.status(204).end();
});

module.exports = router;
