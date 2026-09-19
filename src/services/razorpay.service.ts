import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

// Razorpay Instance Initialization
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_AristaTrinkets2026';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'AristaTrinketsSecret2026Key';

export const razorpayInstance = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret
});

export interface CreateOrderParams {
  amountInINR: number;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  keyId: string;
}

/**
 * Creates a Razorpay Order
 */
export const createRazorpayOrder = async (
  params: CreateOrderParams
): Promise<RazorpayOrderResponse> => {
  try {
    const amountInPaise = Math.round(params.amountInINR * 100);
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes || {}
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    logger.info(`Razorpay order created successfully: ${razorpayOrder.id} for receipt ${params.receipt}`);

    return {
      ...razorpayOrder,
      keyId: razorpayKeyId
    } as RazorpayOrderResponse;
  } catch (err: any) {
    logger.error(`Failed to create Razorpay order: ${err.message}`);
    throw new Error(`Razorpay Order Creation Failed: ${err.message}`);
  }
};

/**
 * Verifies Razorpay HMAC SHA256 Payment Signature
 */
export const verifyRazorpayPaymentSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean => {
  try {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(body.toString())
      .digest('hex');

    const isValid = expectedSignature === razorpaySignature;
    if (isValid) {
      logger.info(`Razorpay signature verification SUCCESS for payment ID ${razorpayPaymentId}`);
    } else {
      logger.warn(`Razorpay signature verification FAILED for payment ID ${razorpayPaymentId}`);
    }

    return isValid;
  } catch (err: any) {
    logger.error(`Error verifying Razorpay signature: ${err.message}`);
    return false;
  }
};
