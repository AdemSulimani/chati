/**
 * Middleware për validim të të dhënave (req.body).
 */

export function validateRegister(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dhe fjalëkalimi janë të detyrueshëm' });
  }
  next();
}

export function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dhe fjalëkalimi janë të detyrueshëm' });
  }
  next();
}
