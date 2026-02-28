const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    try {
        console.log('--- Starting Verification ---');

        // 1. Check if an invoice can be found with new fields
        const invoice = await prisma.invoice.findFirst();
        if (invoice) {
            console.log('Found invoice:', {
                id: invoice.id,
                platformFee: invoice.platformFee.toString(),
                confirmationStatus: invoice.confirmationStatus,
                amount: invoice.amount.toString()
            });

            if (invoice.platformFee.toString() === '14.99') {
                console.log('✅ Default platformFee is correct.');
            } else {
                console.log('❌ Default platformFee is NOT 14.99');
            }

            if (invoice.confirmationStatus === 'Not Confirmed') {
                console.log('✅ Default confirmationStatus is correct.');
            } else {
                console.log('❌ Default confirmationStatus is NOT "Not Confirmed"');
            }
        } else {
            console.log('No invoices found to verify. Please create one.');
        }

        console.log('--- Verification Complete ---');
    } catch (err) {
        console.error('Verification Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
