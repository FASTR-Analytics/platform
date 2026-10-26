# PLAN: HFA indicator code is the platform's expression language, not R

**Status:** code done, steps 1 to 4 reviewed and passed; the manual work after
the deploy remains. **Next step:** the manual work after the deploy, below.

## Rollout

- Steps 1 to 4 ship as one deploy. Migration
  `server/db/migrations/instance/220_hfa_code_in_list.ts` runs on first boot and
  rewrites stored `%in% c(...)` to `IN (...)`. It is idempotent: a row with no
  `%in% c(` is untouched, and a rewritten row contains none.

## Manual work after the deploy

1. Resource hub workbook. In `FASTR-Analytics/fastr-resource-hub`, change the 47
   `r_code__Round 1` cells of `hfa_default_indicators.xlsx` that read
   `x %in% c(...)` to `x IN (...)`. Run a script from this repo's scratchpad
   that applies `rewriteHfaListSyntax(source, "r", "language")` from
   `server/db/migrations/instance/220_hfa_code_in_list.ts`. Then commit and push
   the workbook to that repo. The push waits for the deploy, because the
   previous platform rejects `IN`. After the deploy and before the push, a fresh
   import of the old file shows those 47 rows as syntax errors.
2. Docs site page `ind-r-code` (admin-guide/indicators). Edit it with the title
   and body below, then run `deno task build:help-buttons` here and commit the
   regenerated `lib/help/help_targets.generated.ts`.

### Docs page `ind-r-code`

Title en "Indicator code", fr "Code de l'indicateur". The anchor follows the
title. The numbered rules are a bulleted list on the page.

Body en:

```text
Each Health Facility Assessment (HFA) indicator has code that tells the platform how to calculate the indicator's value for each facility, using the survey data from that survey round. You write the code in a small set of rules, listed below:

(1) Compare a survey variable (a column in the survey data) to a value with == (equal to), != (not equal to), <, >, <= and >=. (2) Combine conditions with AND, OR and NOT. A condition is a test that is either true or false for a facility. (3) Calculate with +, -, * and /, and use parentheses to group parts of a calculation. (4) Check a value against a list with x IN (1, 2), which is true when x is 1 or 2. Use x NOT IN (1, 2) to exclude those values. (5) Write text values in quotes, as in sh_03 == "c".

The code of a yes/no indicator is a condition, such as q5 == 1. The code of a numeric indicator is a calculation that gives a number, such as staff_doctors + staff_nurses. The optional filter code is a condition that limits which facilities are included in the indicator. The code accepts nothing else, so you cannot use functions such as abs(). The editor checks the code as you type and shows where each error is.
```

Body fr:

```text
Chaque indicateur d'évaluation des établissements de santé (HFA) a un code qui indique à la plateforme comment calculer la valeur de l'indicateur pour chaque établissement, à partir des données de l'enquête du cycle concerné. Vous écrivez ce code à l'aide d'un petit ensemble de règles, présentées ci-dessous :

(1) Comparez une variable d'enquête (une colonne des données d'enquête) à une valeur avec == (égal à), != (différent de), <, >, <= et >=. (2) Combinez des conditions avec AND, OR et NOT. Une condition est un test qui est vrai ou faux pour un établissement. (3) Calculez avec +, -, * et /, et utilisez des parenthèses pour regrouper les parties d'un calcul. (4) Vérifiez qu'une valeur figure dans une liste avec x IN (1, 2), qui est vrai lorsque x vaut 1 ou 2. Utilisez x NOT IN (1, 2) pour exclure ces valeurs. (5) Écrivez les valeurs textuelles entre guillemets, comme dans sh_03 == "c".

Le code d'un indicateur oui/non est une condition, par exemple q5 == 1. Le code d'un indicateur numérique est un calcul dont le résultat est un nombre, par exemple staff_doctors + staff_nurses. Le code de filtre, facultatif, est une condition qui limite les établissements pris en compte pour l'indicateur. Le code n'accepte rien d'autre, donc vous ne pouvez pas utiliser de fonctions comme abs(). L'éditeur vérifie le code pendant la saisie et indique l'emplacement de chaque erreur.
```

## Rollback

Rollback is a redeploy of the previous image. Migrated rows read `IN (...)`,
which the previous validator reports as an unknown variable `IN`. The previous
generator splices that text into R unchanged, so m010 fails on those indicators
until the rows are rewritten back. The reverse rewrite is
`rewriteHfaListSyntax(source, "language", "r")` in
`server/db/migrations/instance/220_hfa_code_in_list.ts`.
