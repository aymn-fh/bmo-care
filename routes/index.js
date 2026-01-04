const express = require('express');
const router = express.Router();
const { ensureAuthenticated, redirectByRole } = require('../middleware/auth');

// Home page - redirect based on auth status
router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return redirectByRole(req, res);
    }

    // Return 200 on `/` (avoid health-check failures on 302 redirects in some hosts)
    return res.render('auth/login', {
        title: res.locals.__('loginTitle'),
        layout: false
    });
});

module.exports = router;
