# Importing HFA Data

HMIS (Health Management Information System) data contains routine health service statistics reported by facilities. This guide explains how to import HMIS data into the instance.

## Prerequisites

- You must be a global administrator
- Administrative structure (admin areas and facilities) must be imported first
- You have an HMIS data CSV file prepared

## CSV File Format

Your HMIS CSV file should contain:

- Facility identifiers (matching your structure data)
- Time period information (year/month)
- Indicator codes
- Data values

Ensure the CSV is properly formatted with headers and consistent data types.

## Import Process

### Step 1: Navigate to HMIS Data

1. From the instance home page, click the **Data** tab
2. In the "Data Sources" section, click on **HMIS**

### Step 2: Start New Upload

1. Click **Create new upload attempt**
2. A new upload workflow will begin

**Note**: If there's already an upload in progress, you'll see its status. Wait for it to complete or delete it before starting a new upload.

### Step 3: Upload CSV File

1. Click **Select file** or drag and drop your CSV file
2. The file will upload to the server
3. Wait for the upload to complete

The system will perform initial validation:

- Check file format
- Verify it's a valid CSV
- Check file size limits

### Step 4: Review Data Preview

The system will show:

- Number of rows detected
- Sample of the data
- Column headers

Review this preview to ensure your file uploaded correctly.

### Step 5: Map Facility Identifiers

If your CSV uses different facility identifier columns than expected:

1. The system will show a column mapping interface
2. Select which CSV column contains facility IDs
3. Confirm the mapping

The system will validate that facility IDs match facilities in your structure.

### Step 6: Map Indicators

You may need to map indicator codes from your CSV to system indicators:

1. Review the indicator mapping table
2. For unmapped indicators:
   - Create new indicators, or
   - Map to existing indicators

3. Save the mappings

**Tip**: Use common indicators when possible for consistency across projects.

### Step 7: Configure Import Settings

Set any additional import options:

- **Replace existing data**: Check if this import should replace previous data
- **Data validation rules**: Configure any validation checks
- **Error handling**: Decide how to handle data validation errors

### Step 8: Confirm and Process

1. Review the import summary:
   - Total rows
   - Facility count
   - Indicator count
   - Time period coverage

2. Click **Confirm** to start processing

The system will:

- Validate all data
- Check for duplicates
- Perform quality checks
- Load data into the database
- Create a new dataset version

### Step 9: Monitor Progress

Watch the progress indicator as the import runs. This may take several minutes for large datasets.

The system will show:

- Current processing step
- Rows processed
- Any errors or warnings

### Step 10: Review Results

When complete, you'll see:

- **Success message** if import completed
- **Error summary** if there were issues
- **Data quality report** showing completeness and validation results

Click **Close** to return to the HMIS data page.

## After Import

### View Dataset Details

From the HMIS data page, you can now see:

- Last export date
- Number of rows
- Time period coverage
- Previous import history

### Use in Projects

The new HMIS data is now available for use in projects:

1. Create a new project or open an existing one
2. Enable HMIS dataset in the project
3. Configure data windowing to select relevant data
4. Modules can now process the data

## Managing Dataset Versions

Each import creates a new version:

### View Previous Imports

1. From the HMIS data page, click **Previous imports**
2. You'll see a list of all import attempts with:
   - Import date
   - Number of rows
   - Status (success/failed)

### Switch Versions

If needed, you can switch between versions or restore a previous version. Contact your administrator for version management.

### Delete Data

To completely remove HMIS data:

1. Click **Delete data** (requires confirmation)
2. This will remove all HMIS data from the instance
3. Projects using HMIS data will no longer function until new data is imported

**Warning**: This action cannot be undone. Ensure you have backups.

## Common Issues

### "Facility IDs not found"

Some facility IDs in your CSV don't match facilities in your structure.

**Solutions**:

- Verify facility IDs are spelled correctly
- Check that all facilities are in your structure data
- Import structure data first if you haven't

### "Duplicate data detected"

The CSV contains duplicate rows (same facility, time period, and indicator).

**Solutions**:

- Clean your CSV file to remove duplicates
- Check if you're importing the same data twice
- Use "replace existing data" option to overwrite

### "Invalid date format"

Time period information in your CSV is not recognized.

**Solutions**:

- Ensure date columns use consistent format (YYYY-MM or YYYY-MM-DD)
- Check that all dates are valid (e.g., no month 13)
- Verify date columns are not empty

### Import Takes a Long Time

Large datasets (>100,000 rows) may take several minutes.

**Tips**:

- Don't close the browser window during import
- Be patient - processing includes validation and quality checks
- Consider splitting very large files into smaller batches

### Indicator Mapping Issues

New indicators in your CSV need to be mapped.

**Solutions**:

- Create new common indicators for reusable metrics
- Map to existing indicators when appropriate
- Ensure indicator codes are consistent across imports

## Data Quality Checks

The system performs automatic quality checks:

### Completeness

- Checks for missing values
- Identifies facilities with no data
- Flags incomplete time periods

### Validation Rules

- Numeric values are within expected ranges
- Required fields are populated
- Data types are correct

### Consistency

- Values are consistent across related indicators
- Trends are reasonable over time
- Facility-level totals match expected patterns

Review the data quality report after import to identify issues.

## Best Practices

### Before Import

- Clean and validate your CSV file
- Verify facility IDs match your structure
- Check for duplicates
- Ensure consistent date formats

### During Import

- Don't close the browser while processing
- Review each step carefully
- Save indicator mappings for reuse

### After Import

- Review the data quality report
- Spot-check key indicators
- Verify time period coverage
- Test in a project before wide rollout

### Regular Imports

- Develop a consistent import schedule (e.g., monthly)
- Use the same indicator codes for consistency
- Maintain a backup of CSV files
- Document any data cleaning steps

## Related Topics

- [Importing HFA Data](./importing-hfa-data.md)
- [Managing Dataset Versions](./dataset-versions.md)
- [Managing Administrative Structure](../administration/managing-structure.md)
- [Creating Projects](../projects/creating-projects.md)
