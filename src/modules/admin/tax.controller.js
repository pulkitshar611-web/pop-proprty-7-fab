const prisma = require('../../config/prisma');

// GET /api/admin/taxes
exports.getTaxes = async (req, res) => {
    try {
        // ✅ FIX: Schema model is "taxes" (plural), not "tax"
        const taxes = await prisma.taxes.findMany({
            orderBy: { createdAt: 'asc' }
        });
        res.json(taxes);
    } catch (e) {
        console.error('Error fetching taxes:', e);
        res.status(500).json({ message: 'Error fetching taxes' });
    }
};

// POST /api/admin/taxes
exports.updateTaxes = async (req, res) => {
    try {
        const payload = req.body;

        // If it's a single object, create it
        if (!Array.isArray(payload)) {
            // ✅ FIX: prisma.taxes (plural)
            const newTax = await prisma.taxes.create({
                data: {
                    name: payload.name,
                    rate: parseFloat(payload.rate),
                    appliesTo: payload.appliesTo,
                    status: payload.status === 'inactive' ? 'inactive' : 'active'
                }
            });
            return res.status(201).json(newTax);
        }

        // If it's an array, perform bulk update (destructive)
        const result = await prisma.$transaction(async (tx) => {
            // ✅ FIX: tx.taxes (plural) inside $transaction
            await tx.taxes.deleteMany();
            if (payload.length > 0) {
                await tx.taxes.createMany({
                    data: payload.map(t => ({
                        name: t.name,
                        rate: parseFloat(t.rate),
                        appliesTo: t.appliesTo,
                        status: t.status === 'active' ? 'active' : 'inactive'
                    }))
                });
            }
            return await tx.taxes.findMany({
                orderBy: { createdAt: 'asc' }
            });
        });

        res.json(result);
    } catch (e) {
        console.error('Error updating taxes:', e);
        res.status(500).json({ message: 'Error updating taxes' });
    }
};

// DELETE /api/admin/taxes/:id
exports.deleteTax = async (req, res) => {
    try {
        const { id } = req.params;
        const taxId = parseInt(id);

        if (isNaN(taxId)) {
            return res.status(400).json({ message: 'Invalid tax ID' });
        }

        // ✅ FIX: prisma.taxes (plural)
        await prisma.taxes.delete({
            where: { id: taxId }
        });
        res.json({ message: 'Tax deleted successfully' });
    } catch (e) {
        console.error('Error deleting tax:', e);
        res.status(500).json({ message: 'Error deleting tax' });
    }
};

// PATCH /api/admin/taxes/:id
exports.updateTax = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rate, appliesTo, status } = req.body;
        const taxId = parseInt(id);

        if (isNaN(taxId)) {
            return res.status(400).json({ message: 'Invalid tax ID' });
        }

        // ✅ FIX: prisma.taxes (plural)
        const updatedTax = await prisma.taxes.update({
            where: { id: taxId },
            data: {
                name,
                rate: rate !== undefined ? parseFloat(rate) : undefined,
                appliesTo,
                status: status === 'active' || status === 'inactive' ? status : undefined
            }
        });

        res.json(updatedTax);
    } catch (e) {
        console.error('Error updating tax:', e);
        res.status(500).json({ message: 'Error updating tax' });
    }
};
