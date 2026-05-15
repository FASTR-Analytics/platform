# Population CSV Format

This document describes the format for `population.csv` files used by the scorecard module (M8).

## Column Headers

| Column | Required | Description |
|--------|----------|-------------|
| `admin_area_2` | Optional | Second-level admin area (e.g., state, county) |
| `admin_area_3` | Optional | Third-level admin area (e.g., district, sub-county) |
| `admin_area_4` | Optional | Fourth-level admin area (e.g., ward, LGA) |
| `year` | **Required** | Four-digit year (e.g., `2023`) |
| `population_type` | **Required** | Type of population count (see options below) |
| `count` | **Required** | Population count for this area/year/type |

**Notes:**
- Include at least one admin area column that matches your HMIS data granularity
- The script uses the finest common admin level between population and HMIS data for joining
- Parent admin columns (e.g., `admin_area_2` when you have `admin_area_3`) are optional but can help with human readability

## Population Types

| ID | Description |
|----|-------------|
| `total_population` | Total population |
| `u5` | Under 5 population |
| `u1` | Under 1 population |
| `wra` | Women of reproductive age (15-49) |
| `births` | Expected births |
| `pregnancies` | Expected pregnancies |

Only include the population types needed by your calculated indicators.

## Example

```csv
admin_area_2,admin_area_3,year,population_type,count
"Northern Region","District A",2022,total_population,150000
"Northern Region","District A",2023,total_population,154500
"Northern Region","District A",2024,total_population,159135
"Northern Region","District A",2022,u1,4500
"Northern Region","District A",2023,u1,4635
"Northern Region","District A",2024,u1,4774
"Northern Region","District B",2022,total_population,200000
"Northern Region","District B",2023,total_population,206000
"Northern Region","District B",2024,total_population,212180
```

## Interpolation

The script automatically interpolates between annual values to estimate monthly population:
- For months within available years: linear interpolation between adjacent years
- For months beyond available years: extrapolation using growth rate from nearest years
- Interpolation assumes annual values represent January 1 of each year

## Legacy Format

Files using the old `period_id` column (e.g., `202301`) are still supported and will be automatically converted to the `year` format.
