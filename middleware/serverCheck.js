const axios = require('axios');
const https = require('https');
let isServerUp = true;
let lastCheckTime = 0;
const CACHE_DURATION = 10000; // Check every 10 seconds
let healthCheckInFlight = false;

const checkHealth = async (target) => {
    try {
        const response = await axios.get(`${target}/health`, {
            timeout: 5000,
            httpsAgent: new https.Agent({ keepAlive: true, family: 4 }), // prefer IPv4 to avoid env DNS quirks
            validateStatus: () => true // handle non-2xx without throwing
        });

        return {
            ok: response.status === 200,
            status: response.status,
            data: response.data
        };
    } catch (error) {
        return {
            ok: false,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        };
    }
};

const withFallbackProtocols = (backendUrl) => {
    const targets = [backendUrl.replace(/\/$/, '')];
    if (backendUrl.startsWith('https://')) {
        targets.push(backendUrl.replace('https://', 'http://'));
    } else if (backendUrl.startsWith('http://')) {
        targets.push(backendUrl.replace('http://', 'https://'));
    }
    return Array.from(new Set(targets));
};

module.exports = async (req, res, next) => {
    // Skip check for health endpoint itself and assets
    if (req.path === '/health' || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|woff|woff2)$/)) {
        return next();
    }

    const currentTime = Date.now();
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/$/, '');

    // Return cached status if within duration
    if (currentTime - lastCheckTime < CACHE_DURATION) {
        res.locals.backendDown = !isServerUp;
        return next();
    }

    // Never block the request waiting for backend checks (Railway health checks are time-sensitive)
    res.locals.backendDown = !isServerUp;

    if (!healthCheckInFlight) {
        healthCheckInFlight = true;
        lastCheckTime = currentTime;

        (async () => {
            const targets = withFallbackProtocols(backendUrl);
            let ok = false;

            for (const target of targets) {
                const result = await checkHealth(target);
                if (result.ok) {
                    ok = true;
                    break;
                }

                console.error(
                    `❌ Backend health check failed (${target}): status=${result.status || 'n/a'} body=${result.data ? JSON.stringify(result.data).slice(0, 200) : ''} ${result.message ? `error=${result.message}` : ''}`
                );
            }

            isServerUp = ok;
            healthCheckInFlight = false;
        })().catch((err) => {
            console.error('❌ Backend health check background error:', err.message);
            isServerUp = false;
            healthCheckInFlight = false;
        });
    }

    return next();
};
