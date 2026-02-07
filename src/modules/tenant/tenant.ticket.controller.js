const prisma = require('../../config/prisma');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// GET /api/tenant/tickets
exports.getTickets = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user.id;

        // Fetch tickets without unsupported includes
        const tickets = await prisma.ticket.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch active lease to provide property/unit context
        const activeLease = await prisma.lease.findFirst({
            where: {
                tenantId: userId,
                status: 'Active'
            },
            include: { unit: { include: { property: true } } }
        });

        const propertyName = activeLease?.unit?.property?.name || 'N/A';
        const unitName = activeLease?.unit?.name || 'N/A';

        const formatted = tickets.map(t => ({
            id: t.id,
            ticketId: `T-${t.id + 1000}`,
            subject: t.subject,
            category: 'Maintenance',
            priority: t.priority,
            status: t.status,
            description: t.description,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            property: propertyName,
            unit: unitName,
            attachmentUrls: t.attachmentUrls ? JSON.parse(t.attachmentUrls) : []
        }));

        res.json(formatted);
    } catch (e) {
        console.error('Get Tenant Tickets Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createTicket = async (req, res) => {
    try {
        console.log("--- DEBUG TICKET CREATION START ---");
        // DIAGNOSTIC LOGS
        console.log("User:", req.user);
        console.log("Body:", req.body);

        // STEP 1: Authentication Guard
        if (!req.user || !req.user.id) {
            console.error('CreateTicket Failed: Missing req.user.id');
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }
        const userId = parseInt(req.user.id);
        if (isNaN(userId)) {
            console.error('CreateTicket Failed: Invalid user ID format:', req.user.id);
            return res.status(401).json({ status: 'error', message: 'Invalid User ID' });
        }

        // STEP 5: Input Validation (STRICT)
        const { subject, description, priority } = req.body;
        if (!subject || !priority) {
            console.warn('CreateTicket Failed: Missing required fields');
            return res.status(400).json({ status: 'error', message: 'Subject and Priority are required' });
        }

        // STEP 3: Resolve unit_id SAFELY
        const activeLease = await prisma.lease.findFirst({
            where: {
                tenantId: userId,
                status: 'Active'
            },
            include: { unit: true }
        });

        if (!activeLease) {
            console.warn(`CreateTicket Failed: No active lease found for user ${userId}`);
            return res.status(400).json({ status: 'error', message: 'You do not have an active lease. Cannot create ticket.' });
        }

        const propertyId = activeLease.unit?.propertyId;
        const unitId = activeLease.unitId;

        if (!unitId) {
            console.error(`CreateTicket Failed: Active lease ${activeLease.id} has no unitId`);
            return res.status(500).json({ status: 'error', message: 'Lease data is corrupt. Contact support.' });
        }

        // STEP 4: Multipart File Handling (express-fileupload)
        let attachmentUrls = [];
        // req.files is the object. 'files' is the key sent by frontend FormData.
        if (req.files && req.files.files) {
            try {
                // Normalize to array (express-fileupload returns object if single file)
                const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
                console.log(`Processing ${files.length} files...`);

                for (const file of files) {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                    // file.name is the original name in express-fileupload
                    const ext = path.extname(file.name);
                    const filename = uniqueSuffix + ext;
                    const filepath = path.join(uploadDir, filename);

                    await file.mv(filepath);
                    attachmentUrls.push(`/uploads/${filename}`);
                }
            } catch (fileErr) {
                console.error('File upload processing error:', fileErr);
                // Continue without files if mapping fails
            }
        }

        // STEP 6: Database Insert (SAFE)
        const newTicket = await prisma.ticket.create({
            data: {
                userId: userId,
                subject: subject,
                description: description || '',
                priority: priority,
                status: 'Open',
                propertyId: propertyId ? propertyId : undefined,
                unitId: unitId,
                attachmentUrls: attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : null
            }
        });

        console.log("Ticket created successfully:", newTicket.id);
        return res.status(201).json(newTicket);

    } catch (e) {
        console.error('CRITICAL TICKET CREATION ERROR:', e);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error. Please try again later.' });
    }
};
