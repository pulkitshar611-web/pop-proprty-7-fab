const prisma = require('../../config/prisma');

// GET /api/tenant/invoices
exports.getInvoices = async (req, res) => {
    try {
        const userId = req.user.id;

        const invoices = await prisma.invoice.findMany({
            where: {
                tenantId: userId
            },
            orderBy: { createdAt: 'desc' },
            include: { unit: true }
        });

        const formatted = invoices.map(inv => {
            const s = inv.status.toLowerCase();
            let statusDisplay = 'Due';
            if (s === 'paid') statusDisplay = 'Paid';
            else if (s === 'overdue') statusDisplay = 'Due'; // Keep it simple for tenant

            return {
                id: inv.id,
                dbId: inv.id, // Keep for compatibility
                invoiceNo: inv.invoiceNo,
                month: inv.month,
                // Return amount as string for frontend parsing (remove $ and formatting)
                amount: inv.amount.toString(),
                rent: inv.rent.toString(),
                serviceFees: inv.serviceFees ? inv.serviceFees.toString() : '0',
                status: statusDisplay,
                // Return raw dates for frontend formatting
                dueDate: inv.dueDate,
                createdAt: inv.createdAt,
                // Derived date for legacy support if needed, but frontend uses dueDate
                date: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : inv.createdAt.toISOString().split('T')[0],
                unit: inv.unit ? inv.unit.name : 'N/A'
            };
        });

        res.json(formatted);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/tenant/invoices/mock (TESTING ONLY)
exports.createMockInvoice = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find tenant and unit
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    where: { status: 'Active' },
                    include: { unit: true }
                }
            }
        });

        if (!tenant || tenant.leases.length === 0) {
            return res.status(400).json({ message: 'No active lease found' });
        }

        const lease = tenant.leases[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const monthStr = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

        // Check if invoice exists for this month to avoid duplicates (optional, but good logic)
        // For testing "Double", we might want to force it, so we'll append a random string if needed or just let it create.

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNo: `INV-${Date.now()}`,
                tenantId: userId,
                unitId: lease.unitId,
                month: monthStr,
                amount: lease.monthlyRent || lease.unit.rentAmount,
                rent: lease.monthlyRent || lease.unit.rentAmount,
                serviceFees: 0,
                dueDate: nextMonth,
                status: 'pending'
            }
        });

        res.json({ success: true, message: 'Mock invoice created', invoice });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Failed to create mock invoice' });
    }
};
