import { HFA_CODE_LIST_EXAMPLE, HFA_CODE_SYMBOLS, HFA_CODE_WORDS } from "lib";

// The HFA indicator guidance, the same text in the manager's and the code
// editor's views, which supply it through their contexts (S13 frames it under
// each view's own lines). Instructional rather than a live indicator list:
// the model edits the very data an embedded overview would stale-out, so it
// reads current state instead. It names no tool: the registered tools
// describe themselves.
export function getHfaIndicatorsGuidance(): string {
  return [
    "## The HFA indicator model",
    "HFA data is a facility survey, collected in one or more rounds (time points). Each round has a dictionary of survey VARIABLES, each with an id, a label and a type; a select question also has options, each a code with a label and, for a code that is not a real answer, a sentinel class (don't know, refused, other, not applicable, question-specific).",
    "",
    "An INDICATOR is a measure computed per facility from those variables. Each indicator has:",
    "- a SHORT label (brief, for dense charts) and a LONG label, the `definition` (the full descriptive text);",
    "- per round, INDICATOR CODE, the `code`: an expression evaluated per facility against that round's variables, and an optional FILTER CODE, the `filterCode`: a yes/no expression that decides which facilities are in the denominator;",
    "- a TYPE and an AGGREGATION, which together fix the measurement;",
    "- a category, an optional sub-category (which must belong to that category), and zero or more service categories;",
    "- optionally a VARIANT GROUP (see below).",
    "",
    "### Choosing TYPE (what each facility's code yields)",
    '- `binary`: a yes/no per facility, e.g. `service_x_available == 1`. Use it for "does this facility have or meet X".',
    "- `numeric`: a quantity per facility, e.g. `num_beds` or `staff_doctors + staff_nurses`. Use it for counts or amounts.",
    "",
    "### Choosing AGGREGATION (how facilities combine)",
    '- `avg`: the mean across facilities. For a `binary` indicator the mean of yes/no is the PROPORTION of facilities, shown as "% of facilities with X". For a `numeric` indicator it is the average per facility.',
    "- `sum`: the total across facilities, for `numeric` counts whose grand total matters (e.g. total beds).",
    "",
    'Most HFA indicators are `binary` + `avg`, "percentage of facilities with [condition]". Use that unless the user clearly wants an average quantity (`numeric` + `avg`) or a grand total (`numeric` + `sum`). Never put the measurement phrase ("% of facilities...") in a label: it is added when the indicator is shown.',
    "",
    "## The code",
    `- The language accepts the operators ${
      HFA_CODE_SYMBOLS.join(" ")
    }, the words ${
      HFA_CODE_WORDS.join(" ")
    } (any case; & | ! mean the same), parentheses, numbers, and the list test \`${HFA_CODE_LIST_EXAMPLE}\` (negated as NOT IN). There are no functions: write an index as arithmetic, e.g. \`(a + b + c) / 3\`.`,
    '- Every value is read as a number. Compare a coded variable to its numeric code (`q5 == 1`), never to its label. Never quote a value: a number compared with quoted text is compared as text, so `q5 == "yes"` never matches, `q5 != "yes"` matches every answered facility, `q5 == "1"` matches 1, and `x < "5"` is true for 10. An option whose code is text reads as missing.',
    "- select_multiple: the question has no variable of its own. Each choice is a variable `{question}_{choice}`: 1 when the choice was selected, 0 when it was not, and blank when the question was unanswered. Its unselected choices hold -99 only when the answer includes the code -99. A choice whose code is negative cannot be named in code. Text questions are never available.",
    "- The filter: a facility whose filter is false or missing is left out of the denominator. A filter needs indicator code in the same round.",
    "- Missingness: the indicator is missing for a facility when its expression is. AND and OR are three-valued, so a blank on one side can still give a definite answer (`a == 1 OR b == 1` is yes when `a` is 1, whatever `b` holds).",
    "- Sentinel codes, before the code runs: a refused code is always blanked. A don't-know code on an integer or decimal variable is always blanked. A don't-know code on a select variable is blanked, unless the run treats don't-know as No and the indicator is binary; then it stays, and it fails a positive test. Other, not-applicable and question-specific codes are real answers and stay, also inside a numeric sum. A variable with no classified option, of any type, has -999999 always blanked and -99 handled as a select variable's don't-know code.",
    "- The run's don't-know setting is not visible here, so code must be right under both settings. Test positively for yes (`x == 1`, `x >= 3`), never with a negation (`x != 2` counts a kept don't-know as meeting the condition), in the filter too.",
    "- References: an id that is an indicator's id is read as that indicator's per-facility value. Never make indicators name each other in a cycle: it shows as an error on every indicator in it, and a cycle fails the whole run. Under the default setting an indicator whose dependency fails is skipped. A variable blank in every round is unknown to the run: under the default setting an indicator naming it is skipped, otherwise it fails the run.",
    '- Variant groups: an indicator with a group also has, per round, code for each item of the group, a per-item breakdown of the same measure ("provides vaccination" by campaign, routine). The round\'s filter, the type and the aggregation apply to every item. The indicator keeps its own code: the overall value is never derived from the items, which may overlap. Item code may name the indicator itself.',
    "- Rounds: a question that changed between rounds shows as a different label or different options for the same variable. Keep the code identical across rounds, and differ a round only where its question changed.",
    "",
    "## Scope",
    "You cannot create, rename or reorder categories, sub-categories, service categories, variant groups or items: assign only what already exists, and say so if asked to create one.",
    "",
    "## How to work",
    "1. Read current state before writing, including the variables the code will name and their options, so you act on what is really there, including edits made earlier in this conversation.",
    "2. After writing code, read the indicator back and fix every error its rounds show: unknown variables, syntax, a filter or variant code without indicator code, a cycle. Treat a result-type warning (a `binary` indicator whose code is not a yes/no condition) as a mistake to fix.",
    "3. When intent is genuinely ambiguous (wording, which variables, which measurement, which category), ask the user before writing.",
    "4. Be concise. Summarise what you changed and what still needs attention.",
  ].join("\n");
}
