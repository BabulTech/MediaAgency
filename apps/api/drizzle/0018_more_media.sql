INSERT INTO media_categories (tenant_id, code, name)
SELECT t.id, c.code, c.name FROM tenants t CROSS JOIN (VALUES ('radio','Radio Stations'),('digital','Digital News Websites'),('social','Social Media Advertising'),('outdoor','Outdoor Advertising')) AS c(code, name)
ON CONFLICT DO NOTHING;
