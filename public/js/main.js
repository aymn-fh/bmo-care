// Main JavaScript for Specialist Portal

document.addEventListener('DOMContentLoaded', function () {
    const lang = (document.documentElement.getAttribute('lang') || 'ar').toLowerCase();
    const isArabic = lang === 'ar';
    // Menu Toggle for Mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function () {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', function (e) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    // User Dropdown
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });

        document.addEventListener('click', function () {
            userDropdown.classList.remove('show');
        });
    }

    // Alert Auto-dismiss
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function (alert) {
        setTimeout(function () {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-10px)';
            setTimeout(function () {
                alert.remove();
            }, 300);
        }, 5000);
    });

    // Form Validation Feedback
    const forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
        form.addEventListener('submit', function (e) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = isArabic
                    ? '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...'
                    : '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }
        });
    });

    // Confirm Delete
    const deleteButtons = document.querySelectorAll('[data-confirm]');
    deleteButtons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            if (!confirm(btn.dataset.confirm)) {
                e.preventDefault();
            }
        });
    });
    // Theme Management
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;

    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', function () {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!icon) return;
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    // Real-time Updates (Socket.io)
    if (typeof io !== 'undefined') {
        // Connect to local backend
        const socket = io('http://localhost:5000');

        socket.on('connect', () => {
            console.log('🔌 Connected to Real-time Server');
        });

        socket.on('progress_updated', (data) => {
            console.log('✨ Real-time update:', data);
            showToast(data.message || 'تم استلام بيانات جديدة', 'fas fa-chart-line');

            // If viewing the specific child's page, reload to show new data
            if (window.location.href.includes(data.childId)) {
                setTimeout(() => window.location.reload(), 2000);
            }
        });
    }

    // Toast Notification Function
    function showToast(message, iconClass = 'fas fa-bell') {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="toast-body">
                <h4>${isArabic ? 'تحديث فوري' : 'Live update'}</h4>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Play sound (optional)
        // const audio = new Audio('/sounds/notification.mp3');
        // audio.play().catch(e => console.log('Audio blocked', e));

        // Dismiss
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }

});

// Add loading state to buttons
function setLoading(button, loading) {
    if (loading) {
        button.disabled = true;
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText;
    }
}
