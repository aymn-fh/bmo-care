require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('SIGTERM', () => {
    console.error('⚠️ Received SIGTERM (container stopping)');
});

process.on('SIGINT', () => {
    console.error('⚠️ Received SIGINT');
});

// Normalize backend URL and provide a sane default for local dev.
const normalizeBackendUrl = (raw) => (raw || 'http://localhost:8080').replace(/\/$/, '');
const BACKEND_URL = normalizeBackendUrl(process.env.BACKEND_URL);
process.env.BACKEND_URL = BACKEND_URL; // Keep other modules (apiClient, serverCheck) in sync.
console.log('BACKEND_URL =', BACKEND_URL);

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

// Proxy Socket.IO to backend (chat realtime)
app.use('/socket.io', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn'
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

    // Normalize logic to avoid double slashes
    const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
    const path = req.url.startsWith('/') ? req.url : `/${req.url}`;

    res.redirect(`${baseUrl}/uploads${path}`);
});

// Session
const sessionOptions = {
    secret: process.env.SESSION_SECRET || 'keyboard_cat',
    resave: false,
    saveUninitialized: false
};

// Production-ready session store (optional)
// Set one of: SESSION_MONGO_URL, MONGO_URI, MONGODB_URI
const sessionMongoUrl = process.env.SESSION_MONGO_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (sessionMongoUrl) {
    app.set('trust proxy', 1); // required on many hosted platforms when behind a proxy
    try {
        // connect-mongo has had multiple APIs across versions and CJS/ESM.
        // This tries the modern API first, then falls back to the legacy factory API.
        // If anything fails, we log and continue with MemoryStore (so the container stays up).
        const connectMongo = require('connect-mongo');
        const MongoStore = connectMongo?.default || connectMongo;

        if (MongoStore && typeof MongoStore.create === 'function') {
            sessionOptions.store = MongoStore.create({
                mongoUrl: sessionMongoUrl,
                ttl: 14 * 24 * 60 * 60 // 14 days
            });
        } else if (typeof MongoStore === 'function') {
            // Legacy API: require('connect-mongo')(session)
            const MongoStoreClass = MongoStore(session);
            sessionOptions.store = new MongoStoreClass({
                mongoUrl: sessionMongoUrl,
                ttl: 14 * 24 * 60 * 60
            });
        } else {
            console.error('⚠️ SESSION_MONGO_URL provided but connect-mongo API was not recognized; using MemoryStore');
        }
    } catch (err) {
        console.error('⚠️ Failed to initialize Mongo session store; using MemoryStore:', err.message);
    }
}

app.use(session(sessionOptions));

console.log('NODE_ENV =', process.env.NODE_ENV);
console.log('SESSION_STORE =', sessionMongoUrl ? 'mongo' : 'memory');

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

// Media helper so views can build absolute URLs for uploads
const buildUploadUrl = (value) => {
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    const cleaned = value.replace(/^\/+/, '').replace(/^uploads\/+/, '');
    return `${BACKEND_URL}/uploads/${cleaned}`;
};

app.use((req, res, next) => {
    res.locals.uploadUrl = buildUploadUrl;
    res.locals.uploadBase = `${BACKEND_URL}/uploads`;
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

// Server check middleware
const serverCheck = require('./middleware/serverCheck');
app.use(serverCheck);

// Routes
app.use('/', require('./routes/index'));

// Language switcher (used by header links)
app.get('/lang/:lang', (req, res) => {
    const lang = String(req.params.lang || '').toLowerCase();
    if (!['ar', 'en'].includes(lang)) {
        const fallback = req.get('Referer') || '/';
        return res.redirect(fallback);
    }

    // 1 year
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
    const back = req.get('Referer') || '/';
    return res.redirect(back);
});

app.use('/auth', require('./routes/auth'));
app.use('/chat', require('./routes/chat'));
app.use('/admin', require('./routes/admin'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/specialist/words', require('./routes/words'));
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

