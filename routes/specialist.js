const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { ensureSpecialist } = require('../middleware/auth');
const apiClient = require('../utils/apiClient');
const FormData = require('form-data');

// Apply specialist middleware to all routes
router.use(ensureSpecialist);


// Dashboard
router.get('/', async (req, res) => {
    try {
        // Fetch dashboard stats from API
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
        const response = await apiClient.authGet(req, '/specialist/parents');
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
        // Fetch linked parents from backend
        // We can reuse the same endpoint /specialist/parents or a JSON specific one if exists
        // Let's assume /specialist/parents works but returns JSON if Accept header is json, 
        // OR we just use the data returned for the view.
        // Actually, let's just returned the data we need.
        const response = await apiClient.authGet(req, '/specialist/parents');

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
        // Forward request to backend /api/children (or specialist specific route if needed)
        // Ensure we pass necessary data. The backend usually expects parentId in body.

        const response = await apiClient.authPost(req, '/children', req.body);

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
        const response = await apiClient.authGet(req, `/specialist/parents/${req.params.id}`);

        if (!response.data.success) {
            req.flash('error_msg', res.locals.__('pageNotFound'));
            return res.redirect('/specialist/parents');
        }

        const { parent, children } = response.data;

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
        const response = await apiClient.authPost(req, `/specialist/parents/${req.params.id}/unlink`);

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
        const response = await apiClient.authGet(req, '/specialist/children');
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
        const response = await apiClient.authGet(req, '/specialist/requests');

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
        const response = await apiClient.authPost(req, `/specialist/requests/${req.params.id}/accept`);

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
        const response = await apiClient.authPost(req, `/specialist/requests/${req.params.id}/reject`);

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
router.get('/account', async (req, res) => {
    try {
        // Fetch ALL parents with their linked specialist info
        // We need an endpoint for this. Assuming /specialist/parents-directory or similar
        // Since this view lists ALL parents to find new ones, users normally shouldn't see ALL parents in the system unless authorized.
        // Assuming the logic is correct for this app:
        const response = await apiClient.authGet(req, '/specialist/account/parents-directory');

        const allParents = response.data.success ? response.data.parents : [];

        res.render('specialist/account', {
            title: res.locals.__('accountManagement'),
            allParents: allParents,
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

        const response = await apiClient.authGet(req, '/specialist/account/search', {
            params: { query }
        });

        const { searchResults, linkedParents } = response.data.success ? response.data : { searchResults: [], linkedParents: [] };

        res.render('specialist/account', {
            title: res.locals.__('accountManagement'),
            linkedParents: linkedParents || [],
            searchQuery: query || '',
            searchResults: searchResults || []
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

        const response = await apiClient.authPost(req, `/specialist/account/link/${parentId}`);

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

// Configure multer for profile photo upload
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
        const response = await apiClient.authGet(req, '/specialist/profile');

        const { user, stats } = response.data.success ? response.data : { user: req.user, stats: {} };

        res.render('specialist/profile', {
            title: res.locals.__('profile'),
            user,
            stats: stats || {}
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
        const response = await apiClient.authPost(req, '/specialist/profile/update', req.body);

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
// Optimized to use apiClient logic if possible or keep direct axios if form-data handling is tricky
router.post('/profile/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'الرجاء اختيار صورة');
            return res.redirect('/specialist/profile');
        }

        const form = new FormData();
        form.append('photo', req.file.buffer, req.file.originalname);

        // We use apiClient directly, but need to handle headers for FormData
        // apiClient.authPost handles Auth header, but we need to merge with form headers
        const authConfig = apiClient.withAuth(req);
        const headers = { ...authConfig.headers, ...form.getHeaders() };

        // Direct call to relative path on baseURL
        const response = await apiClient.post('/upload', form, { headers });

        if (response.data && response.data.success) {
            // Update successful on backend (which presumably updates DB)
            // But if 'upload' only returns path, we might need a second call to update user profile?
            // Original code did: await User.findByIdAndUpdate(...)
            // So we likely need to call an endpoint to update the profile photo specifically if /upload is generic

            const photoPath = response.data.path;

            // Call update profile photo endpoint
            await apiClient.authPost(req, '/specialist/profile/update-photo', { photoPath });

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
        const response = await apiClient.authPost(req, '/specialist/profile/change-password', req.body);

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

// Child Analytics Page (The Unified View)
router.get('/child/:id/analytics', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/specialist/child/${req.params.id}/analytics`);

        if (!response.data.success) {
            req.flash('error_msg', res.locals.__('not_found'));
            return res.redirect('/specialist/children');
        }

        const { child, progress } = response.data;

        res.render('specialist/child-analytics', {
            title: `تحليلات ${child.name}`,
            child,
            progress
        });
    } catch (error) {
        console.error('Analytics View Error:', error.message);
        req.flash('error_msg', res.locals.__('errorOccurred'));
        res.redirect('/specialist/children');
    }
});

// Child Analytics Data API
router.get('/child/:id/analytics/data', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/specialist/child/${req.params.id}/analytics/data`);
        res.json(response.data);
    } catch (error) {
        console.error('Analytics Data API Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ========================================
// CHAT REDIRECT (Feature Stub)
// ========================================
router.get('/chat/init/:userId', async (req, res) => {
    // In the future, this will check for existing conversation or create one.
    // For now, redirect to the chat page (which will be built next).
    res.redirect('/specialist/chat?target=' + req.params.userId);
});

// ========================================
// SESSIONS LOG (Progress Reports)
// ========================================
router.get('/sessions', async (req, res) => {
    try {
        const { child, childId, dateFrom, dateTo } = req.query;

        const response = await apiClient.authGet(req, '/specialist/sessions', {
            params: { child, childId, dateFrom, dateTo }
        });

        const { sessions, children } = response.data.success ? response.data : { sessions: [], children: [] };

        res.render('specialist/sessions', {
            title: res.locals.__('sessionsLog') || 'سجل الجلسات',
            sessions: sessions || [],
            children: children || [],
            selectedChild: child || '',
            childIdInput: childId || '', // Pass back the manual input
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

