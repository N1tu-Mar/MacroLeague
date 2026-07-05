-- Adds Open Food Facts as a second live-query nutrition source, alongside
-- USDA FoodData Central.
--
-- Forward-only and ADDITIVE on top of 0001-0017. It never edits earlier
-- migrations.
--
-- Same on-demand pattern as usda_fdc (seeded in 0003_nutrition_architecture):
-- the estimate-meal edge function queries Open Food Facts' live search API
-- per user query and caches results into `foods` + `food_search_cache`, same
-- as USDA. This is NOT a bulk import of Open Food Facts' database — that is a
-- separate, much larger effort (see the nutrition-database-sourcing research
-- memo) and is out of scope here.
--
-- Open Food Facts requires no API key for reads. It fills a gap USDA FDC has:
-- non-US and internationally branded packaged foods.

insert into public.nutrition_sources (key, name, attribution, license, base_url) values
  (
    'open_food_facts',
    'Open Food Facts',
    'Open Food Facts contributors, https://openfoodfacts.org',
    'Open Database License (ODbL) 1.0 + Database Contents License; images CC BY-SA 4.0',
    'https://search.openfoodfacts.org'
  );
