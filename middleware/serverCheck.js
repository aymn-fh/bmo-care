const axios = require('axios');
let isServerUp = true;
let lastCheckTime = 0;
const CACHE_DURATION = 10000; // Check every 10 seconds

module.exports = async (req, res, next) => {
    // Skip check for health endpoint itself and assets
    if (req.path === '/health' || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|woff|woff2)$/)) {
        return next();
    }

    const currentTime = Date.now();
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/$/, '');

    // Return cached status if within duration
    if (isServerUp && (currentTime - lastCheckTime < CACHE_DURATION)) {
        return next();
    }

    try {
        await axios.get(`${backendUrl}/health`, { timeout: 2000 });
        isServerUp = true;
        lastCheckTime = currentTime;
        next();
    } catch (error) {
        console.error('❌ Backend Server is DOWN:', error.message);
        isServerUp = false;

        // If it's an API request (AJAX), return JSON error
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(503).json({
                success: false,
                message: 'عذراً، الخادم متوقف حالياً للصيانة. يرجى المحاولة لاحقاً.'
            });
        }

        // Otherwise render error page
        res.status(503).render('errors/service-unavailable', {
            layout: false, // No layout to avoid dependencies
            title: 'الخدمة غير متاحة'
        });
    }
};
