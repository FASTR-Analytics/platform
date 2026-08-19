
I want you to operate in a new branch: tim-branch-restructure

In this branch, I want you to do a big push to restructure the app in the following ways:

I want to do away with the concept of a "project". Rather, I want to think about "products", being (a) slide decks, (b) reports, (c) dashboards, and (d) visualizations. Currently, all of these are within a project. In the restructure, I want to move all of these to instance level under a "Products" page.

The two things that projects currently provide are:

- results package, which gets passed down to products;
- scope (national vs AA2);
- user permissions.

For the restructure, I want to move the results package (runId) and the scope to the product. Essentially, thinks become more granular, with a product (deck, report, etc) having its own pointer to the results package, and its own scope.

I believe all the pieces are in place for this, except perhaps for storage of the package/scope on each product.

RETAIN the current idea of "folders". But... one folder should contain different types of products. So we know longer separate out decks from reports from visualizations from dashboards. Rather, these are all now differet types of product. Folders are a way to organise products.

A good analogy is Google drive. A user has a drive, and they can store Google doc, sheet, or slides, and can nest them arbitrarily in a folder.

For our purposes, let's just have one level of folder. No nesting of folders within folders.

Regarding user permissions - at a later date we can consider product-level permissions. For now, just scrap all project-level permissions. Or at least just ignore them.

BENEFITS...

I want a user to be able to come to the app completely fresh, see a big "CREATE A PRODUCT" button, which asks them to choose viz, deck, report, or dashboard. And then it takes them straight into creating/editing that product. Right now the project layer is a huge source of friction.

This is a big task. I want you to do all the necessary homework for this piece of work. Find what needs to happen. Consider things I have said and things that I missed. Then, write a big PLAN_ document.

I don't want to have to adjudicate 1000 different decisions for this plan. I want to quickly get to a working prototype. However, if there are any big decisions, please put these to me clearly AS YOU PREPARE THE PLAN. DO NOT leave open questions in the plan. Decide all issues before or during writing the plan.

If the plan looks reasonable, we will implement at a later date.

Switch to tim-branch-restructure now before you get started.
