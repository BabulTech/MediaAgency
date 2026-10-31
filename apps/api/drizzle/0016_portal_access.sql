INSERT INTO role_permissions (role_id, permission)
SELECT id, 'portal.customer' FROM roles WHERE code = 'customer_portal'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'portal.supplier' FROM roles WHERE code = 'supplier_portal'
ON CONFLICT DO NOTHING;
