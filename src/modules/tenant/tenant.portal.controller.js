const prisma = require('../../config/prisma');

// GET /api/tenant/dashboard
exports.getDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Get Tenant details with active lease
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    where: { status: 'Active' },
                    include: { unit: true }
                },
                insurances: true
            }
        });

        if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

        const activeLease = tenant.leases[0];

        // 2. Real calculation for Dashboard

        // Open Tickets Count
        const openTicketsCount = await prisma.ticket.count({
            where: {
                userId,
                status: 'Open'
            }
        });
        const inProgressTicketsCount = await prisma.ticket.count({
            where: {
                userId,
                status: 'In Progress'
            }
        });

        // Rent Due Status
        let currentRent = 0;
        let dueStatus = 'No Dues';
        let serviceFee = 'Service Fee: $0.00';
        let subValue = 'All caught up';

        if (activeLease) {
            currentRent = parseFloat(activeLease.monthlyRent);

            // Find latest unpaid invoice
            const latestInvoice = await prisma.invoice.findFirst({
                where: {
                    tenantId: userId,
                    status: { not: 'paid' }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (latestInvoice) {
                dueStatus = `$${parseFloat(latestInvoice.amount).toLocaleString()}`;
                serviceFee = `Service Fee: $${parseFloat(latestInvoice.serviceFees).toLocaleString()}`;
                subValue = latestInvoice.dueDate ? `Due in ${Math.ceil((new Date(latestInvoice.dueDate) - new Date()) / (1000 * 60 * 60 * 24))} days` : 'Due soon';
            }
        }

        // Insurance Status
        const latestInsurance = tenant.insurances[0];
        let insuranceStatus = 'Missing';
        let insuranceSub = 'No policy uploaded';
        const today = new Date();

        if (latestInsurance) {
            if (new Date(latestInsurance.endDate) < today) {
                insuranceStatus = 'Expired';
                insuranceSub = 'Insurance is overdue';
            } else {
                insuranceStatus = 'Compliant';
                const daysLeft = Math.ceil((new Date(latestInsurance.endDate) - today) / (1000 * 60 * 60 * 24));
                insuranceSub = `Expires in ${daysLeft} days`;
            }
        }

        // Notifications (Mocking for now, can be linked to a Notification model if added)
        const notifications = [
            { title: 'Rent due reminder', date: 'Jan 25', desc: 'Your rent for the month of February is due soon.', type: 'Warning' },
            { title: 'Rent paid confirmation', date: 'Jan 01', desc: 'Payment received for January 2026.', type: 'Info' }
        ];

        // Recent Activity (Tickets)
        const recentTickets = await prisma.ticket.findMany({
            where: { userId },
            take: 2,
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            name: tenant.name,
            dashboardCards: [
                {
                    title: 'Current Rent',
                    value: dueStatus,
                    subValue: subValue,
                    serviceFee: serviceFee,
                    icon: 'CreditCard',
                    color: 'bg-blue-500',
                    path: '/tenant/invoices'
                },
                {
                    title: 'Lease Status',
                    value: activeLease ? 'Active' : 'No Lease',
                    subValue: activeLease ? `Expires ${new Date(activeLease.endDate).toLocaleDateString('default', { month: 'short', year: 'numeric' })}` : 'No active lease',
                    icon: 'FileText',
                    color: 'bg-emerald-500',
                    path: '/tenant/lease'
                },
                {
                    title: 'Maintenance',
                    value: `${openTicketsCount} Open`,
                    subValue: `${inProgressTicketsCount} In Progress`,
                    icon: 'Wrench',
                    color: 'bg-amber-500',
                    path: '/tenant/tickets'
                },
                {
                    title: 'Insurance',
                    value: insuranceStatus,
                    subValue: insuranceSub,
                    icon: 'ShieldCheck',
                    color: 'bg-purple-500',
                    path: '/tenant/insurance'
                }
            ],
            notifications,
            recentTickets: recentTickets.map(t => ({
                id: `T-${t.id}`,
                title: t.subject,
                status: t.status
            }))
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/tenant/profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    where: { status: 'Active' },
                    include: {
                        unit: {
                            include: { property: true }
                        }
                    }
                }
            }
        });

        if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

        const activeLease = tenant.leases[0];
        const propertyName = activeLease?.unit?.property?.name || 'No Active Property';
        const unitName = activeLease?.unit?.name || 'N/A';

        res.json({
            name: tenant.name,
            email: tenant.email,
            property: propertyName,
            unit: unitName,
            initials: tenant.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        });
    } catch (e) {
        console.error('Get Profile Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/tenant/billing-details
exports.saveBillingDetails = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const userId = parseInt(req.user.id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ message: 'Invalid User ID in token' });
        }
        const { fullName, address, city, state, country, method, cardDetails, bankDetails } = req.body;

        // Validation
        if (!fullName || !address || !city || !state || !country) {
            return res.status(400).json({ message: 'Missing required billing fields.' });
        }

        // Securely handling data: We store the billing address and method.
        // For sensitive payment details (Card/Bank), in a real app you'd tokenize them via Stripe/Plaid.
        // Here, we'll store a masked version or JSON representation for the "saved" state requirement.

        let details = {};
        if (method === 'bank') {
            details = { ...bankDetails };
            if (details.accountNumber) {
                details.accountNumber = `****${details.accountNumber.slice(-4)}`;
            }
        } else {
            details = { ...cardDetails };
            if (details.cardNumber) {
                details.cardNumber = `****${details.cardNumber.slice(-4)}`;
            }
            details.cvv = '***';
        }

        // Always create a new record to preserve history
        const billing = await prisma.billingDetail.create({
            data: {
                userId,
                fullName,
                address,
                city,
                state,
                country,
                method,
                details: JSON.stringify(details)
            }
        });

        res.json({ success: true, message: 'Billing details saved securely.', billing });

    } catch (e) {
        console.error('Save Billing Error:', e);
        // Return explicit error for debugging
        res.status(500).json({
            message: 'Failed to save billing details',
            error: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        });
    }
};

