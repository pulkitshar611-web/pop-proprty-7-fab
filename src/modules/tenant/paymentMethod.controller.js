const prisma = require('../../config/prisma');

// GET all payment methods for logged-in tenant
exports.getPaymentMethods = async (req, res) => {
    try {
        const userId = req.user.id;
        const methods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(methods);
    } catch (error) {
        console.error('Get Payment Methods Error:', error);
        res.status(500).json({ message: 'Server error fetching payment methods' });
    }
};

// ADD a new payment method
exports.addPaymentMethod = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, label, last4, bankName, cardHolder, expiryDate } = req.body;

        if (!type || !label) {
            return res.status(400).json({ message: 'Type and Label are required' });
        }

        // If this is the first method, make it default
        const count = await prisma.paymentMethod.count({ where: { userId } });
        const isDefault = count === 0;

        const newMethod = await prisma.paymentMethod.create({
            data: {
                userId,
                type,
                label,
                last4,
                bankName,
                cardHolder,
                expiryDate,
                isDefault
            }
        });

        const methods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(methods);
    } catch (error) {
        console.error('Add Payment Method Error:', error);
        res.status(500).json({ message: 'Server error adding payment method' });
    }
};

// SET a payment method as default
exports.setDefaultPaymentMethod = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // Verify ownership
        const method = await prisma.paymentMethod.findFirst({
            where: { id: parseInt(id), userId }
        });

        if (!method) {
            return res.status(404).json({ message: 'Payment method not found' });
        }

        // Transaction to update defaults
        await prisma.$transaction([
            prisma.paymentMethod.updateMany({
                where: { userId },
                data: { isDefault: false }
            }),
            prisma.paymentMethod.update({
                where: { id: parseInt(id) },
                data: { isDefault: true }
            })
        ]);

        const methods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(methods);
    } catch (error) {
        console.error('Set Default Payment Method Error:', error);
        res.status(500).json({ message: 'Server error setting default method' });
    }
};

// DELETE a payment method
exports.deletePaymentMethod = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // Verify ownership
        const method = await prisma.paymentMethod.findFirst({
            where: { id: parseInt(id), userId }
        });

        if (!method) {
            return res.status(404).json({ message: 'Payment method not found' });
        }

        await prisma.paymentMethod.delete({
            where: { id: parseInt(id) }
        });

        const methods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(methods);
    } catch (error) {
        console.error('Delete Payment Method Error:', error);
        res.status(500).json({ message: 'Server error deleting payment method' });
    }
};
