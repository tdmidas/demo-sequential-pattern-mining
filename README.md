# NextBasket: next-purchase recommendation with sequential pattern mining

A course demo for *Data Mining and Applications*. It is a mock online store whose "Recommended for you" section is
built from frequent sequential patterns mined with **GSP, SPADE and PrefixSpan** on real transaction data
(Online Retail II, UCI). The web UI is in Vietnamese.

## Running the demo

Requires Node.js 20 or later. The processed data and product images are already in `web/data` and `web/public/products`.

```bash
cd web
npm install
npm run build
npm run start        # http://localhost:3000
```

`npm run dev` works for development, but the algorithms run noticeably slower in dev mode; use `build` + `start` for the demo.

Before presenting, open the Store page once so the server mines the default model (about 2 seconds the first time).

## Pages

| Page (UI label) | What it shows |
|---|---|
| **Store** (Cửa hàng) | A shopping site. Pick a customer account; "Recommended for you" lists the next products they are likely to buy. A "Technical view" switch (top right) reveals the rule behind each recommendation, lets you switch the mining algorithm and thresholds, and compares against the customer's real next order. |
| **Pattern mining** (Khai thác mẫu) | Runs GSP, SPADE and PrefixSpan side by side with live timers, cost counters, and the resulting patterns and rules. Two presets: 3% (all three finish) and 1.5% (GSP and SPADE hit the 10-second limit). |
| **Illustration** (Minh hoạ) | Traces one real recommendation back through the real data in 4 stages: data, pattern mining, rule generation, scoring. Each dot is one of the 3,959 customers; dots move and recolour to show how each algorithm counts the same pattern. A 4-customer toy example is at `/steps/mini`. |
| **Comparison & limitations** (So sánh & hạn chế) | Benchmark charts: pattern explosion as minsup drops, runtime and memory per algorithm, catalogue coverage, and offline accuracy against two baselines. |
| **Data** (Dữ liệu) | The preprocessing pipeline as a funnel from raw rows to sequences, with example sequences. |

## Demo script (about 8 minutes)

| Time | Page | Actions | Talking points |
|---|---|---|---|
| 1 min | **Data** | Scroll through the pipeline steps and the example sequence at the bottom | 1.07 million raw transaction rows become 3,959 purchase sequences over 300 products. Each customer is a sequence and each order is an itemset. Every customer's last order is held out for evaluation. |
| 2 min | **Store** | 1. Look at "Recommended for you" for the selected customer. 2. Add 1-2 items to the cart and place the order: the recommendations change. 3. Switch the account to "New customer". 4. Pick a customer again, turn on **Technical view**, click "Why?" and "Show real next order". 5. Switch the mining algorithm between GSP, SPADE and PrefixSpan: the recommendations stay the same, only the runtime and cost line changes | This is the application: shoppers only see recommendations with a plain-language reason. A new customer has no history and only gets best-sellers (the cold-start limitation). The technical view shows that each recommendation is a sequential rule with support, confidence and lift, and can be checked against the real order. |
| 1.5 min | **Illustration** | Pick a recommended product in the top strip, press "Play". Switch between GSP, SPADE and PrefixSpan | Each dot is a real customer (hover to see the ID). GSP sweeps the whole database once per level after generating hundreds of thousands of candidates; SPADE joins two id-lists without reopening the data; PrefixSpan shrinks the data to customers who contain the prefix. All three reach the same support. |
| 2.5 min | **Pattern mining** | 1. Click the **3%** preset: all three finish with the same 4,532 patterns. Open the GSP card's "Reading the result" section. 2. Click the **1.5%** preset: GSP and SPADE are stopped after 10 seconds, only PrefixSpan finishes. Open the PrefixSpan card | Same result, different cost. GSP must test 134,850 candidates at level 2 alone and scans the database once per level. SPADE scans once but keeps id-lists in memory. PrefixSpan generates no candidates, but on dense data it still counts millions of extensions in projected databases. |
| 1.5 min | **Comparison & limitations** | Go through the 4 sections. In section 3 toggle between "Including repurchases" and "New products only" | The number of patterns explodes as minsup drops (101 to 56,000); a high minsup means most of the catalogue is never recommended. Sequential patterns reach 70% HitRate@10 versus 60% for association rules and 46% for best-sellers; counting only new products, association rules are slightly ahead. Order only helps when behaviour really is ordered. |

Notes for presenting:

