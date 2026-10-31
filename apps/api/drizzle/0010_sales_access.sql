ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'sales.approve' FROM roles WHERE code IN ('super_admin','agency_admin','sales_manager')
ON CONFLICT DO NOTHING;
