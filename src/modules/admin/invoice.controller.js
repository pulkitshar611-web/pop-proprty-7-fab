const prisma = require('../../config/prisma');
const accountingService = require('../../services/AccountingService');

// GET /api/admin/invoices
exports.getAllInvoices = async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({
            include: {
                tenant: true,
                unit: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = invoices.map(inv => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            tenant: inv.tenant.name,
            unit: inv.unit.name,
            month: inv.month,
            rent: parseFloat(inv.rent),
            serviceFees: parseFloat(inv.serviceFees),
            amount: parseFloat(inv.amount),
            status: inv.status,
            paidAt: inv.paidAt
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Get Invoices Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/admin/invoices
exports.createInvoice = async (req, res) => {
    try {
        const { tenantId, unitId, month, rent, serviceFees } = req.body;

        const invoiceNo = `INV-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-4)}`;
        const rentVal = parseFloat(rent) || 0;
        const feesVal = parseFloat(serviceFees) || 0;
        const total = rentVal + feesVal;

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNo,
                tenantId: parseInt(tenantId),
                unitId: parseInt(unitId),
                month,
                rent: rentVal,
                serviceFees: feesVal,
                amount: total,
                status: 'draft'
            },
            include: { tenant: true, unit: true }
        });

        res.status(201).json(invoice);
    } catch (error) {
        console.error('Create Invoice Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// PUT /api/admin/invoices/:id
exports.updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { rent, serviceFees, status, month } = req.body;

        const currentInvoice = await prisma.invoice.findUnique({
            where: { id: parseInt(id) },
            include: { unit: { include: { property: true } } }
        });
        if (!currentInvoice) return res.status(404).json({ message: 'Invoice not found' });

        const rentVal = rent !== undefined ? parseFloat(rent) : parseFloat(currentInvoice.rent);
        const feesVal = serviceFees !== undefined ? parseFloat(serviceFees) : parseFloat(currentInvoice.serviceFees);
        const total = rentVal + feesVal;

        // Atomic update and ledger entry
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.invoice.update({
                where: { id: parseInt(id) },
                data: {
                    rent: rentVal,
                    serviceFees: feesVal,
                    amount: total,
                    status: status || currentInvoice.status,
                    month: month || currentInvoice.month,
                    paidAt: (status === 'paid' && currentInvoice.status !== 'paid') ? new Date() : currentInvoice.paidAt
                }
            });

            if (status === 'paid' && currentInvoice.status !== 'paid') {
                await accountingService.recordTransaction({
                    description: `Manual Payment entry for ${updated.invoiceNo} (Admin)`,
                    type: 'Income',
                    amount: total,
                    invoiceId: updated.id,
                    propertyId: currentInvoice.unit.propertyId,
                    ownerId: currentInvoice.unit.property.ownerId,
                    idempotencyKey: `ADMIN-PAY-${updated.id}-${Date.now()}`
                }, tx);
            }

            return updated;
        });

        res.json(result);
    } catch (error) {
        console.error('Update Invoice Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// DELETE /api/admin/invoices/:id
exports.deleteInvoice = async (req, res) => {
    try {
        await prisma.invoice.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Invoice deleted' });
    } catch (error) {
        console.error('Delete Invoice Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// PATCH /api/admin/invoices/:id/status
exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const currentInvoice = await prisma.invoice.findUnique({
            where: { id: parseInt(id) },
            include: { unit: { include: { property: true } } }
        });

        if (status === 'paid' && currentInvoice.status !== 'paid') {
            const result = await accountingService.processInvoicePayment(parseInt(id), {
                method: 'Manual (Admin)',
                idempotencyKey: `ADMIN-STATUS-${id}-${Date.now()}`
            });
            return res.json(result);
        }

        const updated = await prisma.invoice.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json(updated);
    } catch (error) {
        console.error('Update Invoice Status Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
