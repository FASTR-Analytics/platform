# Creating Reports

Reports combine multiple visualizations into professional documents that can be exported as PowerPoint presentations or PDF files.

## Prerequisites

- At least one visualization must exist in your project
- You must have editor or admin role in the project

## Creating a New Report

### Step 1: Navigate to Reports

1. Open your project
2. Click the **Reports** tab
3. You'll see any existing reports

### Step 2: Start Report Creation

1. Click **Create report**
2. The report creation form will open

### Step 3: Configure Report Settings

Fill in the report details:

#### Label (Required)

Give your report a descriptive name.

**Examples**:
- "Q1 2024 Performance Report"
- "Annual Maternal Health Review"
- "District Comparison Summary"

#### Report Type

Choose the output format:

- **PowerPoint**: Creates .pptx files suitable for presentations
- **PDF**: Creates .pdf files suitable for printing and distribution
- **Other formats**: May be available depending on configuration

#### Additional Settings

Depending on report type, you may configure:

- **Orientation**: Landscape or Portrait
- **Page size**: Letter, A4, or custom
- **Template**: Select from available templates (if configured)

### Step 4: Create the Report

1. Review your settings
2. Click **Create**

You'll be taken to the report editor.

## Building Your Report

### Adding Pages

Each report page contains one visualization:

1. Click **Add page**
2. Select a visualization from the list
3. The page is added to your report

Repeat to add multiple pages.

**Note**: You can only add visualizations that exist in your project. Create visualizations first if needed.

### Viewing Pages

The report editor shows:

- **Left sidebar**: List of report pages in order
- **Main area**: Preview of the selected page

Click pages in the sidebar to view them.

### Reordering Pages

To change the page sequence:

1. Click **Reorder pages** (or a similar reorder button)
2. Drag pages up or down in the list
3. Click **Save** or **Done**

The new order is reflected in exports.

### Editing Page Settings

For individual pages, you may be able to:

- Adjust layout or positioning
- Add page titles or notes
- Configure page-specific styling

Click on a page and look for edit options.

### Removing Pages

To delete a page from the report:

1. Select the page in the sidebar
2. Click **Remove page** or the delete icon
3. Confirm the removal

### Report Settings

Access overall report settings:

1. Click **Settings** or the gear icon
2. Modify:
   - Report label
   - Report type
   - Orientation
   - Page size
   - Other formatting options

3. Click **Save**

## Exporting Reports

### Export to PowerPoint

1. Click **Export** button
2. Select **PowerPoint** (or it may be automatic based on report type)
3. The system generates the .pptx file
4. Download completes to your computer

The PowerPoint file contains:
- One slide per page
- Visualizations rendered as images or embedded charts
- Formatting based on report settings

### Export to PDF

1. Click **Export** button
2. Select **PDF** (or it may be automatic based on report type)
3. The system generates the PDF
4. Download completes to your computer

The PDF file contains:
- One page per report page
- High-quality rendered visualizations
- Suitable for printing or digital distribution

### Export Options

Some exports may offer additional options:

- **Quality**: Select resolution (higher = larger file size)
- **Include metadata**: Add report date, project name, etc.
- **Page numbers**: Include or exclude

Configure these before exporting.

## Managing Reports

### Duplicating a Report

To create a copy of a report:

1. Open the report
2. Click **Duplicate**
3. A copy is created with the same pages and settings
4. Rename and modify as needed

Useful for creating variations (e.g., monthly reports from a template).

### Uploading/Importing Reports

If you have a report backup file (.json):

1. From the Reports tab, click **Upload report**
2. Select the .json file
3. The report is imported with all pages

**Use for**: Restoring backups, sharing report templates between projects

### Downloading Report Backups

To backup a report:

1. Open the report
2. Click **Download** or **Backup**
3. Select **JSON** format
4. Save the .json file

This backup includes:
- Report configuration
- All page settings
- References to visualizations (note: visualizations themselves are not included)

### Deleting Reports

1. Open the report
2. Click **Delete**
3. Confirm the deletion

**Note**: This does not delete the visualizations used in the report.

## Advanced Report Features

### Page Fit Options

Control how visualizations fit on pages:

- **Fit to page**: Scale visualization to fill the page
- **Actual size**: Use visualization's native dimensions
- **Custom**: Specify exact dimensions

Find these options in report settings or page-level settings.

### Report Templates

If your instance has report templates configured:

1. When creating a report, select a template
2. The template provides:
   - Branding (logos, colors)
   - Consistent formatting
   - Pre-defined layouts

Use templates for professional, branded outputs.

### Multi-Visualization Pages

Some report types may support multiple visualizations per page:

1. When adding a page, look for layout options
2. Select a multi-visualization layout (e.g., 2-up, 4-up)
3. Assign visualizations to each slot

**Note**: Availability depends on report type and configuration.

## Best Practices

### Report Organization

- Group related visualizations together
- Order pages logically (e.g., overview first, details later)
- Start with summary visualizations, then dive into specifics
- End with conclusions or next steps

### Page Design

- Don't overcrowd pages - one clear message per page
- Ensure visualizations are legible when exported
- Use consistent styling across all visualizations
- Test exports to verify quality before sharing

### Naming and Labeling

- Use descriptive report names including time period
- Add context in page titles (if supported)
- Include metadata (date created, data source) in first or last page
- Document report purpose in description field

### Export Quality

- For presentations, PowerPoint works best
- For printed documents, use PDF
- Test exports on different devices/programs to ensure compatibility
- Archive exported files with clear filenames (e.g., "Q1_2024_Report_v2.pdf")

### Report Maintenance

- Update reports when underlying data changes
- Re-export reports after module updates
- Archive old versions with dates
- Remove outdated reports to avoid confusion

## Common Issues

### "No visualizations available to add"

**Cause**: No visualizations exist in the project yet.

**Solution**: Create visualizations first, then build reports.

### Export Fails or Takes a Long Time

**Cause**: Large number of pages, complex visualizations, or server load.

**Solutions**:
- Reduce number of pages
- Simplify visualizations (fewer data points)
- Try again during off-peak hours
- Contact administrator if problem persists

### Visualizations Look Different in Export

**Cause**: Rendering differences between web view and export format.

**Solutions**:
- Preview exports to check quality
- Adjust visualization styling for better export results
- Use simpler chart types for more consistent rendering
- Ensure fonts and colors are compatible with export format

### Cannot Reorder Pages

**Cause**: Browser issue or report in locked state.

**Solutions**:
- Refresh the page and try again
- Check if project is locked (unlock if admin)
- Clear browser cache

### Report Shows Old Data

**Cause**: Visualizations haven't updated after module rerun.

**Solution**:
- Go to visualizations and refresh them
- Reopen the report to reload latest data
- Re-export the report

## Related Topics

- [Creating Visualizations](../visualizations/creating-visualizations.md)
- [Organizing Report Pages](./organizing-pages.md)
- [Exporting Reports](./exporting-reports.md)
- [Understanding Modules](../modules/understanding-modules.md)
