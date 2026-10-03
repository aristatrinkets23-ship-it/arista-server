import { Router } from 'express';
import { getProducts, getProductBySlug, getCategories } from '../controllers/product.controller';
import { registerUser, loginUser, getCurrentUser, forgotPassword, verifyOtp, resetPasswordWithOtp, updateUserProfile, changeUserPassword } from '../controllers/auth.controller';
import { createOrder, createPaymentOrder, verifyPayment, getOrderByNumber, trackOrder, getMyOrders, downloadInvoicePdf } from '../controllers/order.controller';
import { getPublicSettingsController, getAdminSettingsController, updateAdminSettingsController } from '../controllers/settings.controller';
import { getUserAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } from '../controllers/address.controller';
import {
  getAdminMetrics,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  updateCategory,
  deleteCategory,
  updateOrderStatus,
  updateOrderPaymentStatus,
  verifyAdmin,
  updateAdminProfile,
  createAdminUser,
  getAdminUsers,
  updateAdminUserPassword,
  deleteAdminUserById,
  getAdminOrders
} from '../controllers/admin.controller';
import { getHomepageConfig, updateHomepageConfig } from '../controllers/homepage.controller';
import { getWishlist, toggleWishlist, removeFromWishlist, clearWishlist } from '../controllers/wishlist.controller';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  mergeCart
} from '../controllers/cart.controller';
import { createEnquiry, getEnquiries } from '../controllers/enquiry.controller';
import { authenticateJwt, optionalAuthenticateJwt, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Arista Trinkets REST API',
    timestamp: new Date().toISOString()
  });
});

// Cart Routes (Hybrid Guest / Authenticated)
router.get('/cart', optionalAuthenticateJwt, getCart);
router.get('/cart/items', optionalAuthenticateJwt, getCart);
router.post('/cart/items', optionalAuthenticateJwt, addToCart);
router.post('/cart', optionalAuthenticateJwt, addToCart);
router.patch('/cart/items/:productId', optionalAuthenticateJwt, updateCartItem);
router.delete('/cart/items/:productId', optionalAuthenticateJwt, removeCartItem);
router.delete('/cart', optionalAuthenticateJwt, clearCart);
router.post('/cart/merge', authenticateJwt, mergeCart);

// Homepage Config Routes (Public)
router.get('/homepage-config', getHomepageConfig);


// Wishlist Routes (Public / Session / Auth)
router.get('/wishlist', getWishlist);
router.post('/wishlist/toggle', toggleWishlist);
router.delete('/wishlist/clear', clearWishlist);
router.delete('/wishlist/:idOrSlug', removeFromWishlist);

// Authentication Routes
router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/auth/me', getCurrentUser);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/reset-password-otp', resetPasswordWithOtp);
router.put('/auth/update-profile', optionalAuthenticateJwt, updateUserProfile);
router.put('/auth/change-password', optionalAuthenticateJwt, changeUserPassword);

// Saved Shipping Addresses Routes
router.get('/addresses', optionalAuthenticateJwt, getUserAddresses);
router.post('/addresses', optionalAuthenticateJwt, addAddress);
router.put('/addresses/:id', optionalAuthenticateJwt, updateAddress);
router.delete('/addresses/:id', optionalAuthenticateJwt, deleteAddress);
router.put('/addresses/:id/default', optionalAuthenticateJwt, setDefaultAddress);

// Catalog Routes
router.get('/products', getProducts);
router.get('/products/:slug', getProductBySlug);
router.get('/categories', getCategories);

// Store Settings Routes (Public)
router.get('/settings', getPublicSettingsController);

// Order & Payment Routes
router.post('/orders', createOrder);
router.post('/orders/razorpay-order', createPaymentOrder);
router.post('/orders/verify-payment', verifyPayment);
router.get('/orders/my-orders', optionalAuthenticateJwt, getMyOrders);
router.get('/orders/track/:trackingCode', trackOrder);     // Track by TRK- code
router.get('/orders/:orderNumber', getOrderByNumber);      // Lookup by ART- order number
router.get('/orders/:orderNumber/invoice-pdf', downloadInvoicePdf); // Download Tax Invoice PDF

// Admin Protection Middleware (Applied to all /admin routes)
const adminAuthStack = [authenticateJwt, requireRole(['ADMIN', 'SUPER_ADMIN'])];

// Admin Routes
router.get('/admin/verify', adminAuthStack, verifyAdmin);
router.get('/admin/dashboard', adminAuthStack, getAdminMetrics);
router.put('/admin/profile', adminAuthStack, updateAdminProfile);
router.get('/admin/users', adminAuthStack, getAdminUsers);
router.post('/admin/users', adminAuthStack, createAdminUser);
router.put('/admin/users/:id/password', adminAuthStack, updateAdminUserPassword);
router.delete('/admin/users/:id', adminAuthStack, deleteAdminUserById);

// Homepage Config Admin Routes
router.put('/admin/homepage-config', adminAuthStack, updateHomepageConfig);

// Store Settings Admin Routes
router.get('/admin/settings', adminAuthStack, getAdminSettingsController);
router.put('/admin/settings', adminAuthStack, updateAdminSettingsController);

// Product Admin Routes
router.post('/admin/products', adminAuthStack, createProduct);
router.put('/admin/products/:id', adminAuthStack, updateProduct);
router.delete('/admin/products/:id', adminAuthStack, deleteProduct);

// Category Admin Routes
router.post('/admin/categories', adminAuthStack, createCategory);
router.put('/admin/categories/:id', adminAuthStack, updateCategory);
router.delete('/admin/categories/:id', adminAuthStack, deleteCategory);

router.put('/admin/orders/:id/status', adminAuthStack, updateOrderStatus);
router.put('/admin/orders/:id/payment-status', adminAuthStack, updateOrderPaymentStatus);

// Admin Orders List (with filters)
router.get('/admin/orders', adminAuthStack, getAdminOrders);

// Customer Enquiry Routes
router.post('/enquiries', createEnquiry);
router.post('/contact', createEnquiry);
router.get('/admin/enquiries', adminAuthStack, getEnquiries);

export default router;

