const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureSpecialist } = require('../middleware/auth');
const apiClient = require('../utils/apiClient');
const FormData = require('form-data');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

// Apply specialist middleware to all routes
router.use(ensureSpecialist);


// Dashboard
router.get('/', async (req, res) => {
    try {
        // Fetch dashboard stats from API (New endpoint added to backend)
        const response = await apiClient.authGet(req, '/specialist/dashboard');

        // Default values if API call fails or returns partial data
        let stats = { parents: 0, children: 0, pendingRequests: 0 };
        let recentChildren = [];

        if (response.data.success) {
            stats = response.data.stats;
            recentChildren = response.data.recentChildren || [];
        }

        res.render('specialist/dashboard', {
            title: res.locals.__('dashboard'),
            stats,
            recentChildren
        });
    } catch (error) {
        console.error('Dashboard Error:', error.message);
        // Render with empty data on error so page still loads
        res.render('specialist/dashboard', {
            title: res.locals.__('dashboard'),
            stats: { parents: 0, children: 0, pendingRequests: 0 },
            recentChildren: []
        });
    }
});

// Chat Page
router.get('/chat', async (req, res) => {
    try {
        res.render('specialist/chat', {
            title: 'الدردشة',
            activePage: 'chat'
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});

// ========================================
// PARENTS
// ========================================

// List ALL KEY parents (User requested "All parents")
router.get('/parents', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/parents (plural) in backend/routes/specialist.js
        const response = await apiClient.authGet(req, '/specialists/parents');
        const parents = response.data.success ? response.data.parents : [];

        // Add isLinked flag (always true for this view as backend returns linked parents)
        const parentsWithStatus = parents.map(p => ({
            ...p,
            isLinked: true
        }));

        res.render('specialist/parents', {
            title: res.locals.__('parentsList'),
            parents: parentsWithStatus
        });
    } catch (error) {
        console.error('List Parents Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});


// API endpoint to fetch parents as JSON (Used by children.ejs modal)
// Proxies to backend
router.get('/api/parents', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/specialists/parents');

        res.json({
            success: true,
            parents: response.data.success ? response.data.parents : []
        });
    } catch (error) {
        console.error('API Parents Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API endpoint to create child (Used by children.ejs modal)
// Proxies to backend
router.post('/api/create-child', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/create-child
        const response = await apiClient.authPost(req, '/specialists/create-child', req.body);

        res.json(response.data);
    } catch (error) {
        console.error('Create Child Proxy Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
});


// View parent details with their children
router.get('/parents/:id', async (req, res) => {
    try {
        // We don't have a direct "get parent details" in specialist.js EXCEPT via getting linked parents list
        // However, we can use /specialists/search-parent?email=... if we had email.
        // Or we can assume /specialists/parents returns full object? It returns "select: '_id name email phone profilePhoto'".
        // To get children of a parent, we don't have a direct endpoint in specialist.js EITHER!

        // Wait, backend/routes/specialist.js has NO endpoint to get parent details + children.
        // But admin.js has /admin/parents/:id. 
        // We might need to fetch /specialists/parents (find one) AND /specialists/my-children (filter by parent).

        // Let's implement this logic here:
        const [parentsResponse, childrenResponse] = await Promise.all([
            apiClient.authGet(req, '/specialists/parents'),
            apiClient.authGet(req, '/specialists/my-children')
        ]);

        const parent = parentsResponse.data.parents.find(p => p._id === req.params.id);
        const allChildren = childrenResponse.data.children || [];
        const children = allChildren.filter(c => c.parent && (c.parent._id === req.params.id || c.parent === req.params.id));

        if (!parent) {
            req.flash('error_msg', res.locals.__('pageNotFound'));
            return res.redirect('/specialist/parents');
        }

        res.render('specialist/parent-details', {
            title: parent.name,
            parent,
            children
        });
    } catch (error) {
        console.error('Parent Details Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/parents');
    }
});

// Unlink parent
router.post('/parents/:id/unlink', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/unlink-parent/:parentId
        const response = await apiClient.authDelete(req, `/specialists/unlink-parent/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', res.locals.__('deletedSuccessfully'));
        } else {
            req.flash('error_msg', response.data.message || res.locals.__('errorOccurred'));
        }
        res.redirect('/specialist/parents');
    } catch (error) {
        console.error('Unlink Parent Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/parents');
    }
});

// ========================================
// CHILDREN
// ========================================

// List my children
router.get('/children', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/my-children
        const response = await apiClient.authGet(req, '/specialists/my-children');
        const children = response.data.success ? response.data.children : [];

        res.render('specialist/children', {
            title: res.locals.__('myChildren'),
            children
        });
    } catch (error) {
        console.error('List Children Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});

// View child details and progress - REDIRECT TO ANALYTICS (Unified View)
router.get('/children/:id', async (req, res) => {
    res.redirect(`/specialist/child/${req.params.id}/analytics`);
});


// ========================================
// LINK REQUESTS
// ========================================

// List link requests
router.get('/requests', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/link-requests
        const response = await apiClient.authGet(req, '/specialists/link-requests');

        let pendingRequests = [];
        let historyRequests = [];

        if (response.data.success) {
            const requests = response.data.requests || [];
            pendingRequests = requests.filter(r => r.status === 'pending');
            historyRequests = requests.filter(r => r.status !== 'pending');
        }

        res.render('specialist/requests', {
            title: res.locals.__('linkRequests'),
            pendingRequests,
            historyRequests
        });
    } catch (error) {
        console.error('List Requests Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});

// Accept request
router.post('/requests/:id/accept', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/accept-link-request/:requestId
        const response = await apiClient.authPost(req, `/specialists/accept-link-request/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', res.locals.__('updatedSuccessfully'));
        } else {
            req.flash('error_msg', response.data.message || res.locals.__('errorOccurred'));
        }
        res.redirect('/specialist/requests');
    } catch (error) {
        console.error('Accept Request Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/requests');
    }
});

// Reject request
router.post('/requests/:id/reject', async (req, res) => {
    try {
        // CORRECTED PATH: /specialists/reject-link-request/:requestId
        const response = await apiClient.authPost(req, `/specialists/reject-link-request/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', res.locals.__('updatedSuccessfully'));
        } else {
            req.flash('error_msg', response.data.message || res.locals.__('errorOccurred'));
        }
        res.redirect('/specialist/requests');
    } catch (error) {
        console.error('Reject Request Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/requests');
    }
});


// ========================================
// ACCOUNT MANAGEMENT
// ========================================

// Account management page
// Account management page
router.get('/account', async (req, res) => {
    try {
        // Fetch both Linked Parents and Available (Unlinked) Parents
        const [linkedResponse, availableResponse] = await Promise.all([
            apiClient.authGet(req, '/specialists/parents'),
            apiClient.authGet(req, '/specialists/search-parent')
        ]);

        const linkedParents = linkedResponse.data.success ? linkedResponse.data.parents : [];
        const allParents = availableResponse.data.success ? availableResponse.data.parents : [];

        res.render('specialist/account', {
            title: res.locals.__('accountManagement'),
            allParents: allParents, // Available parents to link
            linkedParents: linkedParents, // Already linked parents
            currentSpecialistId: req.user.id
        });
    } catch (error) {
        console.error('Account Page Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});

// Search for parents
router.get('/account/search', async (req, res) => {
    try {
        const { query } = req.query;

        // CORRECTED PATH: /specialists/search-parent
        const response = await apiClient.authGet(req, '/specialists/search-parent', {
            params: { query }
        });

        // Backend only returns 'parents' list. It doesn't separate 'linkedParents' in this endpoint.
        // We might need to fetch linked parents separately to mark them?
        // Actually /search-parent logic in backend ALREADY EXCLUDES linked parents!
        // " _id: { $nin: linkedParentIds } // Exclude already linked parents " <-- Found in backend code

        const searchResults = response.data.success ? response.data.parents : [];

        // We also want to show currently linked parents? 
        // The view probably needs them. Let's fetch them too.
        const linkedResponse = await apiClient.authGet(req, '/specialists/parents');
        const linkedParents = linkedResponse.data.success ? linkedResponse.data.parents : [];

        res.render('specialist/account', {
            title: res.locals.__('accountManagement'),
            linkedParents: linkedParents,
            searchQuery: query || '',
            searchResults: searchResults
        });
    } catch (error) {
        console.error('Account Search Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/account');
    }
});

// Link a parent
router.post('/account/link/:parentId', async (req, res) => {
    try {
        const { parentId } = req.params;

        // CORRECTED PATH: /specialists/link-parent
        // Note: Backend expects parentId in BODY
        const response = await apiClient.authPost(req, `/specialists/link-parent`, { parentId });

        if (response.data.success) {
            req.flash('success_msg', res.locals.__('updatedSuccessfully'));
        } else {
            req.flash('error_msg', response.data.message || res.locals.__('errorOccurred'));
        }
        res.redirect('/specialist/account');
    } catch (error) {
        console.error('Account Link Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/account');
    }
});


// ===== PROFILE ROUTES =====

// Configure multer for profile photo upload (Memory Storage for Relay)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// View Profile
router.get('/profile', async (req, res) => {
    try {
        const [meResponse, dashboardResponse] = await Promise.all([
            apiClient.authGet(req, '/auth/me'),
            apiClient.authGet(req, '/specialist/dashboard')
        ]);

        const { user } = meResponse.data && meResponse.data.success ? meResponse.data : { user: req.user };

        const dashboardStats = dashboardResponse.data && dashboardResponse.data.success ? dashboardResponse.data.stats : null;
        const stats = {
            children: dashboardStats && typeof dashboardStats.children === 'number' ? dashboardStats.children : 0,
            parents: dashboardStats && typeof dashboardStats.parents === 'number' ? dashboardStats.parents : 0,
            sessions: dashboardStats && typeof dashboardStats.sessions === 'number' ? dashboardStats.sessions : 0
        };

        res.render('specialist/profile', {
            title: res.locals.__('profile'),
            user,
            stats
        });
    } catch (error) {
        console.error('Profile View Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist');
    }
});

// Update Profile
router.post('/profile/update', async (req, res) => {
    try {
        // CORRECTED PATH: /auth/profile (PUT)
        const response = await apiClient.authPut(req, '/auth/profile', req.body);

        if (response.data.success) {
            req.flash('success_msg', res.locals.__('updatedSuccessfully'));
        } else {
            req.flash('error_msg', response.data.message || 'فشل التحديث');
        }
        res.redirect('/specialist/profile');
    } catch (error) {
        console.error('Profile Update Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/profile');
    }
});

// Upload Profile Photo (Relay to Backend)
router.post('/profile/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'الرجاء اختيار صورة');
            return res.redirect('/specialist/profile');
        }

        const form = new FormData();
        form.append('photo', req.file.buffer, req.file.originalname);

        // We also need to send name/email/phone because /auth/profile expects them? 
        // No, /auth/profile puts body data.
        // Actually, /api/auth/profile handles multipart if we send it directly!
        // backend/routes/auth.js: router.put('/profile', protect, upload.single('photo'), ...)
        // So we can just proxy the whole request to /auth/profile!

        const authConfig = apiClient.withAuth(req);
        const headers = { ...authConfig.headers, ...form.getHeaders() };

        // Use authPut to /auth/profile which handles uploads
        const response = await apiClient.put('/auth/profile', form, { headers });

        if (response.data && response.data.success) {
            req.flash('success_msg', 'تم تحديث الصورة بنجاح');
        } else {
            console.error('Backend upload failed:', response.data);
            req.flash('error_msg', 'فشل تحميل الصورة على الخادم');
        }
        res.redirect('/specialist/profile');

    } catch (error) {
        console.error('Upload Relay Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/profile');
    }
});

// Change Password
router.post('/profile/change-password', async (req, res) => {
    try {
        // CORRECTED PATH: /auth/change-password (PUT)
        const response = await apiClient.authPut(req, '/auth/change-password', req.body);

        if (response.data.success) {
            req.flash('success_msg', 'تم تغيير كلمة المرور بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل تغيير كلمة المرور');
        }
        res.redirect('/specialist/profile');
    } catch (error) {
        console.error('Change Password Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/profile');
    }
});


// ===== CHILD ANALYTICS ROUTES =====

function _normalizeSessionsForCharts(progressSessions) {
    const sessions = Array.isArray(progressSessions) ? progressSessions : [];
    // Keep only the fields the portal charts expect.
    return sessions.slice(-30).map((s) => {
        const totalAttempts = Number(s.totalAttempts ?? s.total_attempts ?? 0) || 0;
        const successfulAttempts = Number(s.successfulAttempts ?? s.successful_attempts ?? 0) || 0;
        const failedAttempts = Number(s.failedAttempts ?? s.failed_attempts ?? 0) || Math.max(0, totalAttempts - successfulAttempts);
        const averageScore = Number(s.averageScore ?? s.average_score ?? 0) || 0;
        const duration = Number(s.duration ?? 0) || 0;
        const sessionDate = s.sessionDate ?? s.session_date;

        return {
            sessionDate,
            duration,
            totalAttempts,
            successfulAttempts,
            failedAttempts,
            averageScore,
            successRate: totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0,
        };
    });
}

function _flattenAttemptsFromProgress(progressSessions, limit = 50) {
    const sessions = Array.isArray(progressSessions) ? progressSessions : [];
    const attempts = [];
    for (const s of sessions) {
        const sessionDate = s.sessionDate ?? s.session_date;
        const sessionAttempts = Array.isArray(s.attempts) ? s.attempts : [];
        for (const a of sessionAttempts) {
            const target = a.word || a.letter || a.vowel || '';
            attempts.push({
                sessionDate,
                timestamp: a.timestamp,
                target,
                letter: a.letter,
                word: a.word,
                vowel: a.vowel,
                success: !!a.success,
                score: typeof a.score === 'number' ? a.score : undefined,
                pronunciationScore: typeof a.pronunciationScore === 'number' ? a.pronunciationScore : undefined,
                accuracyScore: typeof a.accuracyScore === 'number' ? a.accuracyScore : undefined,
                fluencyScore: typeof a.fluencyScore === 'number' ? a.fluencyScore : undefined,
                completenessScore: typeof a.completenessScore === 'number' ? a.completenessScore : undefined,
                recognizedText: a.recognizedText,
                referenceText: a.referenceText,
                analysisSource: a.analysisSource,
            });
        }
    }

    attempts.sort((a, b) => {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return tb - ta;
    });

    return attempts.slice(0, Math.max(1, Math.min(limit, 200)));
}

// Child Analytics Page (The Unified View)
router.get('/child/:id/analytics', async (req, res) => {
    try {
        const childId = req.params.id;

        // Always prefer /progress/child (most compatible). Other endpoints are optional.
        const progressResponse = await apiClient.authGet(req, `/progress/child/${childId}`);

        if (!progressResponse.data.success) {
            req.flash('error_msg', res.locals.__('not_found'));
            return res.redirect('/specialist/children');
        }

        const progress = progressResponse.data.progress;

        // Fetch full child details to display parent/specialist emails
        let childDetails = null;
        try {
            const childResp = await apiClient.authGet(req, `/children/${childId}`);
            childDetails = childResp?.data?.child || null;
        } catch (e) {
            console.warn('Child details fetch failed (will use progress.child):', e.message);
        }

        const child = childDetails || progress.child || await (async () => {
            // Fallback if child object not full
            // We can assume it is populated as per backend route logic
            return { name: 'Unknown', _id: req.params.id };
        })();

        // Sessions: prefer /progress/sessions; fallback to deriving from progress.sessions.
        let sessions = [];
        try {
            const sessionsResponse = await apiClient.authGet(req, `/progress/sessions/${childId}`);
            sessions = sessionsResponse?.data?.sessions || [];
        } catch (e) {
            const status = e?.response?.status;
            if (status !== 404) {
                console.warn('Sessions endpoint failed; falling back to progress.sessions:', e.message);
            }
            sessions = _normalizeSessionsForCharts(progress.sessions);
        }

        // Attempts: prefer /progress/attempts; fallback to flattening progress.sessions.
        let attempts = [];
        try {
            const attemptsResponse = await apiClient.authGet(req, `/progress/attempts/${childId}?limit=50`);
            attempts = (attemptsResponse?.data?.success)
                ? (attemptsResponse.data.attempts || [])
                : [];
        } catch (e) {
            const status = e?.response?.status;
            if (status !== 404) {
                console.warn('Attempts endpoint failed; falling back to progress.sessions:', e.message);
            }
            attempts = _flattenAttemptsFromProgress(progress.sessions, 50);
        }

        // The view expects progress.sessions.
        progress.sessions = sessions;

        // Final word analysis: take latest session's attempts and keep last attempt per target
        let finalWordAnalysis = [];
        try {
            const sessionsForFinal = Array.isArray(progress.sessions) ? progress.sessions : [];
            const latestSession = sessionsForFinal.length > 0 ? sessionsForFinal[sessionsForFinal.length - 1] : null;
            const sAttempts = latestSession && Array.isArray(latestSession.attempts) ? latestSession.attempts : [];
            const map = new Map(); // target -> last attempt
            for (const a of sAttempts) {
                const target = a.word || a.letter || a.vowel || '';
                if (!target) continue;
                const ts = new Date(a.timestamp || 0).getTime();
                const prev = map.get(target);
                if (!prev || ts >= new Date(prev.timestamp || 0).getTime()) {
                    map.set(target, a);
                }
            }
            finalWordAnalysis = Array.from(map.entries()).map(([target, a]) => ({
                target,
                recognizedText: a.recognizedText,
                score: typeof a.pronunciationScore === 'number' ? a.pronunciationScore : (typeof a.score === 'number' ? a.score : null),
                analysisSource: a.analysisSource,
            }));
        } catch (e) {
            console.warn('Failed to compute finalWordAnalysis:', e.message);
        }

        res.render('specialist/child-analytics', {
            title: `تحليلات ${child.name}`,
            child,
            progress,
            attempts,
            finalWordAnalysis
        });
    } catch (error) {
        const status = error?.response?.status;
        const url = error?.config?.url;
        console.error('Analytics View Error:', status ? `${status}` : error.message, url ? `url=${url}` : '');
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/children');
    }
});

// Child Analytics Data API
router.get('/child/:id/analytics/data', async (req, res) => {
    try {
        const childId = req.params.id;

        let sessions = [];
        try {
            const response = await apiClient.authGet(req, `/progress/sessions/${childId}`);
            sessions = (response.data && response.data.sessions) ? response.data.sessions : [];
        } catch (e) {
            const status = e?.response?.status;
            if (status !== 404) {
                console.warn('Analytics data sessions endpoint failed; falling back to /progress/child:', e.message);
            }
            const progressResponse = await apiClient.authGet(req, `/progress/child/${childId}`);
            const progress = progressResponse?.data?.progress;
            sessions = _normalizeSessionsForCharts(progress?.sessions);
        }

        const totalSessions = sessions.length;
        const totalAttempts = sessions.reduce((sum, s) => sum + (Number(s.totalAttempts) || 0), 0);
        const successfulAttempts = sessions.reduce((sum, s) => sum + (Number(s.successfulAttempts) || 0), 0);

        const successRate = totalAttempts > 0
            ? Math.round((successfulAttempts / totalAttempts) * 100)
            : 0;

        const averageScore = totalSessions > 0
            ? Math.round(sessions.reduce((sum, s) => sum + (Number(s.averageScore) || 0), 0) / totalSessions)
            : 0;

        // Simple difficulty buckets based on averageScore.
        const difficulty = sessions.reduce((acc, s) => {
            const score = Number(s.averageScore) || 0;
            if (score >= 80) acc.easy += 1;
            else if (score >= 50) acc.medium += 1;
            else acc.hard += 1;
            return acc;
        }, { easy: 0, medium: 0, hard: 0 });

        // Timeline: last 20 sessions
        const last = sessions.slice(-20);
        const timeline = {
            labels: last.map((s, i) => {
                const d = s.sessionDate ? new Date(s.sessionDate) : null;
                if (d && !Number.isNaN(d.getTime())) {
                    return d.toLocaleDateString('ar-SA');
                }
                return `جلسة ${i + 1}`;
            }),
            data: last.map(s => Math.round(Number(s.averageScore) || 0)),
        };

        // Skills: minimal "general" bucket so the UI has data.
        const skillsProgress = {
            general: {
                sessionsCount: totalSessions,
                averageScore,
            }
        };

        const chartData = {
            timeline,
            skills: {
                labels: ['عام'],
                data: [averageScore],
            },
            successRate: {
                labels: ['نجاح', 'محاولات أخرى'],
                data: [successRate, Math.max(0, 100 - successRate)],
            },
            difficulty,
        };

        res.json({
            success: true,
            sessions,
            stats: {
                totalSessions,
                totalAttempts,
                successfulAttempts,
                successRate,
                averageScore,
                skillsProgress,
            },
            chartData,
        });
    } catch (error) {
        const status = error?.response?.status;
        const url = error?.config?.url;
        console.error('Analytics Data API Error:', status ? `${status}` : error.message, url ? `url=${url}` : '');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Child Analytics PDF Export (for the header button)
router.get('/child/:id/analytics/pdf', async (req, res) => {
    try {
        const childId = req.params.id;

        // Build sessions list (same strategy as analytics/data)
        let sessions = [];
        try {
            const response = await apiClient.authGet(req, `/progress/sessions/${childId}`);
            sessions = (response.data && response.data.sessions) ? response.data.sessions : [];
        } catch (e) {
            const progressResponse = await apiClient.authGet(req, `/progress/child/${childId}`);
            const progress = progressResponse?.data?.progress;
            sessions = _normalizeSessionsForCharts(progress?.sessions);
        }

        const totalSessions = sessions.length;
        const totalAttempts = sessions.reduce((sum, s) => sum + (Number(s.totalAttempts) || 0), 0);
        const successfulAttempts = sessions.reduce((sum, s) => sum + (Number(s.successfulAttempts) || 0), 0);
        const failedAttempts = Math.max(0, totalAttempts - successfulAttempts);

        const successRate = totalAttempts > 0
            ? Math.round((successfulAttempts / totalAttempts) * 100)
            : 0;

        const averageScore = totalSessions > 0
            ? Math.round(sessions.reduce((sum, s) => sum + (Number(s.averageScore) || 0), 0) / totalSessions)
            : 0;

        // Child info for the PDF title (optional)
        let childName = '';
        let childAge = null;
        try {
            const childResp = await apiClient.authGet(req, `/children/${childId}`);
            childName = childResp?.data?.child?.name || '';
            childAge = childResp?.data?.child?.age ?? null;
        } catch (e) {
            // optional
        }

        const totalDuration = sessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
        const playMinutes = Math.max(0, Math.round(totalDuration));

        const avgSessionMinutes = totalSessions > 0
            ? Math.max(0, Math.round((totalDuration / totalSessions) * 10) / 10)
            : 0;

        const formatDate = (d) => {
            try {
                const dt = new Date(d);
                if (Number.isNaN(dt.getTime())) return '';
                return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
            } catch {
                return '';
            }
        };

        const withDate = sessions
            .map((s) => ({
                ...s,
                _t: new Date(s.sessionDate || 0).getTime(),
            }))
            .filter((s) => Number.isFinite(s._t) && s._t > 0)
            .sort((a, b) => a._t - b._t);

        const firstSessionDate = withDate.length ? formatDate(withDate[0].sessionDate) : '';
        const lastSessionDate = withDate.length ? formatDate(withDate[withDate.length - 1].sessionDate) : '';

        const bestSession = sessions.reduce((best, s) => {
            if (!best) return s;
            return (Number(s.averageScore) || 0) > (Number(best.averageScore) || 0) ? s : best;
        }, null);

        const worstSession = sessions.reduce((worst, s) => {
            if (!worst) return s;
            return (Number(s.averageScore) || 0) < (Number(worst.averageScore) || 0) ? s : worst;
        }, null);

        const lastSessions = withDate.slice(-8).reverse().map((s, idx) => ({
            index: (withDate.length - idx),
            date: formatDate(s.sessionDate) || '-',
            attempts: Number(s.totalAttempts) || 0,
            successRate: Math.round(Number(s.successRate) || 0),
            averageScore: Math.round(Number(s.averageScore) || 0),
            duration: Math.max(0, Math.round(Number(s.duration) || 0)),
        }));

        const recent = withDate.slice(-5);
        const recentAvgScore = recent.length
            ? Math.round(recent.reduce((sum, s) => sum + (Number(s.averageScore) || 0), 0) / recent.length)
            : 0;
        const recentSuccessRate = recent.length
            ? Math.round(recent.reduce((sum, s) => sum + (Number(s.successRate) || 0), 0) / recent.length)
            : 0;

        const now = new Date();
        const reportDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

        const ageNum = (typeof childAge === 'number' && Number.isFinite(childAge)) ? childAge : null;
        const childAgeText = ageNum ? `${ageNum} سنوات` : '5 سنوات';

        const childInitial = (childName || 'طفل').trim().slice(0, 1).toLowerCase();

        const tryReadFontBase64 = (candidates) => {
            for (const p of candidates) {
                try {
                    if (p && fs.existsSync(p)) {
                        return fs.readFileSync(p).toString('base64');
                    }
                } catch (e) {
                    // try next
                }
            }
            return null;
        };

        const tajawalFontBase64 = tryReadFontBase64([
            // If fonts are packaged inside specialist-portal later
            path.resolve(__dirname, '..', 'public', 'fonts', 'Tajawal-Regular.ttf'),
            // Monorepo local path
            path.resolve(__dirname, '..', '..', 'Child-Game', 'assets', 'fonts', 'Tajawal-Regular.ttf'),
        ]);

        const tajawalFontBoldBase64 = tryReadFontBase64([
            path.resolve(__dirname, '..', 'public', 'fonts', 'Tajawal-Bold.ttf'),
            path.resolve(__dirname, '..', '..', 'Child-Game', 'assets', 'fonts', 'Tajawal-Bold.ttf'),
        ]);

        // Template expects Cairo variables; we map to the packaged font files (Tajawal)
        // to ensure the PDF renders with embedded Arabic-friendly fonts in production.
        const cairoFontRegular = tajawalFontBase64;
        const cairoFontBold = tajawalFontBoldBase64;

        const html = await ejs.renderFile(
            path.join(__dirname, '..', 'views', 'specialist', 'child-analytics-pdf.ejs'),
            {
                // Backward-compatible names
                tajawalFontBase64,
                tajawalFontBoldBase64,

                // Current template variables
                cairoFontRegular,
                cairoFontBold,
                childName: childName || '---',
                childInitial,
                childAgeText,
                reportDate,
                totalSessions,
                totalAttempts,
                successfulAttempts,
                failedAttempts,
                averageScore,
                successRate,
                playTimeText: `${playMinutes} دقيقة`,
                avgSessionMinutes,
                firstSessionDate,
                lastSessionDate,
                bestSession: bestSession
                    ? {
                        date: formatDate(bestSession.sessionDate) || '-',
                        averageScore: Math.round(Number(bestSession.averageScore) || 0),
                        successRate: Math.round(Number(bestSession.successRate) || 0),
                    }
                    : null,
                worstSession: worstSession
                    ? {
                        date: formatDate(worstSession.sessionDate) || '-',
                        averageScore: Math.round(Number(worstSession.averageScore) || 0),
                        successRate: Math.round(Number(worstSession.successRate) || 0),
                    }
                    : null,
                lastSessions,
                recentAvgScore,
                recentSuccessRate,
            },
            { async: true }
        );

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'load' });

                        // Ensure print CSS rules (@page, print-color-adjust, etc.) are applied.
                        await page.emulateMediaType('print');

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                                landscape: true,
                                scale: 1,
                                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
            });

            // Puppeteer may return a Uint8Array in some environments.
            const pdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

                        // Guard: make sure we actually generated a PDF.
            const isPdf = pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
                        if (!isPdf) {
                                const debug = req.query.debug === '1' || process.env.NODE_ENV !== 'production';
                                if (debug) {
                    const head = pdfBuf.slice(0, 80).toString('utf8');
                                        throw new Error(`Generated output is not a PDF. Head=${JSON.stringify(head)}`);
                                }
                                throw new Error('Generated output is not a PDF');
                        }

                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Disposition', `attachment; filename=child-analytics-${childId}.pdf`);
            res.setHeader('Content-Length', String(pdfBuf.length));
            res.status(200).end(pdfBuf);
        } finally {
            await browser.close();
        }
    } catch (error) {
        const status = error?.response?.status;
        const url = error?.config?.url;
        console.error('Analytics PDF Error:', status ? `${status}` : error.message, url ? `url=${url}` : '', error?.stack || '');
        const debug = req.query.debug === '1' || process.env.NODE_ENV !== 'production';
        if (debug) {
            return res.status(500).send(`Failed to generate PDF: ${error?.message || error}`);
        }
        res.status(500).send('Failed to generate PDF');
    }
});

// ========================================
// CHAT REDIRECT
// ========================================
router.get('/chat/init/:userId', async (req, res) => {
    res.redirect('/specialist/chat?target=' + req.params.userId);
});

// ========================================
// SESSIONS LOG (Progress Reports)
// ========================================
router.get('/sessions', async (req, res) => {
    // Current backend does not seem to have a dedicated "search sessions" endpoint
    // It has /progress/child/:id which returns all sessions inside progress.
    // To list ALL sessions for ALL children, request /specialists/my-children then iterate?
    // That's too heavy.
    // We should implement /api/specialist/sessions in backend/routes/specialistPortal.js or specialist.js.
    // For now, let's keep it limited or assume we can filter locally if data is small?
    // Recommendation: Add endpoint to backend later. For now, try to do simple logic or disable.

    // We can use /progress/child/:id for the selected child only.
    try {
        const { child, childId, dateFrom, dateTo } = req.query;
        let sessions = [];

        // Fetch children for dropdown
        const childrenResponse = await apiClient.authGet(req, '/specialists/my-children');
        const children = childrenResponse.data.success ? childrenResponse.data.children : [];

        if (childId) {
            const progressResponse = await apiClient.authGet(req, `/progress/child/${childId}`);
            if (progressResponse.data.success && progressResponse.data.progress) {
                sessions = progressResponse.data.progress.sessions || [];
            }
        }

        // Filter by date locally
        if (dateFrom || dateTo) {
            const from = dateFrom ? new Date(dateFrom) : new Date(0);
            const to = dateTo ? new Date(dateTo) : new Date();
            sessions = sessions.filter(s => {
                const d = new Date(s.sessionDate);
                return d >= from && d <= to;
            });
        }

        res.render('specialist/sessions', {
            title: res.locals.__('sessionsLog') || 'سجل الجلسات',
            sessions: sessions,
            children: children,
            selectedChild: child || '',
            childIdInput: childId || '',
            dateFrom: dateFrom || '',
            dateTo: dateTo || '',
            activePage: 'sessions'
        });
    } catch (error) {
        console.error('Sessions Log Error:', error.message);
        req.flash('error_msg', 'Error loading sessions');
        res.redirect('/specialist');
    }
});

module.exports = router;