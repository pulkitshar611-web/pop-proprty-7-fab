const express = require("express");
const router = express.Router();
const tenantPortalController = require("./tenant.portal.controller");
const tenantLeaseController = require("./tenant.lease.controller");
const tenantDocumentController = require("./tenant.document.controller");
const tenantTicketController = require("./tenant.ticket.controller");
const tenantInvoiceController = require("./tenant.invoice.controller");
const tenantPaymentController = require("./tenant.payment.controller");
const tenantInsuranceController = require("./tenant.insurance.controller");
const upload = require("../../middlewares/upload.middleware");
const {
  authenticate,
  authorize,
  authenticateDownload
} = require("../../middlewares/auth.middleware");

// Public-ish routes (Protected by query token)
router.get("/documents/:id/download", authenticateDownload, tenantDocumentController.downloadDocument);

// Protect all tenant portal routes
router.use(authenticate);
router.use(authorize("TENANT"));

router.get("/dashboard", tenantPortalController.getDashboard);
router.get("/profile", tenantPortalController.getProfile);
router.get("/lease", tenantLeaseController.getLeaseDetails);
router.get("/documents", tenantDocumentController.getDocuments);
router.post("/documents", tenantDocumentController.uploadDocument); // Upload usually uses headers


router.get("/tickets", tenantTicketController.getTickets);
router.post("/tickets", tenantTicketController.createTicket);

const paymentConfigController = require("./payment.config.controller");

router.get("/invoices", tenantInvoiceController.getInvoices);
router.post("/invoices/mock", tenantInvoiceController.createMockInvoice); // Testing Route
router.get("/payment-config", paymentConfigController.getPaymentConfig);
router.post("/pay", tenantPaymentController.processPayment);

router.get("/insurance", tenantInsuranceController.getInsurance);
router.post("/insurance", upload.single('policy_document'), tenantInsuranceController.uploadInsurance);
router.get("/billing-details", tenantPortalController.getBillingDetails);
router.post("/billing-details", tenantPortalController.saveBillingDetails);

router.get("/notifications", tenantPortalController.getNotifications);

const walletController = require("./wallet.controller");
router.get("/wallet", walletController.getWallet);
router.post("/wallet/add-funds", walletController.addFunds);
router.post("/wallet/withdraw", walletController.withdraw);
router.post("/wallet/transfer", walletController.transfer);

const paymentMethodController = require("./paymentMethod.controller");
router.get("/payment-methods", paymentMethodController.getPaymentMethods);
router.post("/payment-methods", paymentMethodController.addPaymentMethod);
router.patch("/payment-methods/:id/default", paymentMethodController.setDefaultPaymentMethod);
router.delete("/payment-methods/:id", paymentMethodController.deletePaymentMethod);

module.exports = router;
