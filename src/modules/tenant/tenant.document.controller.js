const prisma = require('../../config/prisma');
const path = require('path');
const fs = require('fs');

// GET /api/tenant/documents
exports.getDocuments = async (req, res) => {
    try {
        const userId = req.user.id;
        const documents = await prisma.document.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        // Extract token to append for secure viewing
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : '';

        const formatted = documents.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type,
            // Construct a secure URL pointing to our backend endpoint
            fileUrl: `/api/tenant/documents/${d.id}/download?token=${token}`,
            date: d.createdAt.toISOString().split('T')[0]
        }));

        res.json(formatted);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/tenant/documents
exports.uploadDocument = async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendlyName, documentType } = req.body; // Expecting docName and docType from frontend formData? 
        // Frontend "name" attribute in inputs: "docName" and "docType". 
        // So req.body will have docName and docType.

        let nameToSave = friendlyName;
        let typeToSave = documentType;

        if (req.body.docName) nameToSave = req.body.docName;
        if (req.body.docType) typeToSave = req.body.docType;

        if (!req.files || !req.files.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const file = req.files.file; // 'file' is the key we expect from frontend
        // Sanitize name
        const cleanName = path.parse(file.name).name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const ext = path.extname(file.name);
        const fileName = `${Date.now()}_${cleanName}${ext}`;

        const uploadPath = path.join(process.cwd(), 'uploads', fileName);

        // Ensure uploads directory exists
        const uploadDir = path.dirname(uploadPath);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Move file
        await file.mv(uploadPath);

        const storedPath = `uploads/${fileName}`;

        const newDoc = await prisma.document.create({
            data: {
                userId,
                name: nameToSave || file.name,
                type: typeToSave || 'Other',
                fileUrl: storedPath, // Storing physical path relative to cwd
                expiryDate: null
            }
        });

        // Response format
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : '';

        res.status(201).json({
            id: newDoc.id,
            name: newDoc.name,
            type: newDoc.type,
            fileUrl: `/api/tenant/documents/${newDoc.id}/download?token=${token}`,
            date: newDoc.createdAt.toISOString().split('T')[0]
        });

    } catch (e) {
        console.error('Document Upload Error:', e);
        res.status(500).json({ message: 'Error uploading document' });
    }
};

// GET /api/tenant/documents/:id/download
exports.downloadDocument = async (req, res) => {
    try {
        const userId = req.user.id; // From authenticateDownload
        const docId = parseInt(req.params.id);

        const doc = await prisma.document.findUnique({
            where: { id: docId }
        });

        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Authorization check: User must own the document
        if (doc.userId !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Resolve absolute path
        // doc.fileUrl stored 'uploads/filename'
        const filePath = path.join(process.cwd(), doc.fileUrl);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        // Send file with Content-Disposition: inline to allow viewing in browser
        // Frontend uses standard link for download, but window.open for view.
        // 'inline' attempts to show in browser.
        res.sendFile(filePath);

    } catch (e) {
        console.error('Download Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};
