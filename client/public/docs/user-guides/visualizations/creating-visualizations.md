# Creating Visualizations

Visualizations (also called presentation objects) transform your processed data into charts, maps, and tables for analysis and reporting.

## Prerequisites

- At least one module must be enabled in your project
- At least one module must be in "ready" state (completed successfully)
- You must have editor or admin role in the project

## Creating a New Visualization

### Step 1: Navigate to Visualizations

1. Open your project
2. Click the **Visualizations** tab
3. You'll see any existing visualizations

### Step 2: Start Visualization Creation

1. Click **Create visualization**
2. The visualization creation form will open

**Note**: If the button is disabled, you may not have modules enabled or they may not be ready yet.

### Step 3: Select Data Source

Choose which module's output to visualize:

1. **Module**: Select from your enabled and ready modules
2. **Results Object**: Choose which output file from that module to use

Different modules produce different types of results objects - select the one containing the data you want to visualize.

### Step 4: Choose Visualization Type

Select how to display your data:

#### Chart
Visual graphs including:
- Bar charts
- Line graphs
- Pie charts
- Combo charts
- Time series

**Best for**: Trends, comparisons, distributions

#### Map
Geographic visualizations showing data across administrative areas

**Best for**: Spatial patterns, regional comparisons, geographic distribution

#### Table
Tabular data displays with rows and columns

**Best for**: Detailed data inspection, precise values, multiple indicators

### Step 5: Configure Data Options

#### Summary

Configure basic data display:

1. **Label**: Give your visualization a descriptive name
2. **Results Object**: Confirm or change the data source
3. **Filters**: Add filters to focus on specific data subsets

#### Filters

Apply filters to show only relevant data:

1. Click **Add filter**
2. Select filter dimension:
   - Time period
   - Admin area
   - Facility type
   - Indicator
   - Other dimensions (depends on module output)

3. Choose filter values (e.g., specific months, districts)
4. Add multiple filters as needed

**Example**: Filter to show only data from "District A" for "January to March"

#### Disaggregation

Break down your data by dimensions to see patterns:

1. Select **Disaggregation dimension**:
   - By time period (monthly, quarterly, yearly)
   - By admin area level
   - By facility type
   - By indicator
   - Other options (module-dependent)

2. Choose how to display disaggregated data:
   - Separate series/groups
   - Side-by-side comparison
   - Stacked display

**Example**: Disaggregate by month to show trends over time

**Note**: Avoid duplicate disaggregation dimensions as this can cause display issues.

### Step 6: Customize Styling

Make your visualization visually appealing and clear:

#### For Charts

- **Chart sub-type**: Select specific chart style (grouped bars, stacked bars, etc.)
- **Colors**: Choose color schemes
- **Axes**: Configure x-axis and y-axis labels, scales, ranges
- **Legend**: Position and format the legend
- **Data labels**: Show/hide value labels on data points
- **Title**: Customize title text and formatting

#### For Maps

- **Color scheme**: Select choropleth color gradients
- **Boundaries**: Configure administrative boundary display
- **Labels**: Show/hide area labels
- **Legend**: Configure legend position and format

#### For Tables

- **Column order**: Arrange columns
- **Number formatting**: Decimal places, thousands separators
- **Conditional formatting**: Highlight cells based on values
- **Totals**: Include row/column totals

### Step 7: Preview and Save

1. Preview your visualization in real-time as you configure
2. Adjust settings until it looks right
3. Click **Save**

Your visualization is now created and available.

## After Creating a Visualization

### Viewing the Visualization

From the Visualizations tab, click on any visualization to open it in full view.

### Editing a Visualization

1. Click on the visualization to open it
2. Click **Edit** or the settings icon
3. Modify any configuration options
4. Click **Save**

Changes take effect immediately.

### Exporting a Visualization

From the visualization view:

#### Download as Image

1. Click **Download**
2. Select image format (PNG recommended)
3. Image downloads to your computer

