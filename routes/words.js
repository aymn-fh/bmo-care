const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Word = require('../models/Word');
const Child = require('../models/Child');
const { ensureSpecialist } = require('../middleware/auth');

// Setup multer for word images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Shared uploads directory
        const uploadDir = path.join(__dirname, '../../backend/uploads/words');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'word-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
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
// PUBLIC API ROUTES (For Game App)
// ==========================================

router.get('/api/list', async (req, res) => {
    try {
        const { childId } = req.query;

        if (!childId) {
            return res.status(400).json({
                success: false,
                message: 'Child ID is required'
            });
        }

        const words = await Word.find({ child: childId }).sort('-createdAt');

        // Add full URL to images
        const wordsWithImages = words.map(word => {
            return {
                ...word.toObject(),
                imageUrl: word.image ? `/uploads/words/${word.image}` : null
            };
        });

        res.json({
            success: true,
            words: wordsWithImages
        });
    } catch (error) {
        console.error('API Error:', error);
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

        // If childId is provided, show content for that child
        if (childId) {
            const child = await Child.findOne({ _id: childId, assignedSpecialist: req.user._id });

            if (!child) {
                req.flash('error_msg', 'Child not found or not assigned to you');
                return res.redirect('/specialist/words');
            }

            const filter = { createdBy: req.user._id, child: childId };
            if (difficulty) filter.difficulty = difficulty;

            // Get both words and letters
            const wordsFilter = { ...filter, contentType: 'word' };
            const lettersFilter = { ...filter, contentType: 'letter' };

            const words = await Word.find(wordsFilter).sort('-createdAt');
            const letters = await Word.find(lettersFilter).sort('-createdAt');

            return res.render('specialist/words', {
                title: `${res.locals.__('wordsManagement') || 'إدارة المحتوى'} - ${child.name}`,
                activePage: 'words',
                mode: 'manage_child', // Manage content for specific child
                child,
                words,
                letters,
                contentType: contentType || 'word',
                difficulty: difficulty || ''
            });
        }

        // If NO childId, show list of children to select
        const children = await Child.find({ assignedSpecialist: req.user._id }).sort('-createdAt');

        res.render('specialist/words', {
            title: res.locals.__('wordsManagement') || 'إدارة المحتوى',
            activePage: 'words',
            mode: 'select_child', // Select child mode
            children,
            words: [],
            letters: [] // No content until child selected
        });

    } catch (error) {
        console.error(error);
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

        if (!text || !contentType) {
            req.flash('error_msg', 'Text and content type are required');
            return res.redirect(`/specialist/words?childId=${childId}`);
        }

        if (!['word', 'letter'].includes(contentType)) {
            req.flash('error_msg', 'Invalid content type');
            return res.redirect(`/specialist/words?childId=${childId}`);
        }

        // Validate text length based on content type
        if (contentType === 'letter' && text.length > 2) {
            req.flash('error_msg', 'Letter with vowel must not exceed 2 characters');
            return res.redirect(`/specialist/words?childId=${childId}`);
        }

        if (contentType === 'word' && text.length > 20) {
            req.flash('error_msg', 'Word must not exceed 20 characters');
            return res.redirect(`/specialist/words?childId=${childId}`);
        }

        // Check for duplicate content
        const existingContent = await Word.findOne({
            text: text.trim(),
            contentType,
            child: childId
        });

        if (existingContent) {
            req.flash('error_msg', `${contentType === 'word' ? 'Word' : 'Letter'} already exists for this child`);
            return res.redirect(`/specialist/words?childId=${childId}`);
        }

        // Removed mandatory file check
        let imageFilename = 'default-word.png';
        if (req.file) {
            imageFilename = req.file.filename;
        }

        const content = new Word({
            text: text.trim(),
            contentType,
            difficulty: difficulty || 'easy',
            image: imageFilename,
            createdBy: req.user._id,
            child: childId
        });

        await content.save();

        const successMessage = contentType === 'word' 
            ? '✅ تم حفظ الكلمة وإضافتها إلى قائمة تدريب الطفل بنجاح'
            : '✅ تم حفظ الحرف وإضافته إلى قائمة تدريب الطفل بنجاح';
        
        req.flash('success_msg', successMessage);
        res.redirect(`/specialist/words?childId=${childId}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error adding content');
        const childId = req.body.childId ? `?childId=${req.body.childId}` : '';
        res.redirect(`/specialist/words${childId}`);
    }
});

// Delete Content (Word or Letter)
router.post('/delete/:id', async (req, res) => {
    try {
        const content = await Word.findOne({ _id: req.params.id, createdBy: req.user._id });

        if (!content) {
            req.flash('error_msg', 'Content not found');
            return res.redirect('/specialist/words');
        }

        const childId = content.child; // Save child ID for redirect

        // Try to delete image file (only for words)
        if (content.contentType === 'word') {
            try {
                const imagePath = path.join(__dirname, '../../backend/uploads/words', content.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (err) {
                console.error('Error deleting image file:', err);
            }
        }

        await Word.findByIdAndDelete(req.params.id);

        const successMessage = content.contentType === 'word' 
            ? 'Word deleted successfully'
            : 'Letter deleted successfully';
        
        req.flash('success_msg', successMessage);
        if (childId) {
            res.redirect(`/specialist/words?childId=${childId}`);
        } else {
            res.redirect('/specialist/words');
        }
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error deleting content');
        res.redirect('/specialist/words');
    }
});

module.exports = router;
