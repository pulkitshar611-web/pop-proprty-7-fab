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
        console.log('getOwnerFinancials called');
        const ownerId = parseInt(req.user.id);
        console.log('Owner ID:', ownerId);

        if (isNaN(ownerId)) {
            console.error('Owner ID is invalid');
            return res.status(400).json({ message: 'Invalid User ID' });
        }

        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        console.log('First day of month:', firstDayOfMonth);

        // Find properties for this owner
        const properties = await prisma.property.findMany({ where: { ownerId } });
        console.log('Properties found:', properties.length);
        const propertyIds = properties.map(p => p.id);
        console.log('Property IDs:', propertyIds);

        let mtdRevenue = 0;
        let outstandingDues = 0;
        let transactions = [];

        if (propertyIds.length > 0) {
            // MTD Revenue (Paid in current month - RENT ONLY)
            const mtdRevenueAgg = await prisma.invoice.aggregate({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    status: 'paid',
                    paidAt: { gte: firstDayOfMonth }
                },
                _sum: { rent: true }
            });
            console.log('MTD Revenue Agg:', mtdRevenueAgg);
            mtdRevenue = Number(mtdRevenueAgg._sum?.rent || 0);

            // Outstanding Dues (Total unpaid for current owner's properties - RENT ONLY)
            const duesAgg = await prisma.invoice.aggregate({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    status: { not: 'paid' }
                },
                _sum: { rent: true }
            });
            console.log('Dues Agg:', duesAgg);
            outstandingDues = Number(duesAgg._sum?.rent || 0);

            // Find recent transactions
            const invoices = await prisma.invoice.findMany({
                where: {
                    unit: { propertyId: { in: propertyIds } }
                },
                include: { unit: { include: { property: true } } },
                orderBy: { createdAt: 'desc' },
                take: 50
            });
            console.log('Invoices found:', invoices.length);

            transactions = invoices.map(inv => {
                try {
                    return {
                        id: `INV-${inv.id}`,
                        property: inv.unit?.property?.name || 'Unknown Property',
                        date: inv.paidAt ? inv.paidAt.toISOString().split('T')[0] : (inv.createdAt ? inv.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                        type: 'Rent Payment',
                        amount: Number(inv.rent || 0), // RENT ONLY
                        status: inv.status ? (inv.status.charAt(0).toUpperCase() + inv.status.slice(1)) : 'Unknown'
                    };
                } catch (err) {
                    console.error('Error mapping invoice:', inv.id, err);
                    return null;
                }
            }).filter(t => t !== null);
        }

        res.json({
            mtdRevenue,
            outstandingDues,
            transactions
        });

    } catch (e) {
        console.error('Error in getOwnerFinancials:', e);
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
                footerLabel: 'Period',
                footerValue: `${currentMonthName} ${today.getFullYear()}`
            },
            {
                title: 'Annual Financial Overview',
                description: `Year-on-year growth, cumulative earnings, and portfolio valuation trends for ${today.getFullYear()}.`,
                type: 'annual_overview',
                footerLabel: 'Fiscal Year',
                footerValue: `${today.getFullYear()}`
            },
            {
                title: 'Occupancy & Vacancy Analysis',
                description: `Unit-by-unit occupancy status and historical vacancy rates across ${properties.length} active sites.`,
                type: 'occupancy_stats',
                footerLabel: 'Status',
                footerValue: 'Live Data'
            },
        ];

        const stats = [];

        res.json({ reports, stats });
    } catch (e) {
        console.error('Get Owner Reports Error:', e);
        res.status(500).json({ message: 'Failed to fetch owner reports' });
    }
};

