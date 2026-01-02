const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureSuperAdmin } = require('../middleware/auth');

// Apply superadmin middleware to all routes
router.use(ensureSuperAdmin);

// Dashboard
router.get('/', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/superadmin/dashboard');

        const { stats, chartData, recentCenters } = response.data.success ? response.data : { stats: {}, chartData: {}, recentCenters: [] };

        res.render('superadmin/dashboard', {
            title: res.locals.__('dashboard'),
            stats: stats || {},
            chartData: chartData || {},
            recentCenters: recentCenters || []
        });
    } catch (error) {
        console.error('SuperAdmin Dashboard Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في تحميل البيانات');
        // Render empty dashboard rather than redirect loop
        res.render('superadmin/dashboard', {
            title: res.locals.__('dashboard'),
            stats: {},
            chartData: {},
            recentCenters: []
        });
    }
});


// ========================================
// CENTERS
// ========================================

// ========================================
// CENTERS
// ========================================

// List all centers
router.get('/centers', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/superadmin/centers');
        const centers = response.data.success ? response.data.centers : [];

        res.render('superadmin/centers', {
            title: res.locals.__('centers'),
            centers
        });
    } catch (error) {
        console.error('List Centers Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في تحميل المراكز');
        res.redirect('/superadmin');
    }
});

// Create center form
router.get('/centers/create', (req, res) => {
    res.render('superadmin/center-form', {
        title: res.locals.__('createCenter'),
        center: null,
        isEdit: false
    });
});

// Create center POST
router.post('/centers', async (req, res) => {
    try {
        const response = await apiClient.authPost(req, '/superadmin/centers', req.body);

        if (response.data.success) {
            req.flash('success_msg', 'تم إنشاء المركز والمدير بنجاح');
            res.redirect('/superadmin/centers');
        } else {
            req.flash('error_msg', response.data.message || 'فشل إنشاء المركز');
            res.redirect('/superadmin/centers/create');
        }
    } catch (error) {
        console.error('Create Center Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في إنشاء المركز');
        res.redirect('/superadmin/centers/create');
    }
});

// Edit center form
router.get('/centers/:id/edit', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/superadmin/centers/${req.params.id}`);

        if (!response.data.success) {
            req.flash('error_msg', 'المركز غير موجود');
            return res.redirect('/superadmin/centers');
        }

        const center = response.data.center;

        res.render('superadmin/center-form', {
            title: res.locals.__('edit') + ' ' + center.name,
            center,
            isEdit: true
        });
    } catch (error) {
        console.error('Edit Center Form Error:', error.message);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/superadmin/centers');
    }
});

// Update center
router.post('/centers/:id', async (req, res) => {
    try {
        const response = await apiClient.authPut(req, `/superadmin/centers/${req.params.id}`, req.body);

        if (response.data.success) {
            req.flash('success_msg', 'تم تحديث المركز بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل التحديث');
        }
        res.redirect('/superadmin/centers');
    } catch (error) {
        console.error('Update Center Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في تحديث المركز');
        res.redirect('/superadmin/centers');
    }
});

// Delete center
router.post('/centers/:id/delete', async (req, res) => {
    try {
        const response = await apiClient.authDelete(req, `/superadmin/centers/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', 'تم حذف المركز بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل الحذف');
        }
        res.redirect('/superadmin/centers');
    } catch (error) {
        console.error('Delete Center Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في حذف المركز');
        res.redirect('/superadmin/centers');
    }
});


// ========================================
// ADMINS
// ========================================

// ========================================
// ADMINS
// ========================================

// List all admins
router.get('/admins', async (req, res) => {
    try {
        const { search } = req.query;

        const response = await apiClient.authGet(req, '/superadmin/admins', {
            params: { search }
        });

        const { admins, availableCenters } = response.data.success ? response.data : { admins: [], availableCenters: [] };

        res.render('superadmin/admins', {
            title: res.locals.__('admins'),
            admins: admins || [],
            availableCenters: availableCenters || [],
            searchQuery: search || ''
        });
    } catch (error) {
        console.error('List Admins Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في تحميل الإداريين');
        res.redirect('/superadmin');
    }
});

// Create admin form
router.get('/admins/create', async (req, res) => {
    try {
        // Fetch centers for dropdown
        const response = await apiClient.authGet(req, '/superadmin/centers');
        const centers = response.data.success ? response.data.centers : [];

        res.render('superadmin/admin-form', {
            title: res.locals.__('createAdmin'),
            admin: null,
            centers: centers || [],
            isEdit: false
        });
    } catch (error) {
        console.error('Create Admin Form Error:', error.message);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/superadmin/admins');
    }
});

// Create admin POST
router.post('/admins', async (req, res) => {
    try {
        const response = await apiClient.authPost(req, '/superadmin/admins', req.body);

        if (response.data.success) {
            req.flash('success_msg', 'تم إنشاء حساب المدير بنجاح');
            res.redirect('/superadmin/admins');
        } else {
            req.flash('error_msg', response.data.message || 'فشل إنشاء المدير');
            res.redirect('/superadmin/admins/create');
        }
    } catch (error) {
        console.error('Create Admin Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في إنشاء المدير');
        res.redirect('/superadmin/admins/create');
    }
});

// Delete admin
router.post('/admins/:id/delete', async (req, res) => {
    try {
        const response = await apiClient.authDelete(req, `/superadmin/admins/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', 'تم حذف المدير بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل الحذف');
        }
        res.redirect('/superadmin/admins');
    } catch (error) {
        console.error('Delete Admin Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في حذف المدير');
        res.redirect('/superadmin/admins');
    }
});

module.exports = router;

