# Public V3 pressure acceptance policy

New `pressure.json` evidence names `policy: "initial-warning-load-strict-v1"` in both the default public lane and `--homepage-only` lane. The runner completes one initial request per route before measured load. A complete initial response with an allowed HTTP status and valid required content may take 3,000 ms or longer; it remains in `warmups` with its actual `initialLatencyMs` and is also listed in `initialLatencyWarnings`. A single initial request has no p95 distribution, so new initial records do not contain `p95Ms`.

Initial request, HTTP status, content, incomplete result, and 10,000 ms deadline failures still stop the run. The subsequent measured `scenarios` retain request counts, completed counts, failures, and `p95Ms`; every scenario must complete all requests with zero failures and p95 strictly below 3,000 ms. A warning never overrides a measured failure. The evidence is written with `status: "failed"` and the fatal `failure` when any gate fails, including when an earlier initial warning was accepted.

Older artifacts have no `policy` or `initialLatencyWarnings`; their `warmups[*].p95Ms` and `passed` fields reflect the former strict one-sample gate. Interpret them under that historical policy, rather than treating an old failed artifact as newly accepted.