// GET /api/owner/reports/download
exports.downloadOwnerReport = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const ownerId = req.user.id;
        const { type } = req.query;

        // Fetch properties for context
        const properties = await prisma.property.findMany({ where: { ownerId } });
        const propertyIds = properties.map(p => p.id);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        let fileName = `${type}_report.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        doc.pipe(res);

        // --- HELPER FUNCTIONS ---
        const formatCurrency = (amount) => {
            if (!amount) return '$0.00';
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
        };

        const formatDate = (date) => {
            if (!date) return '-';
            return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const drawTableHeader = (doc, headers, y, colWidths) => {
            doc.fillColor('#f1f5f9').rect(50, y, 500, 30).fill();
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9);
            let x = 60; // Left padding in cell
            headers.forEach((header, i) => {
                doc.text(header.toUpperCase(), x, y + 10, { width: colWidths[i], align: 'left' });
                x += colWidths[i];
            });
            doc.moveTo(50, y + 30).lineTo(550, y + 30).strokeColor('#cbd5e1').stroke();
            return y + 30;
        };

        const drawTableRow = (doc, rowData, y, colWidths, isEven) => {
            if (isEven) {
                doc.fillColor('#f8fafc').rect(50, y, 500, 24).fill();
            }
            doc.fillColor('#475569').font('Helvetica').fontSize(9);
            let x = 60;
            rowData.forEach((data, i) => {
                doc.text(data || '-', x, y + 7, { width: colWidths[i] - 10, align: 'left', lineBreak: false, ellipsis: true });
                x += colWidths[i];
            });
            doc.moveTo(50, y + 24).lineTo(550, y + 24).strokeColor('#e2e8f0').stroke();
            return y + 24;
        };

        // --- HEADER ---
        doc.rect(0, 0, 600, 100).fillColor('#ffffff').fill(); // White header bg
        doc.fillColor('#4f46e5').fontSize(22).font('Helvetica-Bold').text('PropOwner', 50, 40);
        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text('PORTAL ACCESS', 50, 65);

        doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(`Generated Report`, 400, 40, { align: 'right', width: 150 });
        doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(formatDate(new Date()), 400, 55, { align: 'right', width: 150 });

        doc.moveTo(50, 90).lineTo(550, 90).lineWidth(1).strokeColor('#f1f5f9').stroke();

        let currentY = 130;

        if (type === 'monthly_summary') {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            // Title
            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Monthly Performance Summary', 50, currentY);
            currentY += 20;
            doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`${formatDate(firstDay)} — ${formatDate(lastDay)}`, 50, currentY);
            currentY += 40;

            // Summary Metrics Box
            const revenueAgg = await prisma.invoice.aggregate({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    status: 'paid',
                    paidAt: { gte: firstDay, lte: lastDay }
                },
                _sum: { rent: true }
            });
            const monthlyRevenue = parseFloat(revenueAgg._sum.rent || 0);
            const unitCount = await prisma.unit.count({ where: { propertyId: { in: propertyIds } } });
            const occupiedCount = await prisma.unit.count({
                where: { propertyId: { in: propertyIds }, status: 'Occupied' }
            });
            const vacancyRate = unitCount > 0 ? ((unitCount - occupiedCount) / unitCount * 100).toFixed(1) : 0;

            const boxY = currentY;
            doc.roundedRect(50, boxY, 500, 80, 8).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();

            // Metrics Columns
            const metrics = [
                { label: 'Total Properties', value: properties.length.toString() },
                { label: 'Occupancy Rate', value: `${(100 - vacancyRate).toFixed(1)}%` },
                { label: 'Monthly Revenue', value: formatCurrency(monthlyRevenue) }
            ];

            let mx = 80;
            metrics.forEach(m => {
                doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(m.label.toUpperCase(), mx, boxY + 25);
                doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text(m.value, mx, boxY + 45);
                mx += 160;
            });

            currentY += 110;

            // Transactions Table
            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Transaction Details', 50, currentY);
            currentY += 30;

            const headers = ['Date', 'Invoice #', 'Unit', 'Tenant', 'Amount', 'Status'];
            const colWidths = [70, 130, 50, 100, 80, 70];

            currentY = drawTableHeader(doc, headers, currentY, colWidths);

            const invoices = await prisma.invoice.findMany({
                where: { unit: { propertyId: { in: propertyIds } }, createdAt: { gte: firstDay, lte: lastDay } },
                include: { unit: true, tenant: true },
                orderBy: { createdAt: 'desc' }
            });

            invoices.forEach((inv, i) => {
                if (currentY > 750) { doc.addPage(); currentY = 50; }
                const dateStr = inv.paidAt ? formatDate(inv.paidAt) : formatDate(inv.createdAt);
                const tenantName = inv.tenant ? inv.tenant.name : 'Unknown';
                currentY = drawTableRow(doc, [
                    dateStr,
                    inv.invoiceNo,
                    inv.unit.name,
                    tenantName,
                    formatCurrency(parseFloat(inv.rent)),
                    inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
                ], currentY, colWidths, i % 2 === 0);
            });

        } else if (type === 'annual_overview') {
            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Annual Financial Overview', 50, currentY);
            currentY += 20;
            doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`Fiscal Year ${new Date().getFullYear()}`, 50, currentY);
            currentY += 40;

            const headers = ['Month', 'Expected', 'Collected', 'Outstanding'];
            const colWidths = [120, 120, 120, 120];

            currentY = drawTableHeader(doc, headers, currentY, colWidths);

            const today = new Date();
            for (let i = 0; i < 12; i++) {
                if (currentY > 750) { doc.addPage(); currentY = 50; }
                const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const monthStr = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

                const invoices = await prisma.invoice.findMany({
                    where: { unit: { propertyId: { in: propertyIds } }, createdAt: { gte: monthStart, lte: monthEnd } }
                });

                let expected = 0, collected = 0, dues = 0;
                invoices.forEach(inv => {
                    const rent = parseFloat(inv.rent);
                    expected += rent;
                    if (inv.status === 'paid') collected += rent;
                    else dues += rent;
                });

                currentY = drawTableRow(doc, [
                    monthStr,
                    formatCurrency(expected),
                    formatCurrency(collected),
                    formatCurrency(dues)
                ], currentY, colWidths, i % 2 === 0);
            }

        } else if (type === 'occupancy_stats') {
            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Occupancy & Vacancy Analysis', 50, currentY);
            const unitCount = await prisma.unit.count({ where: { propertyId: { in: propertyIds } } });

            currentY += 20;
            doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`${unitCount} Total Units  ·  Live Snapshot`, 50, currentY);

            currentY += 40;

            const headers = ['Property', 'Unit', 'Status', 'Tenant', 'Rent', 'Lease End'];
            // Adjusted widths: Property(120), Unit(60), Status(70), Tenant(110), Rent(70), Lease End(70) => Total 500
            const colWidths = [120, 60, 70, 110, 70, 70];

            currentY = drawTableHeader(doc, headers, currentY, colWidths);

            const units = await prisma.unit.findMany({
                where: { propertyId: { in: propertyIds } },
                include: { property: true, leases: { where: { status: 'Active' }, include: { tenant: true } } }
            });

            units.forEach((u, i) => {
                if (currentY > 750) { doc.addPage(); currentY = 50; }
                const lease = u.leases[0];
                const tenantName = lease ? lease.tenant.user?.name || lease.tenant.name : '-';
                const leaseEnd = lease && lease.endDate ? formatDate(lease.endDate) : '-';

                currentY = drawTableRow(doc, [
                    u.property.name,
                    u.name,
                    u.status,
                    tenantName,
                    formatCurrency(parseFloat(u.rentAmount)),
                    leaseEnd
                ], currentY, colWidths, i % 2 === 0);
            });

        } else if (type === 'ytd_statement') {
            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Year-to-Date Financial Statement', 50, currentY);
            currentY += 20;
            const year = new Date().getFullYear();
            doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`Fiscal Year: ${year} (Jan 1 - Present)`, 50, currentY);

            // Calculate YTD totals first for a summary box
            const startOfYear = new Date(year, 0, 1);
            const today = new Date();

            const allYtdInvoices = await prisma.invoice.findMany({
                where: {
                    unit: { propertyId: { in: propertyIds } },
                    createdAt: { gte: startOfYear, lte: today }
                }
            });

            let ytdExpected = 0;
            let ytdCollected = 0;
            let ytdOutstanding = 0;

            allYtdInvoices.forEach(inv => {
                const amount = parseFloat(inv.rent);
                ytdExpected += amount;
                if (inv.status === 'paid') ytdCollected += amount;
                else ytdOutstanding += amount;
            });

            currentY += 40;

            // Draw Summary Box
            doc.roundedRect(50, currentY, 500, 80, 8).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();

            // Metrics Columns
            const metrics = [
                { label: 'YTD Invoiced', value: formatCurrency(ytdExpected) },
                { label: 'YTD Collected', value: formatCurrency(ytdCollected) },
                { label: 'Outstanding', value: formatCurrency(ytdOutstanding) }
            ];

            let mx = 80;
            metrics.forEach(m => {
                doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(m.label.toUpperCase(), mx, currentY + 25);
                doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text(m.value, mx, currentY + 45);
                mx += 160;
            });

            currentY += 110;

            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Monthly Breakdown', 50, currentY);
            currentY += 30;

            const headers = ['Month', 'Invoiced', 'Collected', 'Outstanding', 'Net Income'];
            const colWidths = [100, 100, 100, 100, 100];

            currentY = drawTableHeader(doc, headers, currentY, colWidths);

            // Loop through months of current year
            for (let m = 0; m <= today.getMonth(); m++) {
                if (currentY > 750) { doc.addPage(); currentY = 50; }

                const monthStart = new Date(year, m, 1);
                const monthEnd = new Date(year, m + 1, 0);
                const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

                let minvoiced = 0, mcollected = 0, moutstanding = 0;

                // Filter invoices for this month from the already fetched allYtdInvoices
                // to avoid multiple db calls in loop
                const monthInvoices = allYtdInvoices.filter(inv => {
                    const d = new Date(inv.createdAt);
                    return d >= monthStart && d <= monthEnd;
                });

                monthInvoices.forEach(inv => {
                    const rent = parseFloat(inv.rent);
                    minvoiced += rent;
                    if (inv.status === 'paid') mcollected += rent;
                    else moutstanding += rent;
                });

                currentY = drawTableRow(doc, [
                    monthName,
                    formatCurrency(minvoiced),
                    formatCurrency(mcollected),
                    formatCurrency(moutstanding),
                    formatCurrency(mcollected)
                ], currentY, colWidths, m % 2 === 0);
            }

        } else {
            return res.status(400).json({ message: 'Invalid report type' });
        }

        doc.end();

    } catch (e) {
        console.error('Download Report Error:', e);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to generate report' });
        }
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
        // Fetch units for these properties to filter tickets and get names
        const units = await prisma.unit.findMany({
            where: { propertyId: { in: propertyIds } },
            select: { id: true, name: true }
        });
        const unitIds = units.map(u => u.id);
        const unitMap = units.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});

        const openTickets = await prisma.ticket.findMany({
            where: {
                unitId: { in: unitIds },
                status: 'Open'
            },
            orderBy: { createdAt: 'desc' }
        });

        openTickets.forEach(t => {
            const unitName = unitMap[t.unitId] || 'Unknown Unit';
            notifications.push({
                id: `T-${t.id}`,
                type: 'alert', // critical
                title: 'New Maintenance Ticket',
                message: `Unit ${unitName}: ${t.subject}`,
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

        // 4. Pending Invitations (New)
        const pendingInvitations = await prisma.invitation.findMany({
            where: {
                email: req.user.email,
                status: 'Pending'
            },
            include: { inviter: true }
        });

        pendingInvitations.forEach(inv => {
            notifications.push({
                id: `INV-${inv.id}`,
                type: 'info',
                title: 'New Invitation',
                message: `Invite from ${inv.inviter?.email || 'Unknown'}: Join as ${inv.role}`,
                date: inv.createdAt
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
