require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

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
    sessionOptions.store = MongoStore.create({
        mongoUrl: sessionMongoUrl,
        ttl: 14 * 24 * 60 * 60 // 14 days
    });
}

app.use(session(sessionOptions));

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

app.use('/auth', require('./routes/auth'));
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

