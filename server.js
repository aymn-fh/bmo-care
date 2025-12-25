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
console.log('BACKEND_URL =', BACKEND_URL);

if (!BACKEND_URL) {
    console.error('❌ BACKEND_URL is missing');
    process.exit(1);
}

// Proxy API
app.use('/api', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req) => {
        if (req.headers.cookie) {
            proxyReq.setHeader('cookie', req.headers.cookie);
        }
    }
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
    if (!BACKEND_URL) return res.status(500).send('Backend URL missing');
    res.redirect(`${BACKEND_URL}/uploads${req.url}`);
});

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboard_cat',
    resave: false,
    saveUninitialized: false
}));

// Passport
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// Flash
app.use(flash());

// Translation middleware (مهم جدًا قبل أي Route)
const translations = require('./config/translations');
app.use((req, res, next) => {
    const lang = req.cookies.lang || 'ar';
    res.locals.__ = (key) => translations[lang]?.[key] || translations['ar']?.[key] || key;
    res.locals.currentLang = lang;
    res.locals.isRTL = lang === 'ar';
    next();
});

// Globals
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.lang = req.cookies.lang || 'ar';
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/specialist', require('./routes/specialist'));
app.use('/settings', require('./routes/settings'));
app.use('/admin/activity', require('./routes/activity'));

// Health check
app.get('/health', (req, res) => {
    res.send('🌐 Web Portal is running');
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('errors/404');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Web Portal running on port ${PORT}`);
});

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // مهلة 30 ثانية
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });
