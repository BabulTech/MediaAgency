INSERT INTO role_permissions (role_id, permission)
SELECT id, 'sales.all' FROM roles WHERE code NOT IN ('sales_executive','customer_portal','supplier_portal')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'cost.read' FROM roles WHERE code IN ('super_admin','agency_admin','director','sales_manager','booking_manager','finance_manager','accountant')
ON CONFLICT DO NOTHING;
