const prisma = require('../../config/prisma');

// GET /api/admin/reports
exports.getReports = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // --- KPI Calculation ---

        // Total Revenue (All Time - Paid Invoices)
        const paidInvoices = await prisma.invoice.findMany({ where: { status: 'paid' } });
        const totalRevenue = paidInvoices.reduce((sum, i) => sum + parseFloat(i.amount), 0);

        // Occupancy Rate
        const totalUnits = await prisma.unit.count();
        const occupiedUnits = await prisma.unit.count({ where: { status: { not: 'Vacant' } } });
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        // Active Leases
        const activeLeases = await prisma.lease.count({ where: { status: 'Active' } });

        // New Leases this month
        const newLeases = await prisma.lease.count({
            where: {
                status: 'Active',
                createdAt: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        // Outstanding Dues (Total unpaid invoices)
        const unpaidInvoices = await prisma.invoice.findMany({ where: { status: { not: 'paid' } } });
        const outstandingDues = unpaidInvoices.reduce((sum, i) => sum + parseFloat(i.amount), 0);

        // --- Detailed Reports ---

        // Monthly Rent Collected (Paid in Current Month)
        const currentMonthPaidInvoices = await prisma.invoice.findMany({
            where: {
                status: 'paid',
                paidAt: { gte: startOfMonth, lte: endOfMonth }
            }
        });
        const monthlyRentCollected = currentMonthPaidInvoices.reduce((sum, i) => sum + parseFloat(i.rent), 0);
        const monthlyServiceFeeEarned = currentMonthPaidInvoices.reduce((sum, i) => sum + parseFloat(i.serviceFees || 0), 0);

        // Pending Rents (Due in Current Month but NOT Paid)
        const currentMonthPendingInvoices = await prisma.invoice.findMany({
            where: {
                status: { not: 'paid' },
                createdAt: { gte: startOfMonth, lte: endOfMonth }
            }
        });
        const pendingRents = currentMonthPendingInvoices.reduce((sum, i) => sum + parseFloat(i.rent), 0);

        // Payment Success Rate (From WalletTransactions or inferred from Invoices)
        // Let's use WalletTransactions if available for specific success/failure rates
        const totalTransactions = await prisma.walletTransaction.count();
        const failedTransactions = await prisma.walletTransaction.count({ where: { status: 'FAILED' } });
        const successRate = totalTransactions > 0 ? Math.round(((totalTransactions - failedTransactions) / totalTransactions) * 100) : 100;
        const failedRate = 100 - successRate; // Simplified

        // --- Graphs Data ---

        // Monthly Revenue (Last 6 months)
        const monthlyRevenueGraph = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);

            const mInvoices = await prisma.invoice.findMany({
                where: {
                    status: 'paid',
                    paidAt: { gte: mStart, lte: mEnd }
                }
            });
            const mTotal = mInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
            monthlyRevenueGraph.push({ month: d.toLocaleString('default', { month: 'short' }), amount: mTotal });
        }


        // Lease Type Distribution
        const leases = await prisma.lease.findMany({
            where: { status: 'Active' },
            include: { unit: true }
        });

        let fullUnitCount = 0;
        let bedroomCount = 0;
        const totalActiveLeases = leases.length;

        leases.forEach(l => {
            if (l.unit.rentalMode === 'FULL_UNIT') fullUnitCount++;
            else bedroomCount++;
        });

        const fullUnitPerc = totalActiveLeases > 0 ? Math.round((fullUnitCount / totalActiveLeases) * 100) : 0;
        const bedroomPerc = totalActiveLeases > 0 ? Math.round((bedroomCount / totalActiveLeases) * 100) : 0;


        // --- Top Performing Properties ---
        const properties = await prisma.property.findMany({
            include: {
                units: {
                    include: {
                        invoices: { where: { status: 'paid' } } // All time revenue
                    }
                }
            }
        });

        const propertyPerformance = properties.map(p => {
            const revenue = p.units.reduce((rSum, u) => {
                return rSum + u.invoices.reduce((iSum, i) => iSum + parseFloat(i.amount), 0);
            }, 0);

            const pTotalUnits = p.units.length;
            const pOccupied = p.units.filter(u => u.status !== 'Vacant').length; // Snapshot status
            const pOccupancy = pTotalUnits > 0 ? Math.round((pOccupied / pTotalUnits) * 100) : 0;

            return {
                name: p.name,
                revenue,
                occupancy: pOccupancy
            };
        }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        res.json({
            kpi: {
                totalRevenue,
                occupancyRate,
                activeLeases,
                outstandingDues,
                newLeases
            },
            detailed: {
                monthlyRentCollected,
                monthlyServiceFeeEarned,
                pendingRents,
                paymentSuccessRate: successRate,
                paymentFailedRate: failedRate
            },
            monthlyRevenueGraph, // Array of {month, amount}
            leaseDistribution: { fullUnit: fullUnitPerc, bedroom: bedroomPerc },
            topProperties: propertyPerformance
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};
