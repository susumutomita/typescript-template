# Common verification contract

The shared part is the entry point and receipt, not a replacement test framework.
Native Make, Bun, Go, browser and VM checks stay in their owning repositories.
No agent role, external service, merge permission or dependency is installed.

## Run

Python 3.10+ on Linux or macOS is required. Install the repository's reviewed,
locked development dependencies first. In this template:

```sh
make verify
make verify_release
```

`fast` runs the existing `make ci_local`. The name denotes the ordinary lane,
not a latency promise. `release` also records a blocked application acceptance
check: a template has no deployed application to verify. Neither profile skips
an absent executable and calls it success.

`verification.json` maps feature IDs and source paths to check IDs, environment
requirements and argv arrays. Paths are discovery hints, not automatic changed-file
selection. The complete selected profile always runs. Add a feature's actual
acceptance checks when scaffolding a consuming application. This does not replace
`enforcement-registry.md` or its existing detector tests.

## Evidence

Each invocation creates a new directory outside the checkout, prints its location
and saves `receipt.json` plus command logs. An explicit `--output` must be a new
external directory. Results include HEAD before/after, dirty state, map digest,
command argv, exit code, log digest and duration.

- `passed`: the selected command returned zero.
- `failed`: nonzero exit or timeout.
- `blocked`: missing executable or explicitly unavailable acceptance environment.
- `not-run`: initial command state, never accepted as a successful check.

Overall success additionally requires the same clean HEAD before and after, and
an unchanged map. A dirty working-tree run still records command outcomes but is
blocked as commit evidence. Commit the candidate and rerun for exact-HEAD evidence.
Generated ignored files are not source provenance; fixtures and toolchain versions
remain the repository's responsibility. A cooperating runner cannot prove that a
command tested its claimed behavior, detect transient restored edits, or resist a
malicious command that forges its own evidence. Review the commands and assertions.
A receipt is not independent review, remote CI, merge authorization or deployment.

Commands execute directly, without shell interpolation, from the repository root.
On timeout the runner kills the command's process group. Checks must own and clean
up their fixtures; killing a process cannot undo external changes. Do not register
provisioning, production or destructive commands without their separate approval.
Logs can contain application data: review and redact before sharing. The runner
does not upload them or read credential files.

## Adopting existing repositories

The example maps are explicit **partial adapters**, not claims of full validation:

```sh
python3 scripts/verification/verify.py fast \
  --root /path/to/TenkaCloud \
  --map examples/verification/tenkacloud.json
python3 scripts/verification/verify.py fast \
  --root /path/to/TenkaCloudSimulator \
  --map examples/verification/simulator.json
```

Use a reviewed checkout of this runner. Review the consuming repository's current
commands first. Each receipt hashes the supplied map; external example maps are not
attested by the consuming repository's HEAD. Copy a reviewed map into that repo
when adopting permanently. Existing Simulator factory acceptance remains the
source of its own stronger test-level evidence and must not be replaced by this
command-level receipt. Formal checks remain required for relevant model changes.
VM/hosting release lanes remain blocked until their real acceptance is connected.
Do not weaken them to turn the receipt green.

No cross-repository CI rollout is performed here. First validate these adapters
against real consumer checkouts, then version the shared runner if the contract
proves useful. Avoid copying all TypeScript-specific rules into a Go project.
