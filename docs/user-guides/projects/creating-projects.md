# Creating Projects

Projects are focused analysis workspaces where you work with specific subsets of data, enable modules, and create visualizations and reports.

## Prerequisites

- You must be a global administrator to create projects
- At least one dataset (HMIS or HFA) must have data at the instance level
- Administrative structure (admin areas and facilities) should be imported

## Creating a New Project

### Step 1: Navigate to Projects

1. From the instance home page, click the **Projects** tab
2. You'll see a grid of existing projects (if any)

### Step 2: Start Project Creation

1. Click the **Create project** button (top right)
2. A form will open

**Note**: If the button is not visible, you may not have administrator permissions.

### Step 3: Fill in Project Details

Complete the following fields:

#### Project Label (Required)
Give your project a descriptive name that reflects its purpose.

**Examples:**
- "Q1 2024 Maternal Health Analysis"
- "District Performance Review"
- "Annual Facility Assessment"

#### Project Description (Optional)
Add additional details about the project's goals, scope, or context.

### Step 4: Select Data Sources

Choose which instance-level datasets to include in this project:

- **HMIS**: Include if you need routine health service data
- **HFA**: Include if you need facility assessment data

You can select one or both. Only datasets that have data at the instance level will be available.

### Step 5: Assign Project Users

Add team members and assign their roles:

1. Select a user from the dropdown
2. Choose their role:
   - **Admin**: Can modify everything including project settings and modules
   - **Editor**: Can create and edit visualizations and reports
   - **Viewer**: Can view but not modify content

3. Click **Add** to add the user
4. Repeat for additional users

**Note**: You (as creator) are automatically added as an admin.

### Step 6: Create the Project

1. Review your selections
2. Click **Create**
3. The system will:
   - Create the project
   - Initialize project databases
   - Prepare data structures

This process may take a few seconds.

### Step 7: Initial Data Configuration

After creation, you'll be taken to the new project. You now need to configure the data windowing:

1. Click the **Data** tab
2. For each enabled dataset (HMIS, HFA), click **Settings**
3. Configure what data to include - see [Configuring Project Data](../data/configuring-project-data.md)

## Project Windowing

When you enable a dataset in a project, you don't include all instance data. Instead, you select a "window" of data:

### Time Period
Select start and end months to include only relevant time periods.

**Example**: For a Q1 analysis, select January to March.

### Indicators
Choose to include all indicators or select specific ones relevant to your analysis.

**Example**: For maternal health analysis, select only maternal health indicators.

### Geographic Area
Include all administrative areas or select specific regions.

**Example**: For a district analysis, select only facilities in that district.

### Facility Filters
Filter by facility characteristics:
- Facility type (hospital, health center, etc.)
- Facility ownership (public, private, faith-based)

## After Creating a Project

Once your project is created and data is configured:

1. **Enable Modules**: Go to the Modules tab to enable analytical processing
2. **Create Visualizations**: After modules run, create charts and maps
3. **Build Reports**: Combine visualizations into exportable reports

## Common Issues

### "You need to add data to the instance before you can create a project"

This means no datasets (HMIS or HFA) have data at the instance level yet. Import data first using the instance Data tab.

### Data Sources Not Available

If a dataset doesn't appear as an option:
- Verify it has been imported at the instance level
- Check that the import completed successfully
- Refresh the page and try again

### Project Creation Takes a Long Time

Project creation involves database operations. If it takes more than 30 seconds:
- Check your network connection
- Refresh the page and check if the project appears in the projects list
- Contact your system administrator if the issue persists

## Best Practices

### Naming Projects
- Use descriptive names that indicate purpose and time period
- Include geographic scope if relevant
- Example: "2024 Q1 Vaccination Coverage - Northern Region"

### Data Windowing
- Start with a smaller data window for testing
- Expand the window once you're confident in your analysis setup
- Remember: smaller windows = faster processing

### User Assignment
- Only add users who need access
- Assign the minimum necessary role (viewer vs editor)
- Review and update user access regularly

### Project Organization
- Create separate projects for different analyses or time periods
- Don't try to fit everything into one project
- Use project descriptions to document purpose and scope

## Related Topics

- [Managing Project Users](./managing-users.md)
- [Project Settings](./project-settings.md)
- [Configuring Project Data](../data/configuring-project-data.md)
- [Enabling Modules](../modules/installing-modules.md)
