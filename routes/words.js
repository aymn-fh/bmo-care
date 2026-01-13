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
// SPECIALIST ROUTES (Protected)
// ==========================================

// Apply middleware
router.use(ensureSpecialist);

// List Words/Letters (or Select Child)
router.get('/', async (req, res) => {
    try {
        const { childId, difficulty, contentType, sessionId } = req.query;

        // Fetch children list first (needed for both views)
        const childrenResponse = await apiClient.authGet(req, '/specialists/my-children');
        const children = childrenResponse.data.success ? childrenResponse.data.children : [];

        // If childId is provided, show content for that child
        if (childId) {
            // Validate child exists in my list
            const selectedChild = children.find(c => c._id === childId || c.id === childId);

            if (!selectedChild) {
                req.flash('error_msg', 'Child not found or not assigned to you');
                return res.redirect('/specialist/words');
            }

            // جلب قائمة الجلسات (خطط الطفل)
            const plansRes = await apiClient.authGet(req, `/exercises/child/${childId}`);
            const sessions = (plansRes.data.success && Array.isArray(plansRes.data.exercises))
                ? plansRes.data.exercises.map(plan => ({
                    _id: plan._id,
                    sessionName: plan.sessionName || `Session ${plan.sessionIndex || ''}`,
                    sessionIndex: plan.sessionIndex
                })) : [];

            // Fetch words/letters for this child, مع sessionId إذا وُجد
            const response = await apiClient.authGet(req, `/words/child/${childId}`, {
                params: { difficulty, contentType, sessionId }
            });

            const { words, letters } = response.data.success ? response.data : { words: [], letters: [] };

            return res.render('specialist/words', {
                title: `${res.locals.__('wordsManagement') || 'إدارة المحتوى'} - ${selectedChild.name}`,
                activePage: 'words',
                mode: 'manage_child',
                child: selectedChild,
                words: words || [],
                letters: letters || [],
                contentType: contentType || 'word',
                difficulty: difficulty || '',
                sessions,
                selectedSessionId: sessionId || ''
            });
        }

        // If NO childId, show list of children to select
        res.render('specialist/words', {
            title: res.locals.__('wordsManagement') || 'إدارة المحتوى',
            activePage: 'words',
            mode: 'select_child',
            children: children || [],
            words: [],
            letters: []
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
        const { text, contentType, difficulty, childId, sessionId } = req.body;

        if (!childId) {
            req.flash('error_msg', 'Child ID is required');
            return res.redirect('/specialist/words');
        }

        const normalizedContentType = (contentType === 'letter' || contentType === 'word')
            ? contentType
            : 'word';
        const normalizedDifficulty = (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard')
            ? difficulty
            : 'easy';

        if (!text || !String(text).trim()) {
            req.flash('error_msg', 'Text is required');
            return res.redirect(`/specialist/words?childId=${childId}&contentType=${normalizedContentType}&difficulty=${normalizedDifficulty}${sessionId ? `&sessionId=${sessionId}` : ''}`);
        }

        const form = new FormData();
        form.append('text', String(text).trim());
        form.append('contentType', normalizedContentType);
        form.append('difficulty', normalizedDifficulty);
        form.append('childId', childId);
        if (sessionId) form.append('sessionId', sessionId);

        if (req.file) {
            form.append('image', req.file.buffer, req.file.originalname);
        }

        const authConfig = apiClient.withAuth(req);
        const headers = { ...authConfig.headers, ...form.getHeaders() };

        // POST /words (يدعم sessionId)
        const response = await apiClient.post('/words', form, { headers });

        if (response.data.success) {
            const successMessage = normalizedContentType === 'word'
                ? '✅ تم حفظ الكلمة وإضافتها إلى قائمة تدريب الطفل بنجاح'
                : '✅ تم حفظ الحرف وإضافته إلى قائمة تدريب الطفل بنجاح';
            req.flash('success_msg', successMessage);
        } else {
            req.flash('error_msg', response.data.message || 'Error adding content');
        }

        res.redirect(`/specialist/words?childId=${childId}&contentType=${normalizedContentType}&difficulty=${normalizedDifficulty}${sessionId ? `&sessionId=${sessionId}` : ''}`);
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
        // CORRECTED PATH: /words/:id (DELETE)
        const response = await apiClient.authDelete(req, `/words/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', 'Deleted successfully');

            const rawChildId = response.data.childId;
            const childId = typeof rawChildId === 'object'
                ? (rawChildId?._id || rawChildId?.id)
                : rawChildId;

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

