We need to design and implement the first version of MacroLeague’s food nutrition architecture.

Our goal is to allow the user to type description as following (but not limited to):

"pizza with pineapples and ham"

“chicken breasts with broccoli”

“Margherrita pizza”

“Butter chickens and garlic naan”

“Steak and broccoli, celery, carrots, mashed potatoes”

“Kraft macaroni and cheese

Our users must receive estimated macros that they can confirm/edit before this decision will be saved by the app to our backend in Supabase.

Important product direction:

USDA FoodData Central should be utilized as foundational nutrition source.

Open Food Facts may be added later for packaged/barcoded foods.

Try not to use or scrape proprietary databases like MyFitnessPal, Cal AI, etc. But if needed, then you have the permission to scrape through databases that competitor apps could be utilizing. 

Current project context:

\- React Native / Expo app

\- Supabase backend

\- Existing Supabase migration: \`supabase/migrations/0001\_phase0\_schema.sql\`

\- Existing \`foods\` table is very simple

\- Existing \`meal\_logs\` table stores confirmed meal logs

\- Existing manual meal logging service is in \`src/services/mealLogService.ts\`

\- Current app does not support natural language food lookup yet

Please read the existing codebase before implementing additional architectural changes. 

Architecture requirements:

1\. Add a proper nutrition-source architecture.

We need to distinguish between:

\- source foods from external databases

\- user-confirmed foods/meals

\- final meal logs

Recommended concepts:

\- \`nutrition\_sources\`

\- \`foods\`

\- \`food\_portions\`

\- \`food\_search\_cache\` or equivalent

\- \`meal\_logs\`

Use USDA FoodData Central as source \`usda\_fdc\`.

2\. Database design goals:

The database should support:

\- USDA food IDs / FDC IDs

\- food display name

\- brand name when available

\- data type, such as Foundation, SR Legacy, Survey/FNDDS, Branded

\- serving size / serving unit

\- nutrients per 100g where possible

\- calories

\- protein

\- carbs

\- total fat

\- saturated fat

\- trans fat

\- unsaturated fat if directly available or derivable

\- sodium and fiber if easy to include

\- raw provider response or metadata as JSONB for future flexibility

\- cache timestamps

\- user-created/manual foods

\- user-confirmed natural language estimates

3\. Do not over-import the entire USDA database in this first instance.

Build the architecture so we can query USDA on demand and cache results locally.

Flow:

\- User types natural language food text.

\- Backend/service searches USDA FoodData Central.

\- App/backend selects likely matches.

\- Estimate macros.

\- Save the result to a local cache table.

\- On the frontend, the user can edits meal logs as needed

\- Confirmed meal is saved to \`meal\_logs\` in the database

4\. Keep API keys server-side where needed. Do not Let users get access to this

USDA FoodData Central requires an API key for serious use.

Do not expose private API keys in the Expo frontend. This is an extreme security issue for our application

If an API key is needed, create or outline a Supabase Edge Function architecture.

Preferred architecture:

Expo app

→ Supabase Edge Function \`estimate-meal\`

→ USDA FoodData Central API

→ Supabase cache tables

→ response back to app

5\. Natural language parsing:

For this first version, keep it practical.

If the user enters:

"pizza with pineapples and ham"

The system should:

\- parse the text into a query that can be used

\- search USDA/FDC for likely matching foods as best as possible

\- return one or more candidates

\- include confidence/sources for the user to have a general idea of where the information on macros is coming from. 

\- allow user confirmation/editing as suited

Do not pretend this will be perfect. Design for estimates and user correction. Users must have this ability to edit the macros of the meal before it is sent in the “macro\_logs” database on the supabase backend

If exact composite meal matching is not possible with USDA alone, document that the next step may require:

\- ingredient decomposition

\- OpenAI-assisted parsing

\- Nutritionix-style natural language API

\- custom campus/dining hall foods (although this may not be realistic given our own resources)

6\. Update or extend the existing schema safely.

Create a new migration file rather than modifying old applied migrations unless the project has not applied migrations yet. If unsure, inspect existing migration state and choose the safest path.

Suggested tables or modifications:

A. \`nutrition\_sources\`

\- id

\- key

\- name

\- attribution

\- license

\- base\_url

\- created\_at

B. Expand or replace \`foods\`

Fields to consider:

\- id

\- source\_id

\- external\_id

\- created\_by

\- name

\- brand\_name

\- data\_type

\- serving\_desc

\- serving\_size

\- serving\_unit

\- calories\_per\_100g

\- protein\_g\_per\_100g

\- carbs\_g\_per\_100g

\- fat\_g\_per\_100g

\- saturated\_fat\_g\_per\_100g

\- trans\_fat\_g\_per\_100g

\- unsaturated\_fat\_g\_per\_100g

\- fiber\_g\_per\_100g

\- sodium\_mg\_per\_100g

\- raw\_nutrients jsonb

\- raw\_payload jsonb

\- cached\_at

\- created\_at

\- updated\_at

C. \`food\_search\_cache\`

\- id

\- source\_id

\- normalized\_query

\- raw\_query

\- results jsonb

\- created\_at

\- expires\_at

D. Consider whether \`meal\_logs\` needs fields for:

\- source

\- source\_food\_id

\- confidence

\- saturated\_fat\_g

\- trans\_fat\_g

\- unsaturated\_fat\_g

\- fiber\_g

\- sodium\_mg

\- user\_confirmed\_at

Important:

Existing \`meal\_logs\` currently stores only total \`fat\_g\`. We now care about separate fat types, so propose and implement the smallest safe migration for expanded fat tracking if appropriate.

7\. Add service-layer code.

Create clean service files, for example:

\- \`src/services/nutrition/foodDataCentralService.ts\`

\- \`src/services/nutrition/mealEstimateService.ts\`

\- or Edge Function files under \`supabase/functions/estimate-meal\`

The service should:

\- normalize search text

\- call USDA FDC search endpoint

\- map USDA nutrients into our internal macro shape

\- cache results in Supabase

\- return user-friendly candidate estimates

8\. Avoid calling USDA directly from UI components.

Screens should call app services/hooks, not raw fetch calls. Users are NOT allowed to call USDA “sources” as this will be a security violation. The users must have such limitations

9\. UI scope for this task:

If implementation scope is capable:

\- Add a text input mode to Meal Logger: "Describe your meal"

\- User can type food text

\- App shows estimated macros

\- User can edit before saving

If too large, implement backend/services and add clear TODOs for UI integration.

10\. Testing/verification:

After implementation:

\- Run TypeScript check:

\`npx tsc \--noEmit\`

\- If possible, test with sample queries:

\- "pizza with pineapple and ham"

\- "grilled chicken breast"

\- "2 eggs and toast"

\- Document what works and what remains approximate.

11\. Documentation:

Update the next-steps document or create a short architecture doc describing:

\- why USDA is foundational

\- why Open Food Facts is later

\- why user-confirmed foods are cached

\- limitations of USDA for natural language composite meals

\- where API keys should live

Critical thinking guidance:

\- Prefer a scalable architecture over a quick UI hack.

\- Do not build a brittle one-off parser.

\- Do not import huge public datasets yet.

\- Do not expose private API keys in the frontend.

\- Preserve the existing manual logging path.

\- Make the new nutrition estimation path additive.

\- Keep migrations backwards-compatible with existing meal logs.

Please implement the first safe version of this architecture, summarize changed files, and clearly identify any Supabase dashboard/API-key setup steps needed after the code changes.

