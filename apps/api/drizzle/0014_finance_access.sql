ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_invoice_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_credit_notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_payment_allocations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE supplier_bills ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE supplier_bill_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'finance.read' FROM roles WHERE code IN ('super_admin','agency_admin','director','finance_manager','accountant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'finance.write' FROM roles WHERE code IN ('super_admin','agency_admin','finance_manager','accountant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'finance.approve' FROM roles WHERE code IN ('super_admin','agency_admin','finance_manager')
ON CONFLICT DO NOTHING;
