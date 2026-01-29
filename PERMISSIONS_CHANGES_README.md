# Permissions System Changes

## Overview

This document describes the changes made to implement a granular permissions system for project users, replacing the deprecated `role` field (`editor`/`viewer`).

## Changes Made

### 1. Database Type Updates

**File:** `server/db/instance/_main_database_types.ts`

Added permission fields to `DBProjectUserRole` type:
- `can_configure_settings`
- `can_create_backups`
- `can_restore_backups`
- `can_configure_modules`
- `can_run_modules`
- `can_configure_users`
- `can_configure_visulizations`
- `can_configure_reports`
- `can_configure_data`
- `can_view_data`
- `can_view_logs`

### 2. Shared Type Updates

**File:** `lib/types/instance.ts`

- `ProjectUser` type already had the permission fields defined
- Updated `createDevProjectUser()` to include all permissions set to `true` for development/bypass auth mode

### 3. Authentication Middleware Updates

**File:** `server/project_auth.ts`

Updated `getProjectUser()` function to:
- Return all permission fields from the database for non-admin users
- Set all permissions to `true` for global admin users and open access mode
- The `role` field is marked as deprecated with a comment

### 4. Project Creation Updates

**File:** `server/db/project/projects.ts`

#### `addProject()`
- INSERT statements now include all permission columns
- New users (project creator, editors, viewers) get all permissions set to `true` by default

#### `updateProjectUserPermissions()`
- Changed from UPDATE to INSERT ... ON CONFLICT DO UPDATE (upsert)
- Creates a new `project_user_roles` row if one doesn't exist for the user
- Updates permissions if the row already exists

#### `copyProject()`
- Copies all permission values from the source project for all users
- Removed the separate insert for the current user - now copies their permissions too

## How Permissions Work

1. **Global admins** (`is_admin = true` in `users` table) automatically get all permissions set to `true` regardless of what's in `project_user_roles`

2. **Non-admin users** get permissions from their `project_user_roles` entry for the specific project

3. **New users** added to a project via `addProject()` get all permissions set to `true` by default

4. **Copied projects** preserve the same permissions that users had in the source project

5. **Permission updates** via the UI create a `project_user_roles` row if one doesn't exist (upsert behavior)

## Route Protection

Routes use `requireProjectPermission()` middleware to check specific permissions:

```typescript
// Example: requires can_view_logs permission
defineRoute(
  routesProject,
  "getProjectLogs",
  requireProjectPermission(false, "can_view_logs"),
  // ...
);
```

## Deprecation Notes

The `role` field (`editor`/`viewer`) is deprecated and will be removed in a future update. The permission booleans are now the source of truth for access control.

Functions marked for deprecation:
- `updateProjectUserRole()` - use `updateProjectUserPermissions()` instead