**Use for**: Inserting into documents, emails, presentations outside the system

#### Download Data as CSV

1. Click **Download CSV**
2. The underlying data downloads as a spreadsheet

**Use for**: Further analysis in Excel, custom reporting

### Using Visualizations in Reports

Visualizations can be added to reports:

1. Go to the **Reports** tab
2. Open or create a report
3. Click **Add page**
4. Select your visualization

See [Creating Reports](../reports/creating-reports.md) for details.

### Duplicating a Visualization

To create a similar visualization:

1. Open the visualization
2. Click **Duplicate**
3. A copy is created with the same settings
4. Modify the copy as needed

Useful for creating variations quickly.

### Deleting a Visualization

1. Open the visualization
2. Click **Delete**
3. Confirm the deletion

**Warning**: If this visualization is used in reports, those report pages will be affected. Remove from reports first.

## Advanced Features

### Replication Options

Create multiple instances of a visualization with variations:

1. In visualization settings, find **Replicate by**
2. Select a dimension (e.g., admin area, indicator)
3. The system creates separate visualizations for each value

**Example**: Replicate by district to create one chart per district automatically

### AI Interpretation

If AI features are enabled:

1. Click **AI Interpretation** button
2. The system generates insights about your data
3. Review the interpretation
4. Use insights in reports or decision-making

### Conditional Formatting (Tables)

Highlight important values in tables:

1. Edit your table visualization
2. Go to styling options
3. Add conditional formatting rules:
   - Color cells based on value ranges
   - Highlight top/bottom performers
   - Flag values above/below thresholds

## Tips for Effective Visualizations

### Choosing the Right Type

- **Bar charts**: Compare values across categories
- **Line charts**: Show trends over time
- **Pie charts**: Show parts of a whole (use sparingly)
- **Maps**: Display geographic patterns
- **Tables**: Provide precise details and multiple metrics

### Filtering Best Practices

- Start broad, then add filters to focus
- Don't over-filter - you may hide important patterns
- Document why you applied specific filters (in label or description)

### Disaggregation Tips

- Use time disaggregation for trend analysis
- Use geographic disaggregation for regional comparisons
- Limit disaggregation dimensions to 2-3 for clarity
- Avoid creating too many series - can become unreadable

### Styling Guidelines

- Use consistent color schemes across related visualizations
- Ensure text is large enough to read
- Label axes clearly
- Include units (%, count, rate per 1000, etc.)
- Keep titles concise but descriptive

### Performance Considerations

- Large datasets may load slowly - use filters to reduce data
- Complex disaggregations take longer to render
- Maps with many boundaries may be slow - zoom to focus areas

## Common Issues

### "No modules available"

**Cause**: No modules enabled or all modules are waiting/running/error.

**Solution**: Go to Modules tab and enable modules. Wait for them to reach "ready" state.

### Visualization is blank or shows no data

**Cause**: Filters are too restrictive, no data matches criteria, or module has no results.

**Solution**:
- Remove or broaden filters
- Check the module's output files to verify data exists
- Try a different results object

### "Duplicate disaggregation dimension detected"

**Cause**: You've selected the same dimension for disaggregation twice.

**Solution**: Review disaggregation settings and remove duplicates.

### Visualization loads very slowly

**Cause**: Large dataset, complex processing, or many data points.

**Solution**:
- Add filters to reduce data volume
- Simplify disaggregation
- Use a different visualization type (tables load faster than complex charts)

### Colors or styling not saving

**Cause**: Browser issue or conflicting settings.

**Solution**:
- Clear browser cache and reload
- Try a different browser
- Contact administrator if problem persists

## Related Topics

- [Filtering and Disaggregation](./filtering-and-disaggregation.md)
- [Customizing Charts](./customizing-charts.md)
- [Exporting Visualizations](./exporting-visualizations.md)
- [Creating Reports](../reports/creating-reports.md)
- [Understanding Modules](../modules/understanding-modules.md)
