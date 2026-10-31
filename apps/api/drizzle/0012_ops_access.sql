ALTER TABLE supplier_bookings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE execution_proofs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'ops.read' FROM roles WHERE code NOT IN ('customer_portal','supplier_portal')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'ops.write' FROM roles WHERE code IN ('super_admin','agency_admin','booking_manager','newspaper_booking','broadcast_booking','creative_manager','operations')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'ops.verify' FROM roles WHERE code IN ('super_admin','agency_admin','booking_manager','creative_manager','operations')
ON CONFLICT DO NOTHING;
