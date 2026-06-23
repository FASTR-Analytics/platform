---
system: 11
name: Visualization Authoring UI
globs:
  - client/src/components/NotAvailableBox.tsx
  - client/src/components/PresentationObjectMiniDisplay.tsx
  - client/src/components/PresentationObjectPanelDisplay.tsx
  - client/src/components/ReplicateByOptions.tsx
  - client/src/components/_editor_snapshot.ts
  - client/src/components/forms_editors/confirm_update.tsx
  - client/src/components/forms_editors/conflict_resolution_modal.tsx
  - client/src/components/forms_editors/custom_series_styles.tsx
  - client/src/components/forms_editors/download_presentation_object.tsx
  - client/src/components/forms_editors/view_results_object.tsx
  - client/src/components/project/add_visualization/index.tsx
  - client/src/components/project/add_visualization/metric_card.tsx
  - client/src/components/project/add_visualization/module_sidebar.tsx
  - client/src/components/project/add_visualization/step_1_metric.tsx
  - client/src/components/project/add_visualization/step_2_preset.tsx
  - client/src/components/project/add_visualization/step_3_configure.tsx
  - client/src/components/project/add_visualization/type_card.tsx
  - client/src/components/project/edit_folder_modal.tsx
  - client/src/components/project/move_to_folder_modal.tsx
  - client/src/components/project/preset_preview.tsx
  - client/src/components/project/project_metrics.tsx
  - client/src/components/project/project_visualizations.tsx
  - client/src/components/visualization/**
  - client/src/state/instance/_util_disaggregation_label.ts
  - lib/convert_visualization_type.ts
  - lib/disaggregation_labels.ts
  - lib/format_nigeria_admin_label.ts
  - lib/get_disaggregator_display_prop.ts
  - lib/group_metrics.ts
  - lib/legacy_cf_presets.ts
  - lib/normalize_po_config.ts
  - lib/types/_metric_installed.ts
  - lib/types/_presentation_object_config.ts
  - lib/types/conditional_formatting.ts
  - lib/types/conditional_formatting_standalone.ts
  - lib/types/dimension_definitions.ts
  - lib/types/disaggregation_options.ts
  - lib/types/presentation_object_defaults.ts
  - lib/types/presentation_objects.ts
  - lib/types/visualization_folders.ts
  - server/db/project/presentation_objects.ts
  - server/db/project/visualization_folders.ts
  - server/routes/project/visualization_folders.ts
docs_absorbed:
---
# S11 — Visualization Authoring UI

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S11).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the live PO editor (edit/create/ephemeral modes), the visualization library, and PO CRUD with conflict resolution_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S11).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §7.2 dead code);
> plus whatever this system's review cycle adds.

- **Dead code (zero importers):** `client/src/components/forms_editors/confirm_update.tsx`;
  `lib/types/dimension_definitions.ts`.
