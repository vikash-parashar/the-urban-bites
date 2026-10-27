-- The owner can say a UPI payment did not arrive. The customer's reference is moved here so the
-- tracker can tell them to check it, and the order goes back to "payment pending".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_rejected_ref text;
