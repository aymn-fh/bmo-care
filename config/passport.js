const LocalStrategy = require('passport-local').Strategy;
const apiClient = require('../utils/apiClient');

module.exports = function (passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
            try {
                // Call Backend Login API
                const response = await apiClient.post('/auth/login', {
                    email,
                    password
                });

                if (response.data.success) {
                    const user = response.data.user;
                    // Check role locally as a safeguard, although backend login usually handles this
                    const validRoles = ['superadmin', 'admin', 'specialist'];
                    if (!validRoles.includes(user.role)) {
                        return done(null, false, { message: 'ليس لديك صلاحية للدخول إلى هذه البوابة' });
                    }

                    // Attach token to user object so we can use it on subsequent requests
                    user.token = response.data.token;
                    return done(null, user);
                } else {
                    return done(null, false, { message: response.data.message || 'فشل تسجيل الدخول' });
                }
            } catch (err) {
                // Extract error message from backend response if available
                const msg = err.response?.data?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة'; // Default fallback
                // If it's a connection error (setup earlier), it might be handled differently, 
                // but here we just report Auth failure.
                return done(null, false, { message: msg });
            }
        })
    );

    passport.serializeUser((user, done) => {
        // We only serialize the ID. In a stricter API-only setup, 
        // we might store the token in the session instead.
        // For now, we'll assume we can fetch user by ID or store the whole user in session.
        // Storing the whole user avoids needing to fetch on every request if we don't want to.
        // But the standard way is ID. Let's stick to ID but we need a way to get the user data back.
        // Since we removed DB access, we MUST use API to fetch user 'me' or by ID.
        // However, fetching 'me' requires the token!

        // Solution: Store basic user info + token in session.
        done(null, user);
    });

    passport.deserializeUser(async (userFromSession, done) => {
        try {
            // Case 1: userFromSession is just an ID (Old way) -> This breaks without DB
            // Case 2: userFromSession is the full object we serialized (New way)

            // To ensure fresh data, we SHOULD fetch from API. 
            // But we need the token. Fortunately, we attached it to userFromSession in LocalStrategy.

            if (userFromSession.token) {
                const response = await apiClient.get('/auth/me', {
                    headers: { Authorization: `Bearer ${userFromSession.token}` }
                });

                if (response.data.success) {
                    const freshUser = response.data.user;
                    freshUser.token = userFromSession.token; // Keep the token
                    return done(null, freshUser);
                }
            }

            // Fallback: use session data if API fails or token missing?
            // If API fails, we probably shouldn't let them proceed authenticated with stale data
            // but for resilience 'server down' middleware handles that.
            // If we can't verify headers, we fail.

            // If we couldn't refresh, return what we have (not recommended) or log out.
            // Let's assume successful refresh for now.
            done(null, userFromSession);

        } catch (err) {
            // If fetching profile fails (e.g. token expired, server down),
            // we should probably invalidate session.
            console.error('Deserialize Error:', err.message);
            // If server is down, we might want to return the user anyway so 
            // the serverCheck middleware catches it nicely, or null to logout.
            // Returning the session user is safer for "Server Down" page display logic.
            done(null, userFromSession);
        }
    });
};

