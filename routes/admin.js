const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { ensureAdmin } = require('../middleware/auth');

// Apply admin middleware to all routes
router.use(ensureAdmin);

// Dashboard
router.get('/', async (req, res) => {
    try {
        // Fetch dashboard stats from backend API
        // Assuming backend has an endpoint for admin dashboard stats
        // If not, we might need to fetch entities separately or create a new endpoint backend-side.
        // For now, let's try to fetch stats from a hypothetical /admin/stats endpoint
        // or re-construct it using separate calls if necessary.

        // Let's assume we need to fetch center details and stats
        let center = null;
        let stats = { specialists: 0, parents: 0, children: 0 };
        let recentSpecialists = [];

        if (req.user.center) {
            // Get Center details with stats
            const centerRes = await apiClient.authGet(req, `/centers/${req.user.center}`);
            if (centerRes.data.success) {
                center = centerRes.data.center;
            }

            // Get Stats
            const statsRes = await apiClient.authGet(req, '/admin/stats');
            if (statsRes.data.success) {
                const rawStats = statsRes.data.stats || {};
                // Normalize backend stats shape -> view-friendly keys
                stats = {
                    specialists: rawStats.centerSpecialists ?? rawStats.specialists ?? 0,
                    parents: rawStats.myParents ?? rawStats.parents ?? 0,
                    children: rawStats.centerChildren ?? rawStats.children ?? rawStats.myChildren ?? 0
                };
                recentSpecialists = statsRes.data.recentSpecialists || [];
            }
        }

        res.render('admin/dashboard', {
            title: res.locals.__('dashboard'),
            center,
            stats,
            recentSpecialists
        });
    } catch (error) {
        console.error('Dashboard Error:', error.message);
        // Even if stats fail, try to render dashboard
        res.render('admin/dashboard', {
            title: res.locals.__('dashboard'),
            center: null,
            stats: { specialists: 0, parents: 0, children: 0 },
            recentSpecialists: []
        });
    }
});

// ========================================
// SPECIALISTS
// ========================================

// List all specialists in center
router.get('/specialists', async (req, res) => {
    try {
        if (!req.user.center) {
            req.flash('error_msg', 'لا يوجد مركز مرتبط بحسابك');
            return res.redirect('/admin');
        }

        // Pass query params to backend
        const response = await apiClient.authGet(req, '/admin/specialists', {
            params: req.query
        });

        const specialists = response.data.success ? response.data.specialists : [];

        res.render('admin/specialists', {
            title: 'إدارة الأخصائيين',
            specialists,
            searchQuery: req.query.search || '',
            filters: {
                status: req.query.status || '',
                sort: req.query.sort || '-createdAt',
                period: req.query.period || ''
            }
        });
    } catch (error) {
        console.error('List Specialists Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في جلب قائمة الأخصائيين');
        res.redirect('/admin');
    }
});



// Create specialist form
router.get('/specialists/create', (req, res) => {
    if (!req.user.center) {
        req.flash('error_msg', 'لا يوجد مركز مرتبط بحسابك');
        return res.redirect('/admin');
    }

    res.render('admin/specialist-form', {
        title: res.locals.__('createSpecialist'),
        specialist: null,
        isEdit: false
    });
});

// Create specialist POST
router.post('/specialists', async (req, res) => {
    try {
        if (!req.user.center) {
            req.flash('error_msg', 'لا يوجد مركز مرتبط بحسابك');
            return res.redirect('/admin');
        }

        // Just forward the body to the backend API
        // Backend handles validation, email checking, hashing, creation
        const response = await apiClient.authPost(req, '/admin/create-specialist', req.body);

        if (response.data.success) {
            req.flash('success_msg', 'تم إنشاء حساب الأخصائي بنجاح');
            res.redirect('/admin/specialists');
        } else {
            req.flash('error_msg', response.data.message || 'فشل إنشاء الحساب');
            res.redirect('/admin/specialists/create');
        }

    } catch (error) {
        console.error('Create Specialist Error:', error.message);
        const msg = error.response?.data?.message || 'حدث خطأ في إنشاء الأخصائي';
        req.flash('error_msg', msg);
        // If validation error, we might want to preserve input, but for now simple redirect
        res.redirect('/admin/specialists/create');
    }
});


