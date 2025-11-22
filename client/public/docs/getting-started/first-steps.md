# First Steps

This guide walks you through the initial setup and creation of your first project.

## Prerequisites

- You have been given login credentials
- You have access to health facility structure data (administrative areas and facilities)
- You have HMIS or HFA data to import

## Step 1: Log In

1. Navigate to the application URL provided by your administrator
2. Click the login button
3. Enter your credentials
4. You'll be directed to the main instance page

## Step 2: Configure Instance Settings (Admin Only)

If you're a global administrator setting up the system for the first time:

1. Click the **Settings** tab at the top of the page
2. Configure:
   - **Language**: Select English or French
   - **Calendar**: Choose the calendar system (Gregorian or Ethiopian)
   - **Max Admin Area**: Set how many administrative area levels you use (1-4)
   - **Facility Columns**: Configure which facility attributes to include (ownership, types)

3. Click **Save**

## Step 3: Import Structure Data

Before creating projects, import your administrative structure and health facilities.

### Import Admin Areas and Facilities

1. Click the **Data** tab
2. Click on **Admin areas and facilities**
3. Click **Create new upload**
4. Follow the CSV upload wizard:
   - Upload your structure CSV file
   - Map CSV columns to system fields
   - Review and confirm the import

5. The system will process and validate your data
6. Click **Back** to return to the instance data page

You should now see counts of admin areas and facilities.

**See Also**: [Managing Administrative Structure](../user-guides/administration/managing-structure.md)

## Step 4: Import Health Data

Import HMIS or HFA data into the instance.

### Import HMIS Data

1. From the **Data** tab, click on **HMIS**
2. Click **Create new upload**
3. Follow the multi-step import process:
   - Upload your HMIS CSV file
   - Configure import settings
   - Map indicators (if needed)
   - Review and confirm

4. Wait for processing to complete
5. Your HMIS dataset is now available

**See Also**: [Importing HMIS Data](../user-guides/data/importing-hmis-data.md)

### Import HFA Data (Optional)

Follow similar steps for HFA data if you have facility assessment data.

**See Also**: [Importing HFA Data](../user-guides/data/importing-hfa-data.md)

## Step 5: Create Your First Project

Now that you have structure and data, create a project.

1. Click the **Projects** tab
2. Click **Create project**
3. Fill in the form:
   - **Project Label**: Give your project a descriptive name
   - **Description**: Add details about the project's purpose
   - **Data Sources**: Select which datasets to include (HMIS, HFA)
   - **Users**: Assign users and their roles (admin, editor, viewer)

4. Click **Create**

The system will process your project and configure the data. This may take a few moments.

**See Also**: [Creating Projects](../user-guides/projects/creating-projects.md)

## Step 6: Configure Project Data Windowing

After creating the project, configure which subset of data to include.

1. Open your project
2. Click the **Data** tab within the project
3. For each enabled dataset (e.g., HMIS), click **Settings**
4. Configure the data window:
   - **Time Period**: Select start and end months
   - **Indicators**: Choose all indicators or select specific ones
   - **Admin Areas**: Include all or specific areas
   - **Facilities**: Filter by facility type or ownership if needed

5. Click **Save**

The system will export a project-specific dataset based on your filters.

**See Also**: [Managing Project Data](../user-guides/data/dataset-versions.md)

## Step 7: Enable Analytical Modules

Modules process your data and produce results for visualizations.

1. Go to the **Modules** tab in your project
2. Browse available modules
3. Click **Enable** on a module
4. If the module has settings, click **Settings** to configure parameters
5. The module will run automatically when its dependencies are ready

Watch the module status change from "waiting" to "running" to "ready".

**See Also**: [Understanding Modules](../user-guides/modules/understanding-modules.md)

## Step 8: Create Your First Visualization

Once at least one module is ready, create a visualization.

1. Go to the **Visualizations** tab
2. Click **Create visualization**
3. Select:
   - **Module**: Choose which module's data to visualize
   - **Results Object**: Select which output from the module
   - **Visualization Type**: Choose chart, map, or table

4. Configure your visualization:
   - Add filters
   - Set disaggregation options
   - Customize styling

5. Click **Save**

Your visualization will load with the processed data.

**See Also**: [Creating Visualizations](../user-guides/visualizations/creating-visualizations.md)

## Step 9: Build a Report

Combine visualizations into a report for export.

1. Go to the **Reports** tab
2. Click **Create report**
3. Enter a label and select the report type (PowerPoint or PDF)
4. Click **Create**
5. In the report editor:
   - Click **Add page**
   - Select a visualization
   - Repeat for multiple pages
   - Reorder pages as needed

6. Click **Export** to download as PowerPoint or PDF

**See Also**: [Creating Reports](../user-guides/reports/creating-reports.md)

## Next Steps

You now have a complete workflow from data import to report generation. Explore these guides for more detailed instructions:

- [Managing Projects](../user-guides/projects/)
- [Working with Data](../user-guides/data/)
- [Using Modules](../user-guides/modules/)
- [Creating Visualizations](../user-guides/visualizations/)
- [Building Reports](../user-guides/reports/)

## Getting Help

If you encounter issues:
- Check the module logs for errors
- Verify data import was successful
- Ensure all module prerequisites are enabled
- Contact your system administrator
