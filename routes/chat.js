const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureAuthenticated } = require('../middleware/auth');

// Get all conversations for current user
router.get('/conversations', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/chat/conversations');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching conversations:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Get conversation with specific user
router.get('/:userId', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/chat/messages/${req.params.userId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching chat:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Send message
router.post('/send', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authPost(req, '/chat/send', req.body);
        res.status(201).json(response.data);
    } catch (error) {
        console.error('Error sending message:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Edit message
router.put('/:messageId/edit', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authPut(req, `/chat/messages/${req.params.messageId}`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Error editing message:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Delete message
router.delete('/:messageId', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authDelete(req, `/chat/messages/${req.params.messageId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error deleting message:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Mark messages as seen
router.put('/:userId/seen', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authPut(req, `/chat/messages/${req.params.userId}/seen`);
        res.json(response.data);
    } catch (error) {
        console.error('Error marking messages as seen:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

// Get unread count
router.get('/unread/count', ensureAuthenticated, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/chat/unread/count');
        res.json(response.data);
    } catch (error) {
        console.error('Error getting unread count:', error.message);
        res.status(500).json({
            success: false,
            message: res.locals.__('error_occurred')
        });
    }
});

module.exports = router;

