const prisma = require('../../config/prisma');

// GET /api/owner/dashboard/stats
exports.getOwnerDashboardStats = async (req, res) => {
    try {
        const ownerId = req.user.id; // From Auth Middleware

        // 1. Properties Owned
        const propertyCount = await prisma.property.count({ where: { ownerId } });

        // 2. Units in those properties
        const properties = await prisma.property.findMany({
            where: { ownerId },
            include: { units: true }
        });
        const propertyIds = properties.map(p => p.id);
        const unitCount = await prisma.unit.count({ where: { propertyId: { in: propertyIds } } });

        // 3. Occupancy
        const occupiedCount = await prisma.unit.count({
            where: {
                propertyId: { in: propertyIds },
                status: 'Occupied'
            }
        });
        const vacantCount = unitCount - occupiedCount;

        // 4. Actual Revenue (Paid Invoices - RENT ONLY)
        const revenueAgg = await prisma.invoice.aggregate({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: 'paid'
            },
            _sum: { rent: true }
        });
        const monthlyRevenue = revenueAgg._sum.rent || 0;

        // 5. Outstanding Dues (RENT ONLY)
        // Sum of all unpaid invoices for these properties
        const duesAgg = await prisma.invoice.aggregate({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: { not: 'paid' }
            },
            _sum: { rent: true }
        });
        const outstandingDues = duesAgg._sum.rent || 0;


        // 6. Insurance Expiry (Next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const insuranceExpiryCount = await prisma.insurance.count({
            where: {
                userId: ownerId,
                endDate: {
                    gte: new Date(),
                    lte: thirtyDaysFromNow
                }
            }
        });

        res.json({
            propertyCount,
            unitCount,
            occupancy: { occupied: occupiedCount, vacant: vacantCount },
            monthlyRevenue: parseFloat(monthlyRevenue),
            outstandingDues: parseFloat(outstandingDues),
            insuranceExpiryCount,
            recentActivity: ["Rent payment received", "Maintenance request resolved"] // Placeholder for now
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/owner/properties
exports.getOwnerProperties = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const properties = await prisma.property.findMany({
            where: { ownerId },
            include: {
                units: {
                    include: {
                        invoices: {
                            where: { status: 'paid' }
                        }
                    }
                }
            }
        });

        const formatted = properties.map(p => {
            const totalUnits = p.units.length;
            const occupiedCount = p.units.filter(u => u.status === 'Occupied').length;
            const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;

            // Calculate total revenue for this property from paid invoices (RENT ONLY)
            const revenue = p.units.reduce((sum, u) => {
                const unitRevenue = u.invoices.reduce((uSum, inv) => uSum + parseFloat(inv.rent), 0);
                return sum + unitRevenue;
            }, 0);

            return {
                id: p.id,
                name: p.name,
                address: p.address || 'N/A',
                units: totalUnits,
                occupancy: occupancyRate,
                revenue: revenue,
                status: p.status,
                image: p.imageUrl || `https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=250&fit=crop`
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching owner properties:', error);
        res.status(500).json({ message: 'Error' });
    }
};

// GET /api/owner/financials
exports.getOwnerFinancials = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Find properties for this owner
        const properties = await prisma.property.findMany({ where: { ownerId } });
        const propertyIds = properties.map(p => p.id);

        // MTD Revenue (Paid in current month - RENT ONLY)
        const mtdRevenueAgg = await prisma.invoice.aggregate({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: 'paid',
                paidAt: { gte: firstDayOfMonth }
            },
            _sum: { rent: true }
        });
        const mtdRevenue = parseFloat(mtdRevenueAgg._sum.rent || 0);

        // Outstanding Dues (Total unpaid for current owner's properties - RENT ONLY)
        const duesAgg = await prisma.invoice.aggregate({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: { not: 'paid' }
            },
            _sum: { rent: true }
        });
        const outstandingDues = parseFloat(duesAgg._sum.rent || 0);

        // Find recent transactions
        const invoices = await prisma.invoice.findMany({
            where: {
                unit: { propertyId: { in: propertyIds } }
            },
            include: { unit: { include: { property: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const transactions = invoices.map(inv => ({
            id: `INV-${inv.id}`,
            property: inv.unit.property.name,
            date: inv.paidAt ? inv.paidAt.toISOString().split('T')[0] : inv.createdAt.toISOString().split('T')[0],
            type: 'Rent Payment',
            amount: parseFloat(inv.rent), // RENT ONLY
            status: inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
        }));

        res.json({
            mtdRevenue,
            outstandingDues,
            transactions
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};


// GET /api/owner/dashboard/financial-pulse
exports.getOwnerFinancialPulse = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Get properties for this owner
        const properties = await prisma.property.findMany({ where: { ownerId }, include: { units: true } });
        const propertyIds = properties.map(p => p.id);

        const financialPulse = [];
        const today = new Date();

        for (let i = 0; i < 6; i++) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            // Fetch Invoices for this month
            const monthlyInvoices = await prisma.invoice.findMany({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    createdAt: {
                        gte: monthStart,
                        lte: monthEnd
                    }
                }
            });

            let expected = 0;
            let collected = 0;
            let dues = 0;

            monthlyInvoices.forEach(inv => {
                const rent = parseFloat(inv.rent);
                expected += rent;
                if (inv.status === 'paid') {
                    collected += rent;
                } else {
                    dues += rent;
                }
            });

            financialPulse.push({
                month: monthStr,
                expected,
                collected,
                dues
            });
        }

        res.json(financialPulse);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/owner/profile
exports.getProfile = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: ownerId }
        });

        if (!user) return res.status(404).json({ message: 'Owner not found' });

        // Get Property Stats for the "subtitle"
        const propertyCount = await prisma.property.count({ where: { ownerId } });
        const unitsCount = await prisma.unit.count({
            where: { property: { ownerId } }
        });

        res.json({
            name: user.name,
            email: user.email,
            initials: user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2),
            subtitle: `${propertyCount} Properties • ${unitsCount} Units`
        });

    } catch (e) {
        console.error('Owner Profile Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/owner/reports
exports.getOwnerReports = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Fetch properties to check for data existence
        const properties = await prisma.property.findMany({ where: { ownerId } });
        const propertyIds = properties.map(p => p.id);

        // Find oldest invoice/transaction to determine history depth
        const oldestEntry = await prisma.invoice.findFirst({
            where: { unit: { propertyId: { in: propertyIds } } },
            orderBy: { createdAt: 'asc' }
        });

        let totalReportsCount = 0;
        let monthsDiff = 0;

        if (oldestEntry) {
            const start = new Date(oldestEntry.createdAt);
            const now = new Date();

            // Calculate months difference
            monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1; // +1 to include current month
            if (monthsDiff < 1) monthsDiff = 1;

            // Monthly reports (1 per month)
            totalReportsCount += monthsDiff;

            // Annual reports (1 per year started)
            const yearsDiff = now.getFullYear() - start.getFullYear() + 1;
            totalReportsCount += yearsDiff;
        } else {
            // Even with no data, we usually show the current month's "empty" report and current year "empty" report potential
            // But let's stick to "0" or "Available" if user wants strict DB sources. 
            // However, usually Current Month report is always "viewable" even if empty.
            // Let's assume at least 1 monthly and 1 annual are always viewable (Current period).
            totalReportsCount = 2; // Current Month + Current Year
        }

        // Add 1 for "Occupancy & Vacancy Analysis" (Live Snapshot always available)
        totalReportsCount += 1;

        // Add 1 for "Tax Compliance Statement" (usually Annual, let's assume 1 active statement for current year)
        totalReportsCount += 1;


        const today = new Date();
        const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const startOfYear = new Date(today.getFullYear(), 0, 1)
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        // For Tax, usually last month or end of year. Let's say Last Generated: Today (Realtime)

        const currentMonthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });
        const lastYearName = (new Date(today.getFullYear() - 1, 0, 1)).getFullYear();

        const reports = [
            {
                title: 'Monthly Performance Summary',
                description: `Comprehensive view of revenue, occupancy, and expenses for ${currentMonthName}.`,
                type: 'monthly_summary',
                lastGenerated: todayStr
            },
            {
                title: 'Annual Financial Overview',
                description: `Year-on-year growth, cumulative earnings, and portfolio valuation trends for ${today.getFullYear()}.`,
                type: 'annual_overview',
                lastGenerated: startOfYear
            },
            {
                title: 'Occupancy & Vacancy Analysis',
                description: `Unit-by-unit occupancy status and historical vacancy rates across ${properties.length} active sites.`,
                type: 'occupancy_stats',
                lastGenerated: todayStr
            },
            {
                title: 'Tax Compliance Statement',
                description: `Read-only tax summaries and deductible expense records for audit purposes (${today.getFullYear()}).`,
                type: 'tax_statement',
                lastGenerated: todayStr
            },
        ];

        const stats = [
            {
                label: 'Reports Viewable',
                value: `${totalReportsCount} Total`,
                sub: monthsDiff > 12 ? 'Lifetime Data' : `${monthsDiff} Active Months`
            },
            { label: 'Export Limit', value: 'Full Access', sub: 'PDF / CSV Formats' },
            { label: 'Data Latency', value: 'Live', sub: `Synced: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
        ];

        res.json({ reports, stats });
    } catch (e) {
        console.error('Get Owner Reports Error:', e);
        res.status(500).json({ message: 'Failed to fetch owner reports' });
    }
};
// GET /api/owner/reports/download
exports.downloadOwnerReport = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { type } = req.query;

        // Fetch properties for context
        const properties = await prisma.property.findMany({ where: { ownerId } });
        const propertyIds = properties.map(p => p.id);

        let csvContent = '\uFEFF'; // Add BOM for Excel compatibility
        let fileName = `${type}_report.csv`;

        if (type === 'monthly_summary') {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            // Summary Stats
            const revenueAgg = await prisma.invoice.aggregate({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    status: 'paid',
                    paidAt: { gte: firstDay, lte: lastDay }
                },
                _sum: { rent: true }
            });
            const monthlyRevenue = revenueAgg._sum.rent || 0;

            const unitCount = await prisma.unit.count({ where: { propertyId: { in: propertyIds } } });
            const occupiedCount = await prisma.unit.count({
                where: {
                    propertyId: { in: propertyIds },
                    status: 'Occupied'
                }
            });

            csvContent += `Report Type,Monthly Performance Summary\nPeriod,${firstDay.toLocaleDateString()} - ${lastDay.toLocaleDateString()}\nGenerated At,${new Date().toLocaleString()}\n\n`;
            csvContent += `SUMMARY METRICS\n`;
            csvContent += `Metric,Value\nTotal Properties,${properties.length}\nTotal Units,${unitCount}\nOccupied Units,${occupiedCount}\nVacancy Rate,${unitCount > 0 ? ((unitCount - occupiedCount) / unitCount * 100).toFixed(1) : 0}%\nMonthly Revenue,${monthlyRevenue}\n\n`;

            // Detailed Transactions
            csvContent += `TRANSACTION DETAILS\n`;
            csvContent += `Date,Invoice No,Unit,Tenant,Amount,Status\n`;

            const invoices = await prisma.invoice.findMany({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    createdAt: { gte: firstDay, lte: lastDay }
                },
                include: { unit: true, tenant: true },
                orderBy: { createdAt: 'desc' }
            });

            invoices.forEach(inv => {
                const dateStr = inv.paidAt ? inv.paidAt.toLocaleDateString() : inv.createdAt.toLocaleDateString();
                const tenantName = inv.tenant ? inv.tenant.name : 'Unknown';
                csvContent += `${dateStr},${inv.invoiceNo},${inv.unit.name},${tenantName},${inv.rent},${inv.status}\n`;
            });

        } else if (type === 'annual_overview') {
            csvContent += `Report Type,Annual Financial Overview\nYear,${new Date().getFullYear()}\n\n`;
            csvContent += "Month,Expected Revenue,Collected Revenue,Dues\n";

            const today = new Date();
            // Show last 12 months logic
            for (let i = 0; i < 12; i++) {
                const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

                const invoices = await prisma.invoice.findMany({
                    where: {
                        unit: { propertyId: { in: propertyIds } },
                        createdAt: { gte: monthStart, lte: monthEnd }
                    }
                });

                let expected = 0, collected = 0, dues = 0;
                invoices.forEach(inv => {
                    const rent = parseFloat(inv.rent);
                    expected += rent;
                    if (inv.status === 'paid') collected += rent;
                    else dues += rent;
                });

                csvContent += `${monthStr},${expected},${collected},${dues}\n`;
            }

        } else if (type === 'occupancy_stats') {
            csvContent += `Report Type,Occupancy & Vacancy Analysis\nGenerated At,${new Date().toLocaleString()}\n\n`;
            csvContent += "Property Name,Unit Name,Status,Tenant,Rent Amount,Current Lease End\n";

            const units = await prisma.unit.findMany({
                where: { propertyId: { in: propertyIds } },
                include: { property: true, leases: { where: { status: 'Active' }, include: { tenant: true } } }
            });

            units.forEach(u => {
                const lease = u.leases[0];
                const tenantName = lease ? lease.tenant.name : 'N/A';
                const leaseEnd = lease && lease.endDate ? lease.endDate.toLocaleDateString() : 'N/A';
                csvContent += `${u.property.name},${u.name},${u.status},${tenantName},${u.rentAmount},${leaseEnd}\n`;
            });

        } else if (type === 'tax_statement') {
            const year = new Date().getFullYear();
            csvContent += `Report Type,Tax Compliance Statement\nTax Year,${year}\nNote,This is a preliminary summary. Consult a tax professional.\n\n`;

            // Calculate Total Income for the year
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31);

            const incomeAgg = await prisma.invoice.aggregate({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    status: 'paid',
                    paidAt: { gte: startOfYear, lte: endOfYear }
                },
                _sum: { rent: true }
            });
            const grossIncome = incomeAgg._sum.rent || 0;

            csvContent += `INCOME SUMMARY\n`;
            csvContent += `Description,Amount\n`;
            csvContent += `Gross Rental Income,${grossIncome}\n`;
            csvContent += `Service Fees Collected,0.00\n`;
            csvContent += `Total Gross Income,${grossIncome}\n\n`;

            csvContent += `DEDUCTIBLE EXPENSES\n`;
            csvContent += `Description,Amount\n`;
            csvContent += `Property Taxes,0.00 (Not Tracked)\n`;
            csvContent += `Insurance,0.00 (Not Tracked)\n`;
            csvContent += `Maintenance,0.00 (Not Tracked)\n\n`;

            csvContent += `NET TAXABLE INCOME,Check with Accountant\n`;

        } else {
            return res.status(400).json({ message: 'Invalid report type' });
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csvContent);

    } catch (e) {
        console.error('Download Report Error:', e);
        res.status(500).json({ message: 'Failed to generate report' });
    }
};
// GET /api/owner/notifications
exports.getNotifications = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const properties = await prisma.property.findMany({ where: { ownerId } });
        const propertyIds = properties.map(p => p.id);

        const notifications = [];

        // 1. Open Tickets (Action Required)
        const openTickets = await prisma.ticket.findMany({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: 'Open'
            },
            include: { unit: true },
            orderBy: { createdAt: 'desc' }
        });

        openTickets.forEach(t => {
            notifications.push({
                id: `T-${t.id}`,
                type: 'alert', // critical
                title: 'New Maintenance Ticket',
                message: `Unit ${t.unit.name}: ${t.subject}`,
                date: t.createdAt
            });
        });

        // 2. Recent Payments (Last 3 days)
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const recentPayments = await prisma.invoice.findMany({
            where: {
                unit: { propertyId: { in: propertyIds } },
                status: 'paid',
                paidAt: { gte: threeDaysAgo }
            },
            include: { unit: true },
            orderBy: { paidAt: 'desc' }
        });

        recentPayments.forEach(p => {
            notifications.push({
                id: `P-${p.id}`,
                type: 'success',
                title: 'Rent Received',
                message: `Received ${parseFloat(p.amount)} for Unit ${p.unit.name}`,
                date: p.paidAt
            });
        });

        // 3. Expired Insurance
        const expiredInsurance = await prisma.insurance.findMany({
            where: {
                userId: ownerId,
                endDate: { lte: new Date() }
            }
        });

        expiredInsurance.forEach(i => {
            notifications.push({
                id: `I-${i.id}`,
                type: 'warning',
                title: 'Insurance Expired',
                message: `Policy ${i.policyNumber} has expired. Please renew.`,
                date: i.endDate // technical date
            });
        });

        // Sort by date desc
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(notifications);

    } catch (e) {
        console.error('Owner Notifications Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};