// View specialist details
router.get('/specialists/:id', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/admin/specialists/${req.params.id}`);

        if (!response.data.success) {
            req.flash('error_msg', 'الأخصائي غير موجود');
            return res.redirect('/admin/specialists');
        }

        res.render('admin/specialist-details', {
            title: response.data.specialist.name,
            specialist: response.data.specialist
        });
    } catch (error) {
        console.error('Spec Details Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في عرض التفاصيل');
        res.redirect('/admin/specialists');
    }
});

// Delete specialist
router.post('/specialists/:id/delete', async (req, res) => {
    try {
        const response = await apiClient.authDelete(req, `/admin/specialists/${req.params.id}`);

        if (response.data.success) {
            req.flash('success_msg', 'تم إزالة الأخصائي من المركز');
        } else {
            req.flash('error_msg', response.data.message || 'فشل الحذف');
        }
        res.redirect('/admin/specialists');
    } catch (error) {
        console.error('Delete Specialist Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في عملية الحذف');
        res.redirect('/admin/specialists');
    }
});


// Bulk delete specialists
router.post('/specialists/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.json({ success: false, message: 'لا توجد عناصر محددة للحذف' });
        }

        const results = await Promise.allSettled(
            ids.map((id) => apiClient.authDelete(req, `/admin/specialists/${id}`))
        );

        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            return res.json({
                success: false,
                message: `فشل حذف ${failed.length} عنصر(عناصر)`
            });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Bulk Delete Error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// Search parents for specialist (AJAX)
router.get('/specialists/:id/search-parents', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, `/admin/specialists/${req.params.id}/search-parents`, {
            params: req.query
        });

        res.json(response.data);
    } catch (error) {
        console.error('Search Parents Error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// Link parent to specialist
router.post('/specialists/:id/link-parent', async (req, res) => {
    try {
        const { parentId } = req.body;
        const response = await apiClient.authPost(req, `/admin/specialists/${req.params.id}/link-parent`, { parentId });

        if (response.data.success) {
            req.flash('success_msg', 'تم ربط ولي الأمر بالأخصائي بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل الربط');
        }
        res.redirect(`/admin/specialists/${req.params.id}`);
    } catch (error) {
        console.error('Link Parent Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في عملية الربط');
        res.redirect(`/admin/specialists/${req.params.id}`);
    }
});


// Link parent to specialist
router.post('/specialists/:id/link-parent', async (req, res) => {
    try {
        const { parentId } = req.body;
        const specialistId = req.params.id;

        const specialist = await User.findById(specialistId);
        if (!specialist || specialist.role !== 'specialist') {
            req.flash('error_msg', 'الأخصائي غير موجود');
            return res.redirect('/admin/specialists');
        }

        // Verify specialist belongs to admin's center
        if (!specialist.center || specialist.center.toString() !== req.user.center.toString()) {
            req.flash('error_msg', 'غير مصرح لك بالوصول');
            return res.redirect('/admin/specialists');
        }

        const parent = await User.findById(parentId);
        if (!parent || parent.role !== 'parent') {
            req.flash('error_msg', 'ولي الأمر غير موجود');
            return res.redirect(`/admin/specialists/${specialistId}`);
        }

        // Check if already linked
        if (specialist.linkedParents && specialist.linkedParents.includes(parentId)) {
            req.flash('error_msg', 'ولي الأمر مرتبط بالفعل بهذا الأخصائي');
            return res.redirect(`/admin/specialists/${specialistId}`);
        }

        // Link parent to specialist
        await User.findByIdAndUpdate(specialistId, {
            $addToSet: { linkedParents: parentId }
        });

        // Update parent's linkedSpecialist
        await User.findByIdAndUpdate(parentId, {
            linkedSpecialist: specialistId
        });

        req.flash('success_msg', 'تم ربط ولي الأمر بالأخصائي بنجاح');
        res.redirect(`/admin/specialists/${specialistId}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ في ربط ولي الأمر');
        res.redirect('/admin/specialists');
    }
});

// Unlink parent from specialist
router.post('/specialists/:id/unlink-parent/:parentId', async (req, res) => {
    try {
        const { id: specialistId, parentId } = req.params;

        const specialist = await User.findById(specialistId);
        if (!specialist || specialist.role !== 'specialist') {
            req.flash('error_msg', 'الأخصائي غير موجود');
            return res.redirect('/admin/specialists');
        }

        // Verify specialist belongs to admin's center
        if (!specialist.center || specialist.center.toString() !== req.user.center.toString()) {
            req.flash('error_msg', 'غير مصرح لك بالوصول');
            return res.redirect('/admin/specialists');
        }

        // Remove parent from specialist's linkedParents
        await User.findByIdAndUpdate(specialistId, {
            $pull: { linkedParents: parentId }
        });

        // Remove specialist from parent's linkedSpecialist
        await User.findByIdAndUpdate(parentId, {
            linkedSpecialist: null
        });

        req.flash('success_msg', 'تم إلغاء ربط ولي الأمر');
        res.redirect(`/admin/specialists/${specialistId}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin/specialists');
    }
});

// Link specific child to specialist
router.post('/specialists/:id/link-child', async (req, res) => {
    try {
        const { childId, parentId } = req.body;
        const response = await apiClient.authPost(req, `/admin/specialists/${req.params.id}/link-child`, { childId, parentId });

        if (response.data.success) {
            req.flash('success_msg', 'تم ربط الطفل بالأخصائي بنجاح');
        } else {
            req.flash('error_msg', response.data.message || 'فشل عملية الربط');
        }
        res.redirect(`/admin/specialists/${req.params.id}`);

    } catch (error) {
        console.error('Link Child Error:', error.message);
        req.flash('error_msg', 'حدث خطأ في ربط الطفل');
        res.redirect('/admin/specialists');
    }
});

// Unlink child from specialist
router.post('/specialists/:id/unlink-child/:childId', async (req, res) => {
    try {
        const response = await apiClient.authPost(req, `/admin/specialists/${req.params.id}/unlink-child/${req.params.childId}`);

        if (response.data.success) {
            req.flash('success_msg', 'تم إلغاء تعيين الطفل');
        } else {
            req.flash('error_msg', response.data.message || 'فشل إلغاء التعيين');
        }
        res.redirect(`/admin/specialists/${req.params.id}`);
    } catch (error) {
        console.error('Unlink Child Error:', error.message);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin/specialists');
    }
});

// ========================================
// ADMIN AS SPECIALIST FUNCTIONALITY
// ========================================

// My parents
router.get('/parents', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/admin/parents');
        const parents = response.data.success ? response.data.parents : [];

        res.render('admin/parents', {
            title: res.locals.__('myParents'),
            parents
        });
    } catch (error) {
        console.error('My Parents Error:', error.message);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin');
    }
});

// My children
router.get('/children', async (req, res) => {
    try {
        const response = await apiClient.authGet(req, '/admin/my-children');
        const children = response.data.success ? response.data.children : [];

        res.render('admin/children', {
            title: res.locals.__('myChildren'),
            children
        });
    } catch (error) {
        console.error('My Children Error:', error.message);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin');
    }
});

module.exports = router;

