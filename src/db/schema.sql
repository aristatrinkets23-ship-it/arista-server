-- ============================================================================
-- ARISTA TRINKETS JEWELLERY — MYSQL 8+ PRODUCTION SCHEMA
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `arista_trinkets_db` 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `arista_trinkets_db`;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `role` ENUM('CUSTOMER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_email` (`email`),
  INDEX `idx_user_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DEFAULT SUPER ADMIN CREDENTIALS (Email: admin@aristatrinkets.com / Password: admin123)
INSERT IGNORE INTO `users` (`id`, `name`, `email`, `password`, `role`) VALUES
(1, 'Arista Atelier Administrator', 'admin@aristatrinkets.com', '$2b$10$Ma0BxZV/lLcKHz3CUsIiB.7CslblkKouOTu6jyMJQ8k0PINhw1i9O', 'SUPER_ADMIN');

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT DEFAULT NULL,
  `image` VARCHAR(255) DEFAULT NULL,
  `item_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_category_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) NOT NULL UNIQUE,
  `price` DECIMAL(10, 2) NOT NULL,
  `compare_at_price` DECIMAL(10, 2) DEFAULT NULL,
  `badge` VARCHAR(50) DEFAULT NULL,
  `metal_type` VARCHAR(100) DEFAULT NULL,
  `gemstone` VARCHAR(100) DEFAULT NULL,
  `in_stock` BOOLEAN NOT NULL DEFAULT TRUE,
  `stock_quantity` INT NOT NULL DEFAULT 10,
  `description` TEXT DEFAULT NULL,
  `materials` TEXT DEFAULT NULL,
  `care_guide` TEXT DEFAULT NULL,
  `shipping_info` TEXT DEFAULT NULL,
  `image` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  INDEX `idx_product_slug` (`slug`),
  INDEX `idx_product_price` (`price`),
  INDEX `idx_product_stock` (`in_stock`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. PRODUCT IMAGES TABLE
CREATE TABLE IF NOT EXISTS `product_images` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `sort_order` INT DEFAULT 0,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. PRODUCT SPECIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS `product_specifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `spec_label` VARCHAR(100) NOT NULL,
  `spec_value` VARCHAR(255) NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. CARTS TABLE
CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `session_id` VARCHAR(100) DEFAULT NULL,
  `product_id` INT DEFAULT NULL,
  `slug` VARCHAR(150) DEFAULT NULL,
  `product_data` JSON DEFAULT NULL,
  `metal_type` VARCHAR(100) DEFAULT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  INDEX `idx_cart_user` (`user_id`),
  INDEX `idx_cart_session` (`session_id`),
  INDEX `idx_cart_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 7. ORDERS TABLE
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(50) NOT NULL UNIQUE,
  `tracking_code` VARCHAR(20) UNIQUE DEFAULT NULL,
  `user_id` INT DEFAULT NULL,
  `customer_name` VARCHAR(100) NOT NULL,
  `customer_email` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `shipping_address` TEXT NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `pincode` VARCHAR(20) NOT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL,
  `shipping_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `payment_method` ENUM('RAZORPAY', 'UPI', 'CARD', 'NETBANKING', 'COD') NOT NULL DEFAULT 'RAZORPAY',
  `payment_status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  `razorpay_order_id` VARCHAR(100) DEFAULT NULL,
  `razorpay_payment_id` VARCHAR(100) DEFAULT NULL,
  `order_status` ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_order_number` (`order_number`),
  INDEX `idx_tracking_code` (`tracking_code`),
  INDEX `idx_order_status` (`order_status`),
  INDEX `idx_order_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `product_id` INT DEFAULT NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `metal_type` VARCHAR(100) DEFAULT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `total_price` DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. HOMEPAGE CONFIG TABLE
CREATE TABLE IF NOT EXISTS `homepage_config` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `section_key` VARCHAR(100) NOT NULL UNIQUE,
  `section_label` VARCHAR(150) NOT NULL,
  `image` LONGTEXT DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `homepage_config` (`section_key`, `section_label`, `image`) VALUES
('editorial_photo', 'Artisanal Excellence Photo', '/assets/images/editorial-artisanal-craft.jpg');

-- 10. WISHLIST ITEMS TABLE
CREATE TABLE IF NOT EXISTS `wishlist_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `session_id` VARCHAR(100) DEFAULT NULL,
  `product_id` INT DEFAULT NULL,
  `slug` VARCHAR(150) NOT NULL,
  `product_data` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_wishlist_user` (`user_id`),
  INDEX `idx_wishlist_session` (`session_id`),
  INDEX `idx_wishlist_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. ENQUIRIES TABLE
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `subject` VARCHAR(200) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_enquiries_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;




