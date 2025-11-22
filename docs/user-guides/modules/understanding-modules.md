# Understanding Modules

Modules are the analytical engine of the HMIS application. They process data using R scripts and produce results that can be visualized.

## What are Modules?

A **module** is a data processing unit that:

- Takes input data (from project datasets or other modules)
- Executes R analytical scripts in a secure Docker container
- Produces output files called **results objects**
- Can be chained together for complex analyses

Think of modules as analytical building blocks you can combine to create sophisticated data processing pipelines.

## Module Definitions vs Module Instances

### Module Definition

A **module definition** is a template or blueprint that defines:
- What the module does
- What inputs it needs
- What parameters it accepts
- What outputs it produces
- Which R script to execute

Module definitions are created by developers and available system-wide.

### Module Instance

A **module instance** is a module that has been:
- Enabled in a specific project
- Configured with parameter values
- Connected to data sources

One module definition can be installed multiple times across different projects, each with different configurations.

## How Modules Work

### 1. Module Prerequisites

Some modules depend on other modules. Before enabling a module, its **prerequisite modules** must be enabled first.

**Example**: A "Trend Analysis" module might require a "Data Quality" module to run first.

The system enforces these dependencies automatically.

### 2. Module Parameters

Modules can be configured using **parameters**:

#### Parameter Types

- **Number**: Numeric values (e.g., threshold values, percentages)
- **Text**: Text strings (e.g., labels, descriptions)
- **Boolean**: Yes/No toggles (e.g., include/exclude options)
- **Select**: Choose from predefined options

When you enable a module, you set values for these parameters.

### 3. Module Execution

Once enabled and configured, modules run automatically when:

- All prerequisite modules have completed successfully
- Required input data is available
- No configuration errors exist

The execution process:

1. System prepares input data
2. Module R script runs in isolated Docker container
3. Script processes data according to logic and parameters
4. Output files (results objects) are saved
5. Module status updates to "ready"

### 4. Results Objects

Modules produce **results objects** - output files containing processed data. These can be:

- CSV files with analytical results
- Summary statistics
- Processed datasets
- Calculated indicators

Results objects are used as inputs for visualizations.

## Module States

Modules can be in different states:

### Waiting

The module is enabled but waiting for:
- Required input data
- Prerequisite modules to complete

**Action**: Ensure data is available and prerequisites are ready.

### Running

The module is currently executing its R script.

**Action**: Wait for completion. You can view real-time logs.

### Ready

The module has completed successfully. Results objects are available for use in visualizations.

**Action**: Create visualizations using the module's outputs.

### Error

The module encountered an error during execution.

**Action**: View logs to diagnose the issue. Common causes:
- Invalid parameter values
- Data quality issues
- Script errors

## Module Management Tasks

### Enabling a Module

1. Go to the **Modules** tab in your project
2. Find the module you want to enable
3. Click **Enable**
4. If prompted, configure module parameters
5. Click **Save**

The module will begin running when dependencies are met.

### Configuring Module Settings

After enabling, you can modify parameters:

1. Find the module in the Modules tab
2. Click **Settings**
3. Modify parameter values
4. Click **Save**

The module will automatically rerun with new settings.

### Viewing Module Status

The Modules tab shows each module's current state:

- **Green checkmark**: Ready
- **Spinner**: Running
- **Red X**: Error
- **Clock**: Waiting

Hover over status icons for more details.

### Viewing Logs

To see what a module is doing:

1. Click **Logs** on the module card
2. Review the execution log
3. Look for errors or warnings

Logs are especially useful for troubleshooting errors.

### Viewing Output Files

To see what files a module produced:

1. Click **Files** on a ready module
2. Browse the results objects
3. Download individual files if needed

### Rerunning a Module

If you need to rerun a module (e.g., after data updates):

1. Click **Rerun** on the module card
2. The module will execute again with current data and settings

**Note**: Visualizations using this module will automatically update.

### Updating a Module

When module definitions are updated by developers:

1. An **Update** button appears on the module card
2. Click **Update** to upgrade to the latest version
3. Review any new parameters or changes
4. The module will rerun automatically

### Disabling a Module

To remove a module from your project:

1. Click **Disable** on the module card
2. Confirm the action

**Warning**: You cannot disable a module if other enabled modules depend on it. Disable dependent modules first.

## Module Dependencies and Chaining

Modules can use outputs from other modules as inputs, creating a **processing chain**:

```
Data → Module A → Module B → Module C → Visualization
```

**Example Pipeline**:
1. **Data Quality Module**: Validates and cleans data
2. **Indicator Calculation Module**: Calculates health indicators using cleaned data
3. **Trend Analysis Module**: Analyzes indicator trends over time
4. **Visualization**: Displays trend charts

The system automatically:
- Determines the execution order
- Runs modules in sequence
- Triggers dependent modules when prerequisites complete
- Updates visualizations when any module in the chain reruns

## Best Practices

### Module Selection

- Only enable modules you need - fewer modules = faster processing
- Start with basic modules before adding advanced ones
- Understand what each module does before enabling it

### Parameter Configuration

- Use descriptive names if modules have label parameters
- Document why you chose specific parameter values
- Test with conservative parameters before using aggressive settings

### Monitoring Execution

- Check module logs regularly, especially after enabling
- Address errors promptly before creating visualizations
- Monitor processing time for performance issues

### Module Updates

- Review update notes before updating modules
- Test updates in a non-production project first if possible
- Backup important visualizations before major module updates

### Troubleshooting

- Always check logs first when a module errors
- Verify input data quality if modules repeatedly fail
- Ensure parameters are in valid ranges
- Contact administrators for persistent issues

## Common Module Scenarios

### Scenario 1: All Modules Show "Waiting"

**Cause**: No data is enabled in the project yet.

**Solution**: Go to the Data tab and enable at least one dataset.

### Scenario 2: Some Modules Stuck on "Waiting"

**Cause**: Prerequisite modules not enabled or not ready.

**Solution**: Check which modules are prerequisites and enable them first.

### Scenario 3: Module Keeps Failing with Errors

**Cause**: Data quality issues, invalid parameters, or script bugs.

**Solution**:
1. Check logs for specific error messages
2. Verify parameter values are valid
3. Check data quality in the Data tab
4. Contact administrator if problem persists

### Scenario 4: Modules Running Very Slowly

**Cause**: Large datasets, complex processing, or resource constraints.

**Solution**:
- Be patient - some modules process large amounts of data
- Consider reducing data window in project settings
- Check if multiple modules are running simultaneously

## Related Topics

- [Installing Modules](./installing-modules.md)
- [Configuring Module Parameters](./configuring-module-parameters.md)
- [Running Modules](./running-modules.md)
- [Creating Visualizations](../visualizations/creating-visualizations.md)
