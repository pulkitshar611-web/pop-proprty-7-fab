const prisma = require('../../config/prisma');

// POST /api/tenant/invitations
exports.createInvitation = async (req, res) => {
    try {
        const { email, type } = req.body;
        const userId = req.user.id;

        if (!email || !type) {
            return res.status(400).json({ message: 'Email and type are required' });
        }

        // Map frontend type to database Role enum if needed
        let role = 'TENANT';
        if (type.toLowerCase() === 'landlord') role = 'OWNER';
        if (type.toLowerCase() === 'tenant') role = 'TENANT';

        // Check if invitation already exists
        const existingInvite = await prisma.invitation.findFirst({
            where: {
                email,
                role,
                status: 'Pending'
            }
        });

        if (existingInvite) {
            return res.status(409).json({ message: 'Invitation already pending for this email' });
        }

        const token = Math.random().toString(36).substring(7); // Simple token for now

        const invitation = await prisma.invitation.create({
            data: {
                email,
                role,
                token,
                status: 'Pending',
                invitedBy: userId
            }
        });

        res.status(201).json({
            id: invitation.id,
            email: invitation.email,
            type: invitation.role === 'OWNER' ? 'Landlord' : 'Tenant',
            status: invitation.status,
            date: invitation.createdAt.toISOString().split('T')[0]
        });

    } catch (error) {
        console.error('Create Invitation Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/tenant/invitations/sent
exports.getSentInvitations = async (req, res) => {
    try {
        const userId = req.user.id;
        const invitations = await prisma.invitation.findMany({
            where: { invitedBy: userId },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = invitations.map(inv => ({
            id: inv.id,
            email: inv.email,
            type: inv.role === 'OWNER' ? 'Landlord' : 'Tenant',
            status: inv.status,
            date: inv.createdAt.toISOString().split('T')[0]
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Get Sent Invitations Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/tenant/invitations/received
// This is for checking invitations received by the current user's email
exports.getReceivedInvitations = async (req, res) => {
    try {
        const userEmail = req.user.email;
        const invitations = await prisma.invitation.findMany({
            where: { email: userEmail },
            orderBy: { createdAt: 'desc' },
            include: {
                inviter: {
                    select: { name: true, email: true, role: true }
                }
            }
        });

        const formatted = invitations.map(inv => ({
            id: inv.id,
            email: inv.inviter.email, // Show who invited them
            inviterName: inv.inviter.name,
            role: inv.role, // The role they are invited as
            status: inv.status,
            date: inv.createdAt.toISOString().split('T')[0]
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Get Received Invitations Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/tenant/invitations/:id/respond
exports.respondToInvitation = async (req, res) => {
    try {
        const { status } = req.body; // 'Accepted' or 'Rejected'
        const invitationId = parseInt(req.params.id);
        const userEmail = req.user.email;

        if (!['Accepted', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const invitation = await prisma.invitation.findUnique({
            where: { id: invitationId }
        });

        if (!invitation) {
            return res.status(404).json({ message: 'Invitation not found' });
        }

        if (invitation.email !== userEmail) {
            return res.status(403).json({ message: 'Not authorized to respond to this invitation' });
        }

        const updated = await prisma.invitation.update({
            where: { id: invitationId },
            data: { status }
        });

        res.json(updated);

    } catch (error) {
        console.error('Respond Invitation Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/tenant/invitations/page-data
exports.getInvitationPageData = async (req, res) => {
    try {
        // Fetch specific system settings or default
        const titleSetting = await prisma.systemsetting.findUnique({ where: { key: 'INVITE_SECTION_TITLE' } });
        const descSetting = await prisma.systemsetting.findUnique({ where: { key: 'INVITE_SECTION_DESC' } });

        res.json({
            title: titleSetting ? titleSetting.value : '',
            description: descSetting ? descSetting.value : '',
            avatars: [] // Send empty array instead of random users to avoid confusion
        });

    } catch (error) {
        console.error('Get Invitation Page Data Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createInvitation: exports.createInvitation,
    getSentInvitations: exports.getSentInvitations,
    getReceivedInvitations: exports.getReceivedInvitations,
    respondToInvitation: exports.respondToInvitation,
    getInvitationPageData: exports.getInvitationPageData
};
