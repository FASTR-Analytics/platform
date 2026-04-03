# HFA Enhancement

I want to do some work on the HFA data system.

please familiarise yourself with the HFA components of this app, including:
client/src/components/instance_dataset_hfa
client/src/components/instance_dataset_hfa_import

You will see that the data for the HFA is stored in this table:

CREATE TABLE dataset_hfa (
  facility_id text NOT NULL,
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  version_id integer NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT DEFERRABLE,
  FOREIGN KEY (version_id) REFERENCES dataset_hfa_versions(id) ON DELETE RESTRICT
);

## TASK

I want a new system that will involve a "data dictionary" set of tables, to go with dataset_hfa

This should look something like:

CREATE TABLE dataset_hfa_dictionary_vars {
  time_point text NOT NULL,
  var_name text NOT NULL,
  var_label text NOT NULL
}

CREATE TABLE dataset_hfa_dictionary_values {
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  value_label text NOT NULL
}

Both of these tables should foreign key to dataset_hfa on (time_point, var_name)

You can hopefully intuit that this is to create labels for the variables and the values, as is common with statistical software and data analysis tools.

NOTE: You will see that there are potential differents PER time_point.

I want to set up these tables, and to allow for populating these tables as part of the HFA data import process:
client/src/components/instance_dataset_hfa_import

IMPORTANT: I believe this will involve importing datasets ONE ROUND AT A TIME (whereas currently you import all at once).

Alternatively, you can import data with multiple timepoints, but import labels per time_point

# RATIONALE

The HFA data is collected using ODK and XLSForm approach. Please search xlsform.org or related material online to make sure you understand what this is.

HFA surveys are conducted at different time points. Importantly, the questionnaire for the survey may change a different times, hence then need to foreign-key on time_point as well as var_name.

I would like the importer to be able to import HFA data as a csv (as currently working in the app), but (new) alongside the XLSForm and to extra the matching variables and value labels from the ODK questionnaire.

I am envisaging an improvement to the HFA import process that will allow to upload an XLSForm Excel file as part of client/src/components/instance_dataset_hfa_import/step_1.tsx

Can you think about what this entails, make sure you understand the idea, and ask me questions about a way forward.