- The 1.5% preset takes about 27 seconds (two 10-second cut-offs plus PrefixSpan). The timer on each algorithm card keeps running, so you can talk while waiting.
- Runtimes depend on the machine. If the presentation machine is fast enough that SPADE finishes at 1.5%, drag the minsup slider down to 1%.
- The sample accounts are the 9 customers whose recommendations hit their real next order most often and 3 customers with no hits at all, so there are good and bad examples.
- The Illustration page runs all three algorithms on its first load (about 10 seconds), then serves from cache.

## Points to state clearly in the report

- **The three algorithms return the same pattern set.** Switching algorithm does not change the recommendations, only the computational cost.
- **Correctness is checked** by `npm run verify`: (1) on the paper's example database and 40 random databases, all three algorithms match brute-force enumeration exactly and give the 53 patterns reported in the PrefixSpan paper; (2) on the real data, the three agree in 4 configurations, and the support of more than 700 sampled patterns is recounted directly with no mismatch; (3) rule support, confidence and lift are recomputed independently. There is no cross-check against an external library yet; to do one, run SPMF on `web/data/sequences.spmf.txt` and then `node scripts/verify.ts --spmf <result file> 5 3`.
- **Recommendation quality** is compared against two baselines: unordered association rules and a best-seller list, using leave-last-basket-out evaluation (HitRate@10, precision, recall, MRR, coverage).
- **Closed patterns give no reduction on this data** (the closed count equals the full count), because with about 4,000 customers almost no two nested patterns have exactly the same support. The Comparison page uses maximal patterns to illustrate reduction.
- **"Memory" figures count entries in auxiliary structures** (candidates, id-lists, projection pointers) as counted by each algorithm, not RAM measured from the operating system.
- **GSP here has no max-gap, min-gap or sliding window** as in the original paper; all three algorithms cap the number of items per pattern (default 3).
- **Recommendation score** = rule confidence × 0.85^gap, where gap is how many orders ago the rule's antecedent was last matched (window of 5 orders); each product keeps its best score, and best-sellers fill any remaining slots.
- **Product images** come from an image search on product names because the dataset has no images. Some may not match the product exactly, and they belong to their original sites: use them only in class.

## Project structure

```
pipeline/preprocess.py     Preprocessing: raw xlsx -> sequence database (web/data)
pipeline/fetch_images.py   Downloads illustrative product images (web/public/products)
data/raw/                  Original UCI files (not committed, see below)
web/lib/mining/            gsp.ts, spade.ts, prefixspan.ts, rules.ts (rules, recommendation, evaluation), explain.ts
web/lib/server/store.ts    Loads data and caches mined models on the server
web/app/                   Pages: Store, Pattern mining, Illustration, Comparison & limitations, Data
web/app/steps/mini/        4-customer toy example stepping through every candidate and join
web/components/steps/      Animated customer dot grid used by the Illustration page
web/app/api/               catalog, recommend, mine, evaluate, explain
web/scripts/verify.ts      Checks that the three algorithms are correct and agree
web/scripts/benchmark.ts   Runs the experiments, writes web/data/benchmark.json
```

## Rebuilding from the raw data

```bash
# 1. Download Online Retail II to data/raw/online_retail_II.xlsx
#    https://archive.ics.uci.edu/dataset/502/online+retail+ii

# 2. Python environment (only needed for the pipeline)
py -3.11 -m venv .venv
.venv/Scripts/python.exe -m pip install pandas openpyxl

# 3. Preprocess (reading the xlsx takes 2-3 minutes the first time, later runs use a cache)
.venv/Scripts/python.exe pipeline/preprocess.py --top-items 300 --min-baskets 2 --max-baskets 20

# 4. (optional) download product images, about 10 minutes
.venv/Scripts/python.exe pipeline/fetch_images.py

# 5. Verify and rerun the experiments
cd web
npm run verify
npm run benchmark     # a few minutes, writes data/benchmark.json
```

Preprocessing steps: drop rows without a customer ID; drop cancellations and rows with non-positive quantity or price; keep only regular product codes (5 digits plus an optional letter); normalise product names; keep the 300 products bought by the most distinct customers; group each customer's purchases on the same day into one order; keep customers with at least 2 orders (at most the last 20); hold out each customer's last order as the test set.

Changing `--top-items` or the filter thresholds changes how dense the data is, and therefore both the runtimes and the numbers in the demo script; rerun `npm run benchmark` afterwards.
