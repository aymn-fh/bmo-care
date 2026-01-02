const express = require('express');
const router = express.Router();
const apiClient = require('../utils/apiClient');
const { exportToPDF } = require('../utils/pdfExporter');
const { ensureAdmin } = require('../middleware/auth');

// Export Specialists
router.get('/specialists', ensureAdmin, async (req, res) => {
    try {
        const { format } = req.query;
        // Fetch Data from Backend API
        // Using the admin specialists list endpoint which should return all specialists for the center
        // We might need to handle pagination if default list is paginated, but ideally export handles all.
        // Assuming backend has an endpoint for 'all' or high limit.
        // Let's use the list endpoint and assume it returns what we need or add query param ?limit=0 or ?all=true
        const response = await apiClient.authGet(req, '/admin/specialists?limit=1000');

        const specialists = response.data.success ? response.data.specialists : [];

        // Prepare Data for Export
        const data = specialists.map(s => ({
            name: s.name,
            email: s.email,
            phone: s.phone || 'N/A',
            staffId: s.staffId || 'N/A',
            specialization: s.specialization || 'N/A',
            joinedDate: new Date(s.createdAt).toLocaleDateString()
        }));

        const columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Staff ID', key: 'staffId', width: 15 },
            { header: 'Specialization', key: 'specialization', width: 20 },
            { header: 'Joined Date', key: 'joinedDate', width: 15 }
        ];

        if (format === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=specialists.pdf');
            exportToPDF(data, columns, 'Specialists List', res);
        } else {
            res.status(400).send('Only PDF format is supported');
        }

    } catch (error) {
        console.error('Export Error:', error.message);
        res.status(500).send('Export failed');
    }
});

module.exports = router;

