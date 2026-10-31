INSERT INTO role_permissions (role_id, permission)
SELECT id, 'ratecards.write' FROM roles WHERE code IN ('super_admin','agency_admin','booking_manager')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'ratecards.approve' FROM roles WHERE code IN ('super_admin','agency_admin')
ON CONFLICT DO NOTHING;
