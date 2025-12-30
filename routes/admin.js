const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Center = require('../models/Center');
const Child = require('../models/Child');
const { ensureAdmin } = require('../middleware/auth');

// Apply admin middleware to all routes
router.use(ensureAdmin);

// Dashboard
router.get('/', async (req, res) => {
    try {
        let stats = {};
        let center = null;

        if (req.user.center) {
            center = await Center.findById(req.user.center)
                .populate('specialists', 'name');

            const specialistIds = center.specialists.map(s => s._id);

            const [specialistsCount, parentsCount, childrenCount] = await Promise.all([
                User.countDocuments({ center: req.user.center, role: 'specialist' }),
                User.countDocuments({ linkedSpecialist: { $in: [...specialistIds, req.user._id] } }),
                Child.countDocuments({ assignedSpecialist: { $in: [...specialistIds, req.user._id] } })
            ]);

            stats = {
                specialists: specialistsCount,
                parents: parentsCount,
                children: childrenCount
            };
        }

        const recentSpecialists = await User.find({ center: req.user.center, role: 'specialist' })
            .sort('-createdAt')
            .limit(5);

        res.render('admin/dashboard', {
            title: res.locals.__('dashboard'),
            center,
            stats,
            recentSpecialists
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ في تحميل البيانات');
        res.redirect('/');
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

        const { search, status, sort, period } = req.query;

        let query = { center: req.user.center, role: 'specialist' };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { staffId: { $regex: search, $options: 'i' } }
            ];
        }

        // Status Filter
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        // Date Period Filter
        if (period) {
            const date = new Date();
            if (period === '7days') date.setDate(date.getDate() - 7);
            if (period === '30days') date.setDate(date.getDate() - 30);
            query.createdAt = { $gte: date };
        }

        // Sorting
        let sortOption = { createdAt: -1 };
        if (sort) {
            if (sort === 'name') sortOption = { name: 1 };
            else if (sort === 'createdAt') sortOption = { createdAt: 1 };
            else if (sort === '-createdAt') sortOption = { createdAt: -1 };
        }

        const specialists = await User.find(query)
            .populate('linkedParents', 'name')
            .populate('assignedChildren', 'name')
            .sort(sortOption);

        res.render('admin/specialists', {
            title: res.locals.__('specialists'),
            specialists,
            searchQuery: search || '',
            filters: { status, sort, period }
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ في تحميل الأخصائيين');
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

        const { name, email, password, phone, specialization, licenseNumber } = req.body;

        if (!name || !email || !password) {
            req.flash('error_msg', 'جميع الحقول المطلوبة يجب ملؤها');
            return res.redirect('/admin/specialists/create');
        }

        // Check if email exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            req.flash('error_msg', 'البريد الإلكتروني مستخدم بالفعل');
            return res.redirect('/admin/specialists/create');
        }

        // Remove manual hashing - User model handles it
        const specialist = await User.create({
            name,
            email: email.toLowerCase(),
            password, // Pass plain password
            phone,
            role: 'specialist',
            specialization,
            licenseNumber,
            center: req.user.center,
            createdBy: req.user.id,
            emailVerified: true
        });

        // Add specialist to center
        await Center.findByIdAndUpdate(req.user.center, {
            $addToSet: { specialists: specialist._id }
        });

        req.flash('success_msg', 'تم إنشاء حساب الأخصائي بنجاح');
        res.redirect('/admin/specialists');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ في إنشاء الأخصائي');
        res.redirect('/admin/specialists/create');
    }
});

// View specialist details
router.get('/specialists/:id', async (req, res) => {
    try {
        const specialist = await User.findById(req.params.id)
            .populate('linkedParents', 'name email phone')
            .populate('assignedChildren', 'name age gender');

        if (!specialist || specialist.role !== 'specialist') {
            req.flash('error_msg', 'الأخصائي غير موجود');
            return res.redirect('/admin/specialists');
        }

        // Verify specialist belongs to admin's center
        if (!specialist.center || specialist.center.toString() !== req.user.center.toString()) {
            req.flash('error_msg', 'غير مصرح لك بالوصول');
            return res.redirect('/admin/specialists');
        }

        res.render('admin/specialist-details', {
            title: specialist.name,
            specialist
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin/specialists');
    }
});

// Delete specialist
router.post('/specialists/:id/delete', async (req, res) => {
    try {
        const specialist = await User.findById(req.params.id);

        if (!specialist || specialist.role !== 'specialist') {
            req.flash('error_msg', 'الأخصائي غير موجود');
            return res.redirect('/admin/specialists');
        }

        // Verify specialist belongs to admin's center
        if (!specialist.center || specialist.center.toString() !== req.user.center.toString()) {
            req.flash('error_msg', 'غير مصرح لك بالوصول');
            return res.redirect('/admin/specialists');
        }

        // Remove specialist from center
        await Center.findByIdAndUpdate(req.user.center, {
            $pull: { specialists: specialist._id }
        });

        // Clear center reference
        specialist.center = null;
        await specialist.save();

        req.flash('success_msg', 'تم إزالة الأخصائي من المركز');
        res.redirect('/admin/specialists');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin/specialists');
    }
});

// Bulk delete specialists
router.post('/specialists/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids)) {
            return res.json({ success: false, message: 'Invalid data' });
        }

        // Verify all specialists belong to this admin's center
        const specialists = await User.find({
            _id: { $in: ids },
            role: 'specialist',
            center: req.user.center
        });

        if (specialists.length !== ids.length) {
            return res.json({ success: false, message: 'Some specialists not found or unauthorized' });
        }

        // Remove from center
        await Center.findByIdAndUpdate(req.user.center, {
            $pull: { specialists: { $in: ids } }
        });

        // Unset center for these specialists
        await User.updateMany(
            { _id: { $in: ids } },
            { $set: { center: null } }
        );

        req.flash('success_msg', `تم حذف ${ids.length} أخصائي بنجاح`);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
});

// Search parents for specialist (AJAX)
router.get('/specialists/:id/search-parents', async (req, res) => {
    try {
        const { query } = req.query;
        const specialist = await User.findById(req.params.id);

        if (!specialist || specialist.role !== 'specialist') {
            return res.json({ success: false, message: 'Specialist not found' });
        }

        // Get already linked parent IDs
        const linkedParentIds = specialist.linkedParents || [];

        // Search for parents not yet linked
        const parents = await User.find({
            role: 'parent',
            // We remove the filter for already linked parents because we might want to link a SECOND child of the same parent
            // _id: { $nin: linkedParentIds }, 
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        })
            .select('_id name email phone')
            .limit(10);

        // Fetch children for each parent
        const parentsWithChildren = await Promise.all(parents.map(async (parent) => {
            const children = await Child.find({ parent: parent._id })
                .select('_id name age gender assignedSpecialist')
                .populate('assignedSpecialist', 'name');
            return {
                ...parent.toObject(),
                children
            };
        }));

        res.json({ success: true, parents: parentsWithChildren });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
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

        const child = await Child.findById(childId);
        if (!child) {
            req.flash('error_msg', 'الطفل غير موجود');
            return res.redirect(`/admin/specialists/${specialistId}`);
        }

        // Check if already assigned to THIS specialist
        if (child.assignedSpecialist && child.assignedSpecialist.toString() === specialistId) {
            req.flash('error_msg', 'الطفل مرتبط بالفعل بهذا الأخصائي');
            return res.redirect(`/admin/specialists/${specialistId}`);
        }

        // Assign specialist to child
        child.assignedSpecialist = specialistId;
        child.specialistRequestStatus = 'approved'; // Auto-approve if admin converts it
        await child.save();

        // Add child to specialist's assignedChildren
        await User.findByIdAndUpdate(specialistId, {
            $addToSet: { assignedChildren: childId }
        });

        // Ensure parent is linked to specialist (for reference/contact)
        if (parentId) {
            await User.findByIdAndUpdate(specialistId, {
                $addToSet: { linkedParents: parentId }
            });
            // Update parent's linkedSpecialist only if they don't have one? 
            // Or maybe linkedSpecialist on User model is deprecated in favor of child-level?
            // For now, we keep it compatible.
            await User.findByIdAndUpdate(parentId, {
                linkedSpecialist: specialistId
            });
        }

        req.flash('success_msg', 'تم ربط الطفل بالأخصائي بنجاح');
        res.redirect(`/admin/specialists/${specialistId}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ في ربط الطفل');
        res.redirect('/admin/specialists');
    }
});

// Unlink child from specialist
router.post('/specialists/:id/unlink-child/:childId', async (req, res) => {
    try {
        const { id: specialistId, childId } = req.params;

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

        // Update Child
        await Child.findByIdAndUpdate(childId, {
            assignedSpecialist: null,
            specialistRequestStatus: 'none'
        });

        // Remove from specialist's assignedChildren
        await User.findByIdAndUpdate(specialistId, {
            $pull: { assignedChildren: childId }
        });

        req.flash('success_msg', 'تم إلغاء تعيين الطفل');
        res.redirect(`/admin/specialists/${specialistId}`);
    } catch (error) {
        console.error(error);
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
        const admin = await User.findById(req.user.id)
            .populate('linkedParents', 'name email phone');

        res.render('admin/parents', {
            title: res.locals.__('myParents'),
            parents: admin.linkedParents || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin');
    }
});

// My children
router.get('/children', async (req, res) => {
    try {
        const children = await Child.find({ assignedSpecialist: req.user.id })
            .populate('parent', 'name email');

        res.render('admin/children', {
            title: res.locals.__('myChildren'),
            children
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'حدث خطأ');
        res.redirect('/admin');
    }
});

module.exports = router;
