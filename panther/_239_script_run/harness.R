# Messages, warnings and errors go to stdout with what the script prints, so
# the log holds them in the order they happened.
sink(stdout(), type = "message")

suppressPackageStartupMessages({
  library(jsonlite)
  library(nanoparquet)
})

# Inside local(), so none of the harness's own names is visible to the
# script, whose environment's parent is the global one.
local({
  work <- getwd()
  manifest <- fromJSON("manifest.json", simplifyVector = FALSE)
  inputs <- list()
  for (input in manifest$inputs) {
    inputs[[input$name]] <- read_parquet(input$file)
  }

  stop_run <- function(text) {
    cat(text, "\n", sep = "")
    quit(save = "no", status = 1)
  }
  on_line <- function(kind, line, condition) {
    call <- conditionCall(condition)
    paste0(
      kind, " on line ", line, " of the script: ", conditionMessage(condition),
      if (is.null(call) || identical(call[[1]], quote(eval))) {
        ""
      } else {
        paste0("\n  in ", deparse1(call))
      }
    )
  }

  # The script runs one top-level expression at a time, as Rscript runs it,
  # so a warning or an error names the line it came from rather than the
  # harness's own call, and a warning is printed when it happens.
  expressions <- tryCatch(
    parse("script.R", keep.source = TRUE),
    error = function(e) stop_run(paste("Error:", conditionMessage(e)))
  )
  script <- new.env(parent = globalenv())
  script$inputs <- inputs
  for (i in seq_along(expressions)) {
    line <- attr(expressions, "srcref")[[i]][[1]]
    withCallingHandlers(
      tryCatch(
        {
          shown <- withVisible(eval(expressions[[i]], script))
          if (shown$visible) {
            print(shown$value)
          }
        },
        error = function(e) stop_run(on_line("Error", line, e))
      ),
      # options(warn) keeps its meaning: below 0 drops a warning, and 2 or
      # more lets R turn it into an error.
      warning = function(w) {
        warn <- getOption("warn")
        if (warn >= 0 && warn < 2) {
          cat(on_line("Warning", line, w), "\n", sep = "")
          invokeRestart("muffleWarning")
        }
      }
    )
  }
  setwd(work)

  # A refused table still exits 0: a non-zero exit is the script's own
  # failure.
  finish <- function(result) {
    write_json(result, "result.json", auto_unbox = TRUE)
    quit(save = "no", status = 0)
  }
  refuse <- function(table, reason) {
    finish(list(failure = list(table = table, reason = reason)))
  }

  outputs <- get0("outputs", envir = script, inherits = FALSE)
  if (is.null(outputs)) {
    outputs <- list()
  }
  if (!is.list(outputs) || is.data.frame(outputs)) {
    refuse("outputs", "outputs must be a named list of data frames")
  }
  entries <- names(outputs)
  tables <- list()
  for (i in seq_along(outputs)) {
    name <- if (is.null(entries)) NA_character_ else entries[[i]]
    if (is.na(name) || name == "") {
      refuse(sprintf("outputs[[%d]]", i), "has no name")
    }
    if (sum(entries == name, na.rm = TRUE) > 1) {
      refuse(name, "is assigned twice")
    }
    table <- outputs[[i]]
    if (!is.data.frame(table)) {
      refuse(name, sprintf("is a %s, not a data frame", class(table)[[1]]))
    }
    file <- sprintf("outputs/%d.parquet", i)
    failure <- tryCatch(
      {
        write_parquet(table, file)
        NULL
      },
      error = conditionMessage
    )
    if (!is.null(failure)) {
      refuse(name, failure)
    }
    tables[[i]] <- list(name = name, file = file)
  }
  finish(list(tables = tables))
})
