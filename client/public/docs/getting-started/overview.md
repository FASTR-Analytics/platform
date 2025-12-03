# Overview

## What is the HMIS Application?

The Health Management Information System (HMIS) application is a web-based platform for analyzing and visualizing health data. It enables health workers, data analysts, and decision-makers to import health facility data, process it through analytical modules, and create visualizations and reports for insights and decision-making.

## Key Capabilities

### Data Management

- Import and manage health facility structure (administrative areas and facilities)
- Import HMIS (Health Management Information System) data
- Import HFA (Health Facility Assessment) data
- Manage indicators from multiple sources
- Track dataset versions over time

### Data Analysis

- Enable and configure analytical modules
- Process data using R-based analytical scripts
- Chain modules together for complex analyses
- Monitor processing status and logs

### Visualization

- Create charts, maps, and tables from processed data
- Filter and disaggregate data by multiple dimensions
- Customize appearance and styling
- Export visualizations as images or data files

### Reporting

- Combine multiple visualizations into reports
- Export reports as PowerPoint presentations or PDFs
- Organize and reorder report pages
- Share reports with stakeholders

### Collaboration

- Organize work into projects
- Assign users with different roles (viewer, editor, admin)
- Control access at the project level
- Lock projects to prevent changes

1.1 Creating a FASTR Analytics Platform Account

<iframe src="https://scribehow.com/embed/11_Creating_a_FASTR_Analytics_platform_account__9Av54dcqRTK1XkP1mYAc_g"  class="border border-base-300 rounded" width="800" height="800" allow="fullscreen" style="aspect-ratio: 1 / 1; min-height: 480px"></iframe>

2.1 Importing HMIS Data

<iframe src="https://scribehow.com/embed/21_Importing_HMIS_data__ENgZRKwwRymHNSdztYpEww"  class="border border-base-300 rounded" width="800" height="800" allow="fullscreen" style="aspect-ratio: 1 / 1; min-height: 480px"></iframe>

2.2 Using the DHIS2 Import Tool

<iframe src="https://scribehow.com/embed/22_Using_the_DHIS2_data_import_tool__EOmDapzARauI73WwArm2xw"  class="border border-base-300 rounded" width="800" height="800" allow="fullscreen" style="aspect-ratio: 1 / 1; min-height: 480px"></iframe>4.1 Understanding Modules

4.2 Running Modules

<iframe src="https://scribehow.com/embed/42_Running_modules__FgsGiCfpR_GOIymkKrRCEg"  class="border border-base-300 rounded" width="800" height="800" allow="fullscreen" style="aspect-ratio: 1 / 1; min-height: 480px"></iframe>

## Who Should Use This Application?

### Data Analysts

Analyze health data trends, create visualizations, and generate reports for decision-makers.

### Health Program Managers

Monitor program performance, track indicators, and share insights with teams.

### System Administrators

Set up the system, manage users, import data, and configure the platform for organizational needs.

## How the Application Works

### 1. Organization Level (Instance)

The instance is your organization's workspace containing:

- All users
- Shared structure (administrative areas and health facilities)
- Shared indicators
- Data sources (HMIS, HFA)
- All projects

### 2. Project Level

Projects provide focused analysis workspaces:

- Select which data to include (time periods, facilities, indicators)
- Enable analytical modules
- Create visualizations
- Build reports

### 3. Data Flow

```
Data Import → Module Processing → Visualizations → Reports
```

1. **Data Import**: Upload health facility data at the instance level
2. **Project Setup**: Create projects with specific data windows
3. **Module Processing**: Enable modules to process and analyze data
4. **Visualizations**: Create charts, maps, and tables from module outputs
5. **Reports**: Combine visualizations into exportable reports

## Supported Languages

The application supports:

- English
- French

Language settings can be configured at the instance level.

## Browser Requirements

The application works best in modern web browsers:

- Chrome (recommended)
- Firefox
- Safari
- Edge

Ensure JavaScript is enabled for full functionality.

## Next Steps

- [Basic Concepts](./basic-concepts.md) - Understand key terminology and concepts
- [First Steps](./first-steps.md) - Get started with your first project
