
# DHIS2 Fetch Requests

## My goals

In my app, I want to access information from instances of DHIS2 for three reasons:

GOAL 1. To pull a list of health facilities (organisationalunits) from the DHIS2 instance, so I can store their ids and query data for these facilities. I have not yet got this working in my app. The idea for this goal is to be able to populate the facilities and admin_areas_* tables in src/db/instance/_main_database.sql by using a fetch request to DHIS2. Currently I am doing this manually by uploading a csv file, as you can see in src/db/instance/structure.ts. Instead, I would like to be able to pull the list of facilities from DHIS2, review them, and then integrate them into my db (similar to the workflow for HMIS data here src/worker_routines/stage_hmis_data_csv/worker.ts and src/worker_routines/integrate_hmis_data/worker.ts)

GOAL 2. To find identifiers for different indicators (data elements), so that I can store and query data for these indicators. I have not yet got this working in my app.

GOAL 3. To query data for different facilities, indicators, and time points (periodids). I have got this working effectively in my app here: src/dhis2/get_json_from_dhis2.ts

## DHIS2 API documentation

There is information on DHIS2's api at these websites:

<https://docs.dhis2.org/en/develop/core-openapi-specification.html>

<https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-239/introduction.html>

## Example implementation

There is also an example of an application that itself makes calls to the DHIS2 api, which we can use as a reference (although we don't have to do things in exactly the same way):

<https://github.com/worldbank/DHIS2-Downloader>

## Development

Claude can you please write any functions, notes, or other documentation about your work on DHIS2 fetch requests to this folder: src/dhis2
