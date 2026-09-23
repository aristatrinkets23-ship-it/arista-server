import { Router } from 'express';
import { getProducts, getProductBySlug, getCategories } from '../controllers/product.controller';
import { registerUser, loginUser, getCurrentUser } from '../controllers/auth.controller';
import { createOrder, createPaymentOrder, verifyPayment, getOrderByNumber } from '../controllers/order.controller';
import {
  getAdminMetrics,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  updateCategory,
  deleteCategory,
  updateOrderStatus,
  verifyAdmin,
  updateAdminProfile,
  createAdminUser,
  getAdminUsers,
  updateAdminUserPassword,
  deleteAdminUserById
} from '../controllers/admin.controller';
import { getHomepageConfig, updateHomepageConfig } from '../controllers/homepage.controller';
import { getWishlist, toggleWishlist, removeFromWishlist, clearWishlist } from '../controllers/wishlist.controller';
import { authenticateJwt, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Arista Trinkets REST API',
    timestamp: new Date().toISOString()
  });
});

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

// Catalog Routes
router.get('/products', getProducts);
router.get('/products/:slug', getProductBySlug);
router.get('/categories', getCategories);

// Order & Payment Routes
router.post('/orders', createOrder);
router.post('/orders/razorpay-order', createPaymentOrder);
router.post('/orders/verify-payment', verifyPayment);
router.get('/orders/:orderNumber', getOrderByNumber);

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

// Product Admin Routes
router.post('/admin/products', adminAuthStack, createProduct);
router.put('/admin/products/:id', adminAuthStack, updateProduct);
router.delete('/admin/products/:id', adminAuthStack, deleteProduct);

// Category Admin Routes
router.post('/admin/categories', adminAuthStack, createCategory);
router.put('/admin/categories/:id', adminAuthStack, updateCategory);
router.delete('/admin/categories/:id', adminAuthStack, deleteCategory);

router.put('/admin/orders/:id/status', adminAuthStack, updateOrderStatus);

export default router;
