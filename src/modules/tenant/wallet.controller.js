const prisma = require('../../config/prisma');

exports.getWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        let wallet = await prisma.wallet.findUnique({
            where: { userId },
            include: {
                transactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: {
                    userId,
                    balance: 0.00
                },
                include: {
                    transactions: true
                }
            });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get Wallet Error:', error);
        res.status(500).json({ message: 'Server error fetching wallet' });
    }
};

exports.addFunds = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, method } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        let wallet = await prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: { userId, balance: 0.00 }
            });
        }

        const updatedWallet = await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: amount },
                transactions: {
                    create: {
                        type: 'ADD_FUNDS',
                        amount: amount,
                        method: method || 'DEBIT_CARD',
                        status: 'SUCCESS'
                    }
                }
            },
            include: {
                transactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        res.json(updatedWallet);
    } catch (error) {
        console.error('Add Funds Error:', error);
        res.status(500).json({ message: 'Server error adding funds' });
    }
};

exports.withdraw = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, method } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const wallet = await prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

        if (parseFloat(wallet.balance) < parseFloat(amount)) {
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        const updatedWallet = await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { decrement: amount },
                transactions: {
                    create: {
                        type: 'WITHDRAW',
                        amount: amount,
                        method: method || 'BANK',
                        status: 'SUCCESS'
                    }
                }
            },
            include: {
                transactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        res.json(updatedWallet);
    } catch (error) {
        console.error('Withdraw Error:', error);
        res.status(500).json({ message: 'Server error withdrawing funds' });
    }
};

exports.transfer = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, recipient } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }
        if (!recipient) {
            return res.status(400).json({ message: 'Recipient is required' });
        }

        await prisma.$transaction(async (tx) => {
            const senderWallet = await tx.wallet.findUnique({ where: { userId } });
            if (!senderWallet || Number(senderWallet.balance) < Number(amount)) {
                throw new Error('Insufficient funds');
            }

            // Find valid recipient
            const recipientUser = await tx.user.findUnique({ where: { email: recipient } });
            if (!recipientUser) throw new Error('Recipient user not found');

            if (recipientUser.id === userId) throw new Error('Cannot transfer to yourself');

            // Deduct from Sender
            await tx.wallet.update({
                where: { userId },
                data: {
                    balance: { decrement: amount },
                    transactions: {
                        create: {
                            type: 'TRANSFER_OUT',
                            amount: amount,
                            method: 'WALLET', // sending via wallet
                            status: 'SUCCESS'
                        }
                    }
                }
            });

            // Add to Recipient
            // Ensure recipient wallet exists
            let recipientWallet = await tx.wallet.findUnique({ where: { userId: recipientUser.id } });
            if (!recipientWallet) {
                recipientWallet = await tx.wallet.create({ data: { userId: recipientUser.id, balance: 0.00 } });
            }

            await tx.wallet.update({
                where: { userId: recipientUser.id },
                data: {
                    balance: { increment: amount },
                    transactions: {
                        create: {
                            type: 'TRANSFER_IN',
                            amount: amount,
                            method: 'WALLET',
                            status: 'SUCCESS'
                        }
                    }
                }
            });
        });

        res.json({ success: true, message: 'Transfer successful' });

    } catch (error) {
        console.error('Transfer Error:', error);
        res.status(400).json({ message: error.message || 'Transfer failed' });
    }
};
