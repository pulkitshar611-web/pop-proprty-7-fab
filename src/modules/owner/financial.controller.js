const prisma = require('../../config/prisma');

// GET /api/owner/financials
exports.getFinancialStats = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Mocked real logic: Sum of rent from owned properties properties
        // 1. Get properties
        // 1. Get properties owned by the user
        const properties = await prisma.property.findMany({
            where: { ownerId },
            select: { id: true, name: true }
        });

        const propertyIds = properties.map(p => p.id);

        // 2. Calculate Total Collected Revenue (Rent Only) from Ledger
        // AccountingService records rent with ownerId, so we just sum that.
        const totalRevenueAgg = await prisma.transaction.aggregate({
            where: {
                ownerId: ownerId,
                type: 'Income'
            },
            _sum: {
                amount: true
            }
        });
        const totalRevenue = totalRevenueAgg._sum.amount || 0;

        // Calculate MTD Revenue
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const mtdRevenueAgg = await prisma.transaction.aggregate({
            where: {
                ownerId: ownerId,
                type: 'Income',
                date: { gte: startOfMonth }
            },
            _sum: {
                amount: true
            }
        });
        const mtdRevenue = mtdRevenueAgg._sum.amount || 0;

        // 3. Calculate Outstanding Dues from Unpaid Invoices
        // Invoices are linked to units -> properties
        const outstandingAgg = await prisma.invoice.aggregate({
            where: {
                unit: {
                    propertyId: { in: propertyIds }
                },
                status: { not: 'paid' }
            },
            _sum: {
                amount: true
            }
        });
        const pendingDues = outstandingAgg._sum.amount || 0;

        // 4. Get Recent Transactions from Ledger
        const recentTx = await prisma.transaction.findMany({
            where: { ownerId },
            orderBy: { date: 'desc' },
            take: 10,
            include: {
                property: { select: { name: true } }
            }
        });

        const recentTransactions = recentTx.map(tx => ({
            id: `TXN-${tx.id}`,
            property: tx.property?.name || 'Unknown',
            date: tx.date.toISOString().split('T')[0],
            amount: parseFloat(tx.amount),
            type: 'Rent', // Ledger for owner is always Rent
            status: tx.status
        }));

        res.json({
            collected: totalRevenue, // Lifetime
            outstandingDues: pendingDues,
            mtdRevenue: mtdRevenue,
            transactions: recentTransactions
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};
