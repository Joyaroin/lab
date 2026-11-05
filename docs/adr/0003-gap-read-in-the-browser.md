# The gap is read in the browser

The meter's gap comes from the public morioh-cho-gitops commit history, read by the visitor's browser
through GitHub's API: deploys to staging since the last promotion to prod. So the site stays static,
with no backend to run and no route into the cluster, and nothing private is exposed.

Argo CD reverts hand edits, so true drift is always zero, and there is no Prometheus to query. The
staging to prod gap moves on its own. GitHub allows 60 anonymous calls an hour per IP, so a failed
call falls back to a value saved at build time, and the meter says the reading isn't live.
