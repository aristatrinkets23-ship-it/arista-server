import { Router } from 'express';
import { getProducts, getProductBySlug, getCategories } from '../controllers/product.controller';
import { registerUser, loginUser, getCurrentUser } from '../controllers/auth.controller';
import { createOrder, createPaymentOrder, verifyPayment, getOrderByNumber } from '../controllers/order.controller';
import { getAdminMetrics, createProduct, updateProduct, deleteProduct, updateOrderStatus } from '../controllers/admin.controller';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Arista Trinkets REST API',
    timestamp: new Date().toISOString()
  });
});

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

// Admin Routes
router.get('/admin/dashboard', getAdminMetrics);
router.post('/admin/products', createProduct);
router.put('/admin/products/:id', updateProduct);
router.delete('/admin/products/:id', deleteProduct);
router.put('/admin/orders/:id/status', updateOrderStatus);

export default router;