// GET /api/tenant/billing-details
exports.getBillingDetails = async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);

        // Fetch the most recent billing detail
        const billing = await prisma.billingDetail.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        if (!billing) {
            // Return null or empty object if no details found, still 200 OK
            return res.json({ billing: null });
        }

        // Parse the details JSON string back to object
        let parsedDetails = billing.details;
        try {
            if (typeof billing.details === 'string') {
                parsedDetails = JSON.parse(billing.details);
            }
        } catch (err) {
            console.warn('Failed to parse billing details JSON:', err);
            // Fallback to original string if parse fails
        }

        res.json({
            billing: {
                ...billing,
                details: parsedDetails
            }
        });

    } catch (e) {
        console.error('Get Billing Details Error:', e);
        res.status(500).json({ message: 'Failed to fetch billing details' });
    }
};

// GET /api/tenant/notifications
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = [];

        // 1. Rent Due / Overdue Notifications (From Unpaid Invoices)
        const unpaidInvoices = await prisma.invoice.findMany({
            where: {
                tenantId: userId,
                status: { not: 'paid' }
            },
            include: { unit: true }
        });

        unpaidInvoices.forEach(inv => {
            const dueDate = new Date(inv.dueDate);
            const today = new Date();
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            let title = 'Rent Due Soon';
            let type = 'info';
            let dateStr = dueDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

            if (diffDays < 0) {
                title = 'Rent Overdue';
                type = 'warning';
                dateStr = `Due ${Math.abs(diffDays)} days ago`;
            } else if (diffDays <= 5) {
                title = 'Rent Due Reminder';
                type = 'warning';
                dateStr = `Due in ${diffDays} days`;
            }

            notifications.push({
                id: `INV-${inv.id}`,
                type,
                title,
                desc: `Your rent of $${parseFloat(inv.amount).toFixed(2)} for ${inv.month} is ${diffDays < 0 ? 'overdue' : 'due'}. Please ensure your account has sufficient funds.`,
                date: dateStr,
                action: 'Pay Now',
                path: '/tenant/wallet', // Redirect to wallet to pay
                rawDate: dueDate // for sorting
            });
        });

        // 2. Payment Success Notifications (From Wallet Transactions)
        const recentTransactions = await prisma.walletTransaction.findMany({
            where: {
                wallet: { userId },
                type: 'RENT_PAYMENT',
                status: 'SUCCESS'
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        recentTransactions.forEach(tx => {
            notifications.push({
                id: `TX-${tx.id}`,
                type: 'success',
                title: 'Payment Successful',
                desc: `We successfully received your payment of $${parseFloat(tx.amount).toFixed(2)}. Thank you!`,
                date: new Date(tx.createdAt).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
                action: 'View Wallet',
                path: '/tenant/wallet',
                rawDate: tx.createdAt
            });
        });

        // 3. Lease Expiry Warning
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    where: { status: 'Active' },
                }
            }
        });

        if (tenant && tenant.leases.length > 0) {
            const lease = tenant.leases[0];
            const endDate = new Date(lease.endDate);
            const today = new Date();
            const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

            if (daysLeft < 60 && daysLeft > 0) {
                notifications.push({
                    id: `LEASE-${lease.id}`,
                    type: 'info',
                    title: 'Lease Expiring Soon',
                    desc: `Your lease matches are set to expire in ${daysLeft} days on ${endDate.toLocaleDateString()}. Please contact administration if you wish to renew.`,
                    date: endDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
                    action: 'View Lease',
                    path: '/tenant/lease',
                    rawDate: today // Show as recent alert
                });
            }
        }

        // Sort by rawDate desc
        notifications.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

        res.json(notifications);

    } catch (e) {
        console.error('Get Notifications Error:', e);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
};
