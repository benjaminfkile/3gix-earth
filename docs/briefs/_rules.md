## Rules for every task in this project

1. This repository is public. No hostnames, IP addresses, account ids, API keys, secrets, or other infrastructure identifiers anywhere: code, docs, comments, scripts, tests, commit messages. Keys and addresses come from environment variables (`docs/design.md` section 2) and are never committed.
2. No em dashes or en dashes in anything you write. Use commas, periods, or colons.
3. The contract is `/workspace/docs/design.md`; read it whole before writing code. The renderer API is `/context/3gix-renderer/docs/api.md` and its rules are `/context/3GIXHub/docs/architecture/rendering.md` section 8. When the contract and this brief disagree, the contract wins and you note the disagreement in your final summary.
4. The renderer is used only through the public exports of the `3gix-renderer` package at the pinned release tarball. Never copy renderer source into this repository and never change the renderer, the core, or the hub. If the API lacks something you need, stop that item and report it in your summary.
5. SI units inside the code (meters, radians, seconds); display units only in the UI.
6. TypeScript strict mode. Material UI for every control. `npm run ci` must print `ci ok` before you finish.
7. Do not add anything under `.github/`. Do not add a LICENSE. Commit `package-lock.json`.
8. Do not skip, ignore, or weaken a failing test to finish. If something cannot be made to pass, leave it failing, say exactly why in your summary, and finish everything else.
9. Docs in the repository describe the code as it now is. The README says how to run it.
10. Commit working progress as you go. Uncommitted work is lost if the time cap is hit.
11. Grunt stops every attempt after 30 minutes and anything not finished then is lost. Stay inside this brief's scope, build and test as you go, and do not start optional extras. Do the numbered items in order.
12. The container has no GPU, no WebGPU, and no hub. Tests mock the package's `Renderer`. Anything that needs a real browser is checked by the reviewer; say in your summary what you could not check.
13. Run `npm run ci` in the foreground at the end and do not end your turn while anything runs in the background. Your last message must be the full summary: what you built, the commit, the `npm run ci` result, and anything left open.
