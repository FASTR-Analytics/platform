/**
 * DHIS2 API Integration Module
 * 
 * This module provides functions for interacting with DHIS2 instances
 * organized by three main goals:
 * 
 * GOAL 1: Organization Units (Health Facilities)
 * - Fetch facility lists and hierarchy
 * - Import into internal structure
 * 
 * GOAL 2: Indicators and Data Elements  
 * - Discover available indicators
 * - Map to internal indicators
 * 
 * GOAL 3: Analytics Data
 * - Query data for facilities, indicators, and time periods
 * - Batch processing for large datasets
 */

// Common utilities
export * from "./common/mod.ts";

// GOAL 1: Organization Units
export * from "./goal1_org_units_v2/mod.ts";

// GOAL 2: Indicators (placeholder - to be implemented)
export * from "./goal2_indicators/mod.ts";

// GOAL 3: Analytics Data
export * from "./goal3_analytics/mod.ts";