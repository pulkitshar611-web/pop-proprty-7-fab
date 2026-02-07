const prisma = require('../../config/prisma');

exports.getOutstandingDues = async (req, res) => {
    try {
        const dues = await prisma.invoice.findMany({
            where: {
                status: {
                    not: 'paid'
                }
            },
            include: {
                tenant: true,
                unit: { include: { property: true } }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        const formattedDues = dues.map(due => {
            const dueDate = due.dueDate ? new Date(due.dueDate) : new Date(due.createdAt); // Fallback if no dueDate
            const now = new Date();
            const diffTime = now - dueDate;
            const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Determine status dynamically based on date if not already 'paid'
            // If API status is 'draft', we might want to show it as 'Pending' or 'Overdue'
            let status = 'Pending';
            if (daysOverdue > 0) {
                status = 'Overdue';
            }

            return {
                id: due.id,
                invoiceNo: due.invoiceNo,
                tenant: { name: due.tenant.name },
                unit: { unit: due.unit.name },
                leaseType: due.unit.rentalMode === 'FULL_UNIT' ? 'Full Unit' : 'Bedroom',
                amount: parseFloat(due.amount),
                dueDate: dueDate.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric'
                }),
                daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
                status: status
            };
        });

        res.json(formattedDues);
    } catch (error) {
        console.error('Error fetching outstanding dues:', error);
        res.status(500).json({ message: 'Error fetching outstanding dues' });
    }
};

exports.getReceivedPayments = async (req, res) => {
    try {
        const payments = await prisma.invoice.findMany({
            where: {
                status: 'paid'
            },
            include: {
                tenant: true,
                unit: { include: { property: true } }
            },
            orderBy: {
                paidAt: 'desc'
            }
        });

        const formattedPayments = payments.map(payment => {
            return {
                id: payment.id,
                invoiceNo: payment.invoiceNo,
                tenant: { name: payment.tenant.name },
                unit: {
                    name: payment.unit.name,
                    property: { name: payment.unit.property?.name || 'In-house' }
                },
                type: payment.unit.rentalMode === 'FULL_UNIT' ? 'Full Unit' : 'Bedroom',
                amount: parseFloat(payment.rent), // RENT ONLY
                method: payment.paymentMethod || 'Manual',
                date: payment.paidAt ? payment.paidAt.toISOString() : null,
                status: 'Paid'
            };
        });

        res.json(formattedPayments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Error fetching payments' });
    }
};

exports.getServiceFees = async (req, res) => {
    try {
        const payments = await prisma.invoice.findMany({
            where: {
                status: 'paid',
                serviceFees: { gt: 0 }
            },
            include: {
                tenant: true,
                unit: { include: { property: true } }
            },
            orderBy: {
                paidAt: 'desc'
            }
        });

        const formatted = payments.map(payment => ({
            id: payment.id,
            invoiceNo: payment.invoiceNo,
            tenant: payment.tenant.name,
            unit: `${payment.unit.property?.name || 'In-house'} - ${payment.unit.name}`,
            amount: parseFloat(payment.serviceFees),
            date: payment.paidAt ? payment.paidAt.toISOString() : null,
            status: 'Paid'
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching service fees:', error);
        res.status(500).json({ message: 'Error fetching service fees' });
    }
};
