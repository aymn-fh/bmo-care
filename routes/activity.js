const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureAdmin } = require('../middleware/auth');

// View Activity Log
router.get('/', ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const response = await apiClient.authGet(req, '/admin/activity-log', {
            params: { page }
        });

        const { logs, pages, currentPage } = response.data.success ? response.data : { logs: [], pages: 1, currentPage: 1 };

        res.render('admin/activity-log', {
            title: res.locals.__('activityLog') || 'سجل النشاطات',
            logs: logs || [],
            currentPage: currentPage || page,
            pages: pages || 1,
            activePage: 'activity'
        });
    } catch (error) {
        console.error('Activity Log Error:', error.message);
        req.flash('error_msg', 'Error loading activity log');
        res.redirect('/admin');
    }
});

module.exports = router;

