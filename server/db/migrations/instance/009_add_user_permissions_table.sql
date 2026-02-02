-- Add user_permissions table for managing user access controls

CREATE TABLE user_permissions (
  user_email text PRIMARY KEY NOT NULL,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_view_users boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  can_configure_instance boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_create_projects boolean NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);
