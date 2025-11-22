# Frequently Asked Questions (FAQ)

## General Questions

### What is the HMIS application?

The HMIS application is a web-based platform for analyzing and visualizing health facility data. It allows you to import data, process it through analytical modules, create visualizations, and generate reports.

### Who can use this application?

The application is designed for:
- Health data analysts
- Program managers
- System administrators
- Decision-makers who need health data insights

### What browsers are supported?

The application works best in modern browsers: Chrome (recommended), Firefox, Safari, and Edge. Ensure JavaScript is enabled.

### Is my data secure?

Yes. The application uses:
- Authentication for all access
- Project-level data isolation
- Sandboxed module execution
- Role-based permissions

## Getting Started

### How do I get access?

Contact your system administrator to get login credentials and appropriate permissions.

### What data do I need to get started?

At minimum, you need:
1. Administrative structure (admin areas and facilities)
2. Health data (HMIS or HFA)

### Can I try it without real data?

Contact your administrator about test/demo datasets if available.

### Where do I find training materials?

Refer to the [Getting Started](../getting-started/) guides in this documentation.

## Data Management

### What's the difference between HMIS and HFA data?

- **HMIS**: Routine health service statistics (typically monthly reports)
- **HFA**: Facility characteristics and capacity assessments

### Can I import data from Excel?

Data must be in CSV format. Most spreadsheet applications can export to CSV.

### How often should I import data?

As often as you receive new data - typically monthly for HMIS, or when HFA assessments are conducted.

### What happens to old data when I import new data?

Each import creates a new dataset version. Old versions are preserved and can be accessed if needed.

### Can I delete incorrect data?

Yes, administrators can delete data at the instance level. However, this affects all projects using that data.

### How do I fix errors in imported data?

Correct the CSV file and import again. The new version will replace or supplement the previous data.

## Projects

### How many projects can I create?

There's typically no hard limit, but check with your administrator for organizational policies.

### Can one person be in multiple projects?

Yes, users can be assigned to multiple projects with different roles in each.

### What's the difference between project roles?

- **Admin**: Full project control (settings, modules, visualizations, reports)
- **Editor**: Can create/edit visualizations and reports
- **Viewer**: Can view only, no editing

### Can I copy a project?

Not directly, but you can:
- Export visualizations as JSON and import to another project
- Use the same module configuration across projects
- Duplicate individual reports

### Why can't I edit a project?

The project may be locked, or you may have viewer role. Contact a project admin.

## Modules

### What are modules for?

Modules process your data through analytical R scripts to calculate indicators, perform quality checks, generate summaries, and produce outputs for visualization.

### Why can't I enable a module?

Check if:
- Prerequisite modules are enabled first
- You have admin permissions
- The project is not locked

### How long do modules take to run?

Depends on data volume and module complexity. Simple modules may take seconds; complex analysis can take minutes.

### Why is my module stuck on "waiting"?

Modules wait for:
- Required data to be enabled
- Prerequisite modules to complete

Check the Modules tab for dependencies.

### Can I see what a module is doing?

Yes, click "Logs" on the module card to see execution logs in real-time.

### What if a module fails with an error?

1. Check the logs for error details
2. Verify module parameters are valid
3. Check data quality
4. Contact your administrator if the issue persists

### Can I run modules manually?

Modules run automatically when dependencies are met. Admins can manually rerun modules using the "Rerun" button.

## Visualizations

### How many visualizations can I create?

No strict limit, but for performance, focus on visualizations you actively use.

### Can I create custom visualization types?

Visualization types are predefined (charts, maps, tables). Customization is through styling and configuration options.

### Why doesn't my visualization show any data?

Check:
- The module produced results (check module status)
- Filters aren't too restrictive
- Disaggregation options are correct
- The selected results object contains data

### Can I edit a visualization after creating it?

Yes, editors and admins can modify any visualization configuration.

### How do I export just one visualization?

Open the visualization and click "Download" to export as an image or "Download CSV" for the data.

### Can I share a visualization with someone not in the project?

Export it as an image and share the image file. The person won't have interactive access without project membership.

## Reports

### What's the difference between PowerPoint and PDF exports?

- **PowerPoint**: Editable presentations, good for further customization
- **PDF**: Fixed format, good for printing and archival

### How many pages can a report have?

No strict limit, but very large reports (>50 pages) may be slow to export.

### Can I customize report layouts?

Layout options depend on report type and configured templates. Check report settings.

### Why does my exported report look different from the preview?

Rendering differences can occur. Always preview exports to verify quality.

### Can I schedule automatic report generation?

This feature is typically not available in the standard application. Contact your administrator for custom solutions.

### How do I share a report?

Export to PowerPoint or PDF and share the file via email or file sharing systems.

## Troubleshooting

### The application is slow or unresponsive

Try:
- Refresh your browser
- Clear browser cache
- Close other browser tabs
- Check your internet connection
- Try during off-peak hours

### I can't see any data

Verify:
- You're in the correct project
- Data has been imported at the instance level
- Modules are enabled and ready
- You have appropriate permissions

### Changes aren't saving

- Check if the project is locked
- Verify you have editor/admin role
- Check browser console for errors
- Try a different browser

### I'm getting permission errors

Contact a project admin or global admin to verify your role assignments.

### Modules keep failing

- Review module logs for specific errors
- Check data quality
- Verify parameter values
- Contact your administrator with log details

## Data Quality

### How is data quality assessed?

The system performs automatic checks for:
- Completeness (missing values)
- Consistency (logical errors)
- Validation (values in expected ranges)

### What are data quality scores?

Automated assessments of data completeness and accuracy to help identify issues.

### How do I improve data quality?

- Review quality reports to identify issues
- Correct errors at the source (in your CSV files)
- Reimport corrected data
- Work with data collectors to improve reporting

## Performance

### Why is everything slow?

Common causes:
- Large datasets
- Complex modules running
- Many visualizations loading simultaneously
- Network issues

Try reducing data windows, simplifying visualizations, or accessing during off-peak times.

### How can I make visualizations load faster?

- Apply filters to reduce data volume
- Simplify disaggregation
- Use tables instead of complex charts for large datasets

## Getting Help

### Who do I contact for support?

Contact your system administrator for:
- Access issues
- Technical problems
- Feature requests
- Training

### Where can I report bugs?

Report issues to your system administrator with:
- Description of the problem
- Steps to reproduce
- Screenshots if helpful
- Browser and OS information

### Is there user training available?

Ask your administrator about training sessions or materials specific to your organization.

### Can I suggest new features?

Yes! Contact your administrator with feature ideas. User feedback helps improve the system.
