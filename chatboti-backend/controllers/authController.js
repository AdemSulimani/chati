/**
 * Kontrolleri i autentifikimit — logjika e biznesit për regjistrim dhe login.
 */

export async function register(req, res, next) {
  try {
    // TODO: krijo përdorues në DB, hash fjalëkalimin, kthe JWT ose user
    res.status(201).json({ message: 'Regjistrim i suksesshëm', user: req.body });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    // TODO: kontrollo kredencialet, kthe JWT
    res.json({ message: 'Login i suksesshëm', token: 'jwt-placeholder' });
  } catch (err) {
    next(err);
  }
}
