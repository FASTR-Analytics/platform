-- Rename the misspelled column can_configure_visulizations to can_configure_visualizations
ALTER TABLE project_user_roles
  RENAME COLUMN can_configure_visulizations TO can_configure_visualizations;
