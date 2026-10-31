ALTER TABLE counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'sales.read' FROM roles WHERE code NOT IN ('customer_portal','supplier_portal')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'sales.write' FROM roles WHERE code IN ('super_admin','agency_admin','sales_manager','sales_executive')
ON CONFLICT DO NOTHING;
