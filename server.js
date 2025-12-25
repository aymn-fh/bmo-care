require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const BACKEND_URL = process.env.BACKEND_URL;

if (!BACKEND_URL) {
    console.error('❌ BACKEND_URL is missing');
    process.exit(1);
}

// Proxy API
app.use('/api', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: true
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Upload redirect
app.use('/uploads', (req, res) => {
    res.redirect(`${BACKEND_URL}/uploads${req.url}`);
});

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Passport
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// Flash
app.use(flash());

// Globals
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.lang = req.cookies.lang || 'ar';
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/specialist', require('./routes/specialist'));

// Health
app.get('/health', (req, res) => {
    res.send('🌐 Web Portal is running');
});

// 404
app.use((req, res) => {
    res.status(404).render('errors/404');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Web Portal running on port ${PORT}`);
});
