# Glossary

## A

### Admin Area
A geographic or administrative boundary level in the hierarchical structure. Typically organized in levels (Admin Area 1 = largest, Admin Area 4 = smallest). Examples: provinces, districts, communes.

### AI Interpretation
An optional feature that uses artificial intelligence to analyze visualizations and generate insights about patterns, trends, or anomalies in the data.

## D

### Dataset
A collection of health data, either HMIS (routine health services) or HFA (facility assessments). Datasets are versioned, with each import creating a new version.

### Dataset Version
A snapshot of a dataset at a specific point in time. Each data import creates a new version, allowing historical tracking.

### DHIS2
District Health Information Software 2 - an external health information system that can be integrated to import indicators.

### Disaggregation
Breaking down data by dimensions (e.g., time period, geographic area, facility type) to reveal patterns and trends.

## H

### Health Facility
A healthcare service delivery point (hospital, health center, clinic, dispensary, etc.) linked to an administrative area in the structure.

### HFA
Health Facility Assessment - data about facility characteristics, infrastructure, staffing, equipment, and service capacity.

### HMIS
Health Management Information System - routine health service statistics reported regularly (typically monthly) by health facilities.

## I

### Indicator
A measurable health metric (e.g., "Number of ANC visits", "Vaccination coverage rate"). Can be common indicators (defined in the instance) or DHIS2 indicators (imported from external systems).

### Instance
The top-level organizational workspace containing all users, structure, data sources, and projects for an organization.

## M

### Module
A data processing unit that executes R analytical scripts to transform and analyze data. Modules produce results objects used by visualizations.

### Module Definition
The template or blueprint for a module type, defining what it does, what inputs it needs, and what outputs it produces.

### Module Instance
A module that has been enabled and configured in a specific project. One module definition can be installed in multiple projects with different configurations.

### Module Prerequisites
Other modules that must be enabled and ready before a module can run. Ensures dependencies are met.

## P

### Presentation Object
See **Visualization**.

### Project
A focused analysis workspace within an instance. Projects have specific data windows, enabled modules, visualizations, reports, and assigned users.

## R

### Report
A collection of visualization pages designed for export as PowerPoint or PDF documents.

### Report Item
A single page in a report containing a visualization.

### Results Object
An output file (typically CSV) produced by a module's execution, containing processed data used for visualizations.

### Replication
Creating multiple instances of a visualization automatically, each showing data for different values of a dimension (e.g., one chart per district).

## S

### Structure
The hierarchical organization of administrative areas and health facilities that defines the geographic framework for data.

## V

### Visualization
A visual representation of data as a chart, map, or table. Also called a **Presentation Object**. Created from module outputs and can be included in reports.

## W

### Windowing
Selecting a subset of instance data for a project by filtering by time period, geographic area, indicators, or facility characteristics. Allows projects to focus on relevant data.

## User Roles

### Editor (Project Role)
A user who can create and modify visualizations and reports within a project, but cannot change project settings or modules.

### Global Admin
A user with full access to all instance settings, all projects, and all administrative functions.

### Project Admin
A user who can modify project settings, enable/disable modules, configure data, and manage project users.

### Viewer (Project Role)
A user who can view project contents (visualizations and reports) but cannot make any modifications.

## Technical Terms

### CSV
Comma-Separated Values - a file format used for data import and export.

### Docker Container
An isolated environment where module R scripts execute safely without affecting other parts of the system.

### IndexedDB
Browser-based storage used for caching data locally to improve performance.

### R Script
Analytical code written in the R programming language that modules execute to process data.
