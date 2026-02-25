const express = require('express');
const router = express.Router();
const ownerController = require('./owner.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

// Protect all owner routes
router.use(authenticate);
router.use(authorize('OWNER'));

// const financialController = require('./financial.controller'); removed

router.get('/dashboard/stats', ownerController.getOwnerDashboardStats);
router.get('/profile', ownerController.getProfile);
router.get('/notifications', ownerController.getNotifications);
router.get('/dashboard/financial-pulse', ownerController.getOwnerFinancialPulse);
router.get('/properties', ownerController.getOwnerProperties);
router.get('/financials', ownerController.getOwnerFinancials);
router.get('/reports', ownerController.getOwnerReports);
router.get('/reports/download', ownerController.downloadOwnerReport);
const invitationController = require('../tenant/tenant.invitation.controller');
router.get('/invitations/sent', invitationController.getSentInvitations);
router.get('/invitations/received', invitationController.getReceivedInvitations);
router.post('/invitations', invitationController.createInvitation);

router.post('/invitations/:id/respond', invitationController.respondToInvitation);

module.exports = router;
