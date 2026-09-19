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
  `product_id` INT NOT NULL,
  `metal_type` VARCHAR(100) DEFAULT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  INDEX `idx_cart_user` (`user_id`),
  INDEX `idx_cart_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. ORDERS TABLE
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(50) NOT NULL UNIQUE,
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

-- ============================================================================
-- SEED DATA SETUP
-- ============================================================================

INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image`, `item_count`) VALUES
(1, 'Rings', 'rings', 'Handcrafted solitaire, halo, and eternity rings set in 18K gold.', '/assets/images/placeholder-rings.svg', 42),
(2, 'Necklaces', 'necklaces', 'Elegant chokers, pendants, and layered chains designed to accentuate necklines.', '/assets/images/placeholder-necklaces.svg', 36),
(3, 'Earrings', 'earrings', 'Luminous freshwater pearl drop earrings, diamond studs, and gold hoops.', '/assets/images/placeholder-earrings.svg', 28),
(4, 'Bracelets', 'bracelets', 'Timeless diamond cuff bracelets, delicate tennis chains, and bangles.', '/assets/images/placeholder-bracelets.svg', 24)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `products` (`id`, `category_id`, `name`, `slug`, `price`, `compare_at_price`, `badge`, `metal_type`, `gemstone`, `in_stock`, `stock_quantity`, `description`, `materials`, `care_guide`, `shipping_info`, `image`) VALUES
(1, 1, 'Eternal Solitaire Diamond Ring', 'eternal-solitaire-diamond-ring', 45000.00, 52000.00, 'FEATURED', '18K Warm Gold', 'Diamond (1.2 ct)', 1, 12, 'A brilliant 1.2-carat ethically sourced round solitaire diamond crowned upon an 18K warm gold band with delicate diamond micro-pave detailing.', '18K Warm Gold, Ethically Sourced Diamond', 'Clean gently with lukewarm soapy water and a soft microfiber cloth.', 'Complimentary insured express delivery within 3-5 business days.', '/assets/images/placeholder-rings.svg'),
(2, 2, 'Royal Heritage Gold Choker', 'royal-heritage-gold-choker', 89000.00, 95000.00, 'NEW', '18K Solid Gold', 'None', 1, 6, 'Inspired by classical royal heritage, this hand-engraved 18K solid gold choker features intricate filigree craftsmanship.', '18K Warm Gold, Filigree Wire Work', 'Avoid contact with perfumes and harsh household chemicals.', 'Complimentary insured express delivery.', '/assets/images/placeholder-necklaces.svg'),
(3, 3, 'Celestial Pearl Drop Earrings', 'celestial-pearl-drop-earrings', 24500.00, 28000.00, 'SALE', 'Sterling Silver', 'Freshwater Pearl & Diamond', 1, 15, 'Luminous Grade-AAA Japanese Akoya freshwater pearls suspended beneath sparkling star-set brilliant diamond studs.', 'Grade AAA Akoya Pearl, Sterling Silver 925', 'Pearls love natural oils. Put on after cosmetics application.', 'Complimentary insured express delivery.', '/assets/images/placeholder-earrings.svg'),
(4, 4, 'Classic Diamond Cuff Bracelet', 'classic-diamond-cuff-bracelet', 62000.00, 68000.00, 'BESTSELLER', '18K Warm Gold', 'Diamond (0.45 ct)', 1, 8, 'A sleek open-cuff bracelet featuring twin brilliant diamond solitaire terminals set in warm gold with high polish finish.', '18K Warm Gold, Brilliant Diamonds', 'Wipe down gently after wearing with included polishing cloth.', 'Complimentary insured express delivery.', '/assets/images/placeholder-bracelets.svg')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
