const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureAuthenticated } = require('../middleware/auth');

// Get all notifications for current user
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/notifications');
        res.json(response.data);
    } catch (error) {
        console.error('Notifications Error:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching notifications' });
    }
});

// Get unread count
router.get('/unread-count', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/notifications/unread-count');
        res.json(response.data);
    } catch (error) {
        console.error('Unread Count Error:', error.message);
        res.status(500).json({ success: false });
    }
});

// Mark single notification as read
router.post('/:id/read', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authPost(req, `/notifications/${req.params.id}/read`);
        res.json(response.data);
    } catch (error) {
        console.error('Mark Read Error:', error.message);
        res.status(500).json({ success: false });
    }
});

// Mark all as read
router.post('/read-all', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authPost(req, '/notifications/read-all');
        res.json(response.data);
    } catch (error) {
        console.error('Read All Error:', error.message);
        res.status(500).json({ success: false });
    }
});

module.exports = router;

