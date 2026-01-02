const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureAdmin } = require('../middleware/auth');

// Get Settings Page
router.get('/', ensureAdmin, async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/admin/settings');
        const settings = response.data.success ? response.data.settings : {};

        // Default values
        const defaults = {
            appName: 'Portal',
            appEmail: 'admin@portal.com',
            maintenanceMode: false,
            maxUploadSize: 5,
            themeColor: '#3b82f6'
        };

        res.render('admin/settings', {
            title: 'Settings',
            settings: { ...defaults, ...settings },
            activePage: 'settings'
        });
    } catch (error) {
        console.error('Settings View Error:', error.message);
        req.flash('error_msg', 'Error loading settings');
        res.redirect('/admin');
    }
});

// Update Settings
router.post('/', ensureAdmin, async (req, res) => {
    try {
        const updates = req.body;

        // Handle checkbox (maintenanceMode)
        if (!updates.maintenanceMode) updates.maintenanceMode = false;
        else updates.maintenanceMode = true;

        const response = await apiClient.authPost(req, '/admin/settings', updates);

        if (response.data.success) {
            req.flash('success_msg', 'Settings updated successfully');
        } else {
            req.flash('error_msg', response.data.message || 'Error updating settings');
        }
        res.redirect('/settings');
    } catch (error) {
        console.error('Settings Update Error:', error.message);
        req.flash('error_msg', 'Error updating settings');
        res.redirect('/settings');
    }
});

module.exports = router;

