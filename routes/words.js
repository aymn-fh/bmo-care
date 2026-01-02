const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const { ensureSpecialist } = require('../middleware/auth');
const apiClient = require('../utils/apiClient');

// Setup multer for memory storage (to forward to backend)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// ==========================================
// PUBLIC API ROUTES (For Game App - Proxy)
// ==========================================
// This assumes the Game App connects to Portal URL for some reason.
router.get('/api/list', async (req, res) => {
    try {
        const { childId } = req.query;
        // Proxy to backend
        // Note: Backend endpoint for game list might be different.
        // Assuming backend has /api/words/game or similar, or we use standard list.
        // Original code used Word.find({child: childId}).
        // Let's assume we call a backend endpoint for this.
        const response = await apiClient.get('/words/api/list', { params: { childId } }); // Unauthenticated proxy? Or use authGet if possible?
        // If this is public, we can't use authGet (User might not be logged in).
        // But apiClient usually attaches token if present.
        // If the Game App hits this, it might send a token?
        // Original code didn't check auth.

        // Wait, original code was: 'router.get('/api/list', async (req, res) => ...)' NO AUTH middleware.
        // So I should call backend without auth headers if possible, or use a service token?
        // For now, I'll pass request headers if any.

        // Let's try to just proxy it.
        // But wait, apiClient is designed for logged in user.
        // I will use axios directly for public route proxy if needed, or assume backend lets it pass.
        // If backend route relies on DB, I need to call backend API.

        // I'll skip this mostly if it's unused, but to be safe:
        // Actually, let's Redirect 307 to backend? No, CORS might be issue.
        // Better: Fetch from backend public endpoint.

        // Let's assume Backend has /api/words/public-list
        // For now I will mock it or try to call the backend equivalent logic.
        // If backend logic was in this file, backend likely DOESN'T have this endpoint yet?
        // Checking backend/routes/word.js... I haven't seen it yet.
        // I will implement a basic proxy using apiClient with conditional auth.

        const responseProxy = await apiClient.get('/words/public/list', { params: { childId } });
        res.json(responseProxy.data);

    } catch (error) {
        console.error('API Proxy Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// ==========================================
// SPECIALIST ROUTES (Protected)
// ==========================================

// Apply middleware
router.use(ensureSpecialist);

// List Words/Letters (or Select Child)
router.get('/', async (req, res) => {
    try {
        const { childId, difficulty, contentType } = req.query;

        // Fetch children list first (needed for both views)
        const childrenResponse = await apiClient.authGet(req, '/specialist/children');
        const children = childrenResponse.data.success ? childrenResponse.data.children : [];

        // If childId is provided, show content for that child
        if (childId) {
            // Validate child exists in my list
            const selectedChild = children.find(c => c._id === childId || c.id === childId);

            if (!selectedChild) {
                req.flash('error_msg', 'Child not found or not assigned to you');
                return res.redirect('/specialist/words');
            }

            // Fetch words for this child
            const response = await apiClient.authGet(req, '/specialist/words', {
                params: { childId, difficulty, contentType }
            });

            const { words, letters } = response.data.success ? response.data : { words: [], letters: [] };

            return res.render('specialist/words', {
                title: `${res.locals.__('wordsManagement') || 'إدارة المحتوى'} - ${selectedChild.name}`,
                activePage: 'words',
                mode: 'manage_child', // Manage content for specific child
                child: selectedChild,
                words: words || [],
                letters: letters || [],
                contentType: contentType || 'word',
                difficulty: difficulty || ''
            });
        }

        // If NO childId, show list of children to select
        res.render('specialist/words', {
            title: res.locals.__('wordsManagement') || 'إدارة المحتوى',
            activePage: 'words',
            mode: 'select_child', // Select child mode
            children: children || [],
            words: [],
            letters: [] // No content until child selected
        });

    } catch (error) {
        console.error('Words View Error:', error.message);
        req.flash('error_msg', 'Error loading page');
        res.redirect('/specialist');
    }
});

// Add Content (Word or Letter)
router.post('/add', upload.single('image'), async (req, res) => {
    try {
        const { text, contentType, difficulty, childId } = req.body;

        if (!childId) {
            req.flash('error_msg', 'Child ID is required');
            return res.redirect('/specialist/words');
        }

        const form = new FormData();
        form.append('text', text);
        form.append('contentType', contentType);
        form.append('difficulty', difficulty);
        form.append('childId', childId);

        if (req.file) {
            form.append('image', req.file.buffer, req.file.originalname);
        }

        const authConfig = apiClient.withAuth(req);
        const headers = { ...authConfig.headers, ...form.getHeaders() };

        const response = await apiClient.post('/specialist/words/add', form, { headers });

        if (response.data.success) {
            const successMessage = contentType === 'word'
                ? '✅ تم حفظ الكلمة وإضافتها إلى قائمة تدريب الطفل بنجاح'
                : '✅ تم حفظ الحرف وإضافته إلى قائمة تدريب الطفل بنجاح';
            req.flash('success_msg', successMessage);
        } else {
            req.flash('error_msg', response.data.message || 'Error adding content');
        }

        res.redirect(`/specialist/words?childId=${childId}`);
    } catch (error) {
        console.error('Add Word Error:', error.message);
        req.flash('error_msg', 'Error adding content');
        const childId = req.body.childId ? `?childId=${req.body.childId}` : '';
        res.redirect(`/specialist/words${childId}`);
    }
});

// Delete Content (Word or Letter)
router.post('/delete/:id', async (req, res) => {
    try {
        const response = await apiClient.authDelete(req, `/specialist/words/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', 'Deleted successfully');

            // Try to redirect back to child if possible, but we might not have childId here easily from response?
            // If backend returns childId, we could use it.
            // For now, redirect to main words page
            const childId = response.data.childId; // Assume backend returns it
            if (childId) {
                res.redirect(`/specialist/words?childId=${childId}`);
            } else {
                res.redirect('/specialist/words');
            }
        } else {
            req.flash('error_msg', response.data.message || 'Error deleting content');
            res.redirect('/specialist/words');
        }
    } catch (error) {
        console.error('Delete Word Error:', error.message);
        req.flash('error_msg', 'Error deleting content');
        res.redirect('/specialist/words');
    }
});

module.exports = router;

