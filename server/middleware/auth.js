const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../config');

function userFromRequest(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(payload.sub) || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
  req.user = user;
  next();
}

module.exports = { requireAuth };
