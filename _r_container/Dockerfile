FROM rocker/tidyverse:4.4.2
RUN R -q -e 'install.packages("scales")'
RUN R -q -e 'install.packages("lubridate")'
RUN R -q -e 'install.packages("zoo")'
RUN R -q -e 'install.packages("haven")'
RUN R -q -e 'install.packages("data.table")'
RUN R -q -e 'install.packages("fixest")'
RUN R -q -e 'install.packages("readxl")'
RUN R -q -e 'install.packages("MASS")'
RUN apt-get update && apt-get install -y --no-install-recommends libgsl-dev libudunits2-0 libgdal34t64 libgeos-c1v5 libproj25 && rm -rf /var/lib/apt/lists/*
# INLA pinned to the last release whose fmesher requirement (>= 0.1.7) is satisfied
# by this base image's frozen package snapshot (fmesher 0.2.0)
RUN R -q -e 'install.packages("fmesher")'
RUN R -q -e 'install.packages("https://inla.r-inla-download.org/R/stable/src/contrib/INLA_24.12.11.tar.gz", repos = NULL)'
RUN R -q -e 'library(INLA)'

