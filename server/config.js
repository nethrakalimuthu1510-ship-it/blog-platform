require('dotenv').config();
const crypto = require('crypto');

let secret = process.env.JWT_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[warn] JWT_SECRET is not set. Using a temporary secret; logins reset on every restart.');
  console.warn('       Copy .env.example to .env and set JWT_SECRET.');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};
