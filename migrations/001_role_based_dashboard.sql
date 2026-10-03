-- Ravanyar role-based dashboard migration
-- Existing employee accounts are migrated to the personal dashboard.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role='personal' WHERE role='employee';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('personal','employee','professional','clinic','school','admin'));
