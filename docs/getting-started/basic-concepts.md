# Basic Concepts

Understanding these core concepts will help you use the HMIS application effectively.

## Instance

An **instance** is your organization's workspace. It contains:
- All users
- Shared administrative structure
- Data sources
- All projects

Think of it as the top-level container for everything in the system.

## Projects

A **project** is a focused analysis workspace within an instance. Projects allow you to:
- Work with specific subsets of data (time periods, facilities, indicators)
- Enable analytical modules
- Create visualizations
- Generate reports
- Collaborate with specific team members

Multiple projects can exist in one instance, each with different data scopes and users.

## Structure

The **structure** defines the hierarchical organization of administrative areas and health facilities.

### Admin Areas
Administrative boundaries organized in levels:
- **Admin Area 1**: Largest geographic unit (e.g., provinces, regions)
- **Admin Area 2**: Mid-level unit (e.g., districts, departments)
- **Admin Area 3**: Smaller unit (e.g., communes, sub-districts)
- **Admin Area 4**: Smallest unit (e.g., villages, wards)

Not all instances use all four levels.

### Health Facilities
Healthcare service delivery points (hospitals, clinics, health posts) linked to admin areas. Facilities may have additional attributes like:
- Facility type (hospital, health center, dispensary)
- Ownership (public, private, faith-based)

## Data Sources

### HMIS Data
Health Management Information System data contains routine health service statistics:
- Service delivery indicators
- Disease surveillance
- Program performance metrics
- Typically reported monthly

### HFA Data
Health Facility Assessment data contains facility characteristics and capacity information:
- Infrastructure availability
- Equipment and supplies
- Staffing levels
- Service readiness

### Indicators
Measurable health metrics that can be:
- **Common Indicators**: Defined and shared across the instance
- **DHIS2 Indicators**: Imported from external DHIS2 systems

## Datasets and Versions

A **dataset** is a collection of health data (HMIS or HFA). Each time data is imported, a new **version** is created, allowing you to:
- Track changes over time
- Switch between versions if needed
- Maintain data history

## Modules

**Modules** are data processing units that execute analytical R scripts. They:
- Take input data (from datasets or other modules)
- Process and analyze the data
- Produce **results objects** (output files)
- Can be chained together (one module uses another's outputs)

### Module Types
- **Module Definition**: The template or blueprint for a type of analysis
- **Module Instance**: A module enabled and configured in a specific project

Modules may have **prerequisites** - other modules that must be enabled first.

## Visualizations (Presentation Objects)

**Visualizations** (also called **presentation objects**) are visual representations of data:
- **Charts**: Bar charts, line graphs, pie charts, etc.
- **Maps**: Geographic visualizations showing data across administrative areas
- **Tables**: Tabular data displays

Visualizations use data from module outputs and can be:
- Filtered by various dimensions
- Disaggregated (broken down by facility type, time period, etc.)
- Styled and customized
- Exported or included in reports

## Reports

**Reports** are collections of visualization pages designed for export and sharing. Reports can be:
- Exported as PowerPoint presentations
- Exported as PDF documents
- Organized with multiple pages
- Configured with custom layouts and orientations

Each page in a report is a **report item** containing a visualization.

## Windowing

**Windowing** means selecting a subset of instance data for a project. You can filter by:
- **Time period**: Select specific months/years
- **Indicators**: Include all or specific indicators
- **Administrative areas**: Include all or specific regions
- **Facilities**: Filter by facility type or ownership

This allows projects to focus on relevant data without loading everything.

## Disaggregation

**Disaggregation** means breaking down data by dimensions to see patterns:
- By time period (monthly, quarterly, yearly)
- By administrative area level
- By facility type
- By facility ownership
- By indicator categories

## User Roles

Users can have different roles determining their permissions:

### At Instance Level
- **Global Admin**: Full access to all instance settings and projects

### At Project Level
- **Admin**: Can modify project settings, modules, visualizations, and reports
- **Editor**: Can create and modify visualizations and reports
- **Viewer**: Can view but not modify project contents

## Data Quality Scores

The system automatically assesses data completeness and accuracy, providing quality scores to help identify data issues.

## Lock Status

Projects can be **locked** to prevent modifications to configuration while allowing report viewing. Locked projects cannot have modules or data settings changed.

## Next Steps

- [First Steps](./first-steps.md) - Get started with initial setup
- [User Guides](../user-guides/) - Detailed workflow instructions
