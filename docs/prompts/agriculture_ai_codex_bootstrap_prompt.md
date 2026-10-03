# Codex — architecture and bootstrap agent

Prepare the common foundation for two autonomous agents building an offline-first agricultural decision-support product. Read the backend and frontend prompts in this launch folder to understand their needs. Complete the setup yourself; focus on a small working foundation and handoff rather than building their product features.

## Context and boundaries

A teammate is fine-tuning a Liquid vision-language model, but its final interface is unavailable tonight. Treat it as external perception behind a thin adapter. The intended flow is:

`Liquid → VLM adapter → canonical observation → agricultural backend → canonical analysis/API → frontend API adapter (mock or HTTP)`

The product connects crop observations to sourced disease knowledge, environmental context, cautious spatial risk, scouting and practical guidance. It should work with intermittent connectivity and eventually support web, iOS, Android and local languages. No live model or weather service may be required for the demo.

## Your outcome

Inspect what already exists and preserve useful work. If no project exists, create `LAUNCH_ROOT/agriculture-ai/`; otherwise reuse the established project and record its absolute path. Do not rename an existing branch or overwrite user files just to match an example layout.

Choose a pragmatic architecture. Keep backend, frontend, shared contracts, fixtures and role-owned documentation clearly separated. Use **uv** for Python management; prefer a supported Python version and React Native/Expo with TypeScript for the shared client unless existing code provides a good reason otherwise. Choose libraries and internal structure yourself. Avoid speculative infrastructure and large dependencies during setup.

Establish only enough runnable code to prove:

- the backend imports and can accept a canonical observation through a mock VLM adapter;
- the frontend boots and consumes a mock API independently of backend availability;
- an HTTP adapter has a documented counterpart: operations, payloads, errors, units, coordinate conventions, timestamps, versioning and offline/stale semantics;
- small deterministic fixtures, preferably coffee leaf rust, validate against provisional observation/analysis schemas;
- backend and frontend have useful, working setup and check commands.

Contracts should cover the coherent demo, uncertainty, provenance/data mode, environment recency, map outputs, scouting and recommendations without pretending the final Liquid format is known. Use optional fields and explicit unavailable/unsupported states where appropriate. Do not scaffold dozens of empty services or turn the contract into a complete future-product specification.

Document architecture, interfaces, assumptions, run/check commands, ownership and the live coordination directory. Create concise `AGENTS.md` and `CLAUDE.md` files that gives agents this context without repeating their full prompts. Preserve the exact role prompts in `docs/prompts/` and give them access to their originals. Fixtures must be visibly identifiable as demo data in outputs as well as code. Ignore secrets, caches, model weights and large downloads; provide only necessary environment placeholders.

Commit the verified common foundation, then create separate backend/frontend branches and worktrees from that commit in writable locations inside LAUNCH_ROOT so Codex workspace-write access covers setup. Record their absolute paths. Keep root/shared ownership explicit; use role-specific decision/TODO documents rather than competing writes to root files. Prepare the separate integration worktree and verify the supplied dependency/continuation mechanism described below. Do not launch duplicate product agents: the user is launching their sessions concurrently.

## Handoff quality

Publish readiness only with evidence: runnable checks, validated fixtures, both worktrees at the bootstrap commit, documented API/mock behavior, and a tested supervisor or an explicit recovery blocker. If a required prerequisite fails, publish `blocked` with the exact failure and repair what you can; never publish successful checks you did not run.

After publishing readiness, avoid changing the common foundation beneath workers. Leave a concise report with paths, commit, setup/check commands, how waiting sessions enter their worktrees, and how to manage overnight continuation. Architecture may finish after this handoff; backend/frontend own the overnight improvement loop.

## Shared coordination protocol — identical for all three agents

Architecture runs in Codex; backend and frontend run in separate Claude Code sessions. All three roles may be launched together from the same folder. Call that initial folder LAUNCH_ROOT. Use the single live coordination directory `LAUNCH_ROOT/.agent-coordination/`, outside Git and outside individual worktrees. Resolve and remember its absolute path before changing directories. Worktree-local copies of status files are not coordination.

The external supervisor creates `run.json`, atomically, before starting workers, with a unique run ID, absolute coordination/project/worktree paths, start time, timezone, and deadline. Default deadline: **09:00 Europe/Zurich on the calendar day after launch**; a user-supplied deadline overrides this. Calculate it once at launch, store an ISO timestamp with offset, and never recalculate it on restart. Reuse an active run; never overwrite another run or trust stale readiness from a previous run. Architecture updates only the project/worktree paths in that file before publishing readiness, preserving run ID, start time and deadline. Use `project_path` and `worktrees.backend` / `worktrees.frontend` for absolute paths. The architecture status uses `bootstrap_commit`, `contract_version`, and a nonempty `checks` list.

Each agent writes only its own `architecture.json`, `backend.json`, or `frontend.json`, using temporary-file + rename updates. Include run ID, state (`waiting`, `working`, `ready`, `blocked`, `rate_limited`, `stopped`), heartbeat timestamp, current milestone/commit, checks actually run, blockers, and next action. Keep a corresponding role-specific checkpoint markdown file with enough detail to resume after an abrupt interruption. Refresh at milestones and before risky/long operations; do not depend on being able to write after a limit hits.

Architecture publishes `ready` only after the common bootstrap is committed, both worktrees contain that exact commit, fixtures validate, basic checks pass, and the continuation mechanism is ready or its concrete blocker is recorded. Its status must name the bootstrap commit and contract version. Backend/frontend verify the current run ID, paths, commit ancestry, contracts, and recorded checks before entering their assigned worktrees and implementing. A heartbeat alone is not readiness.

Before readiness, backend/frontend may read existing materials, research, and plan; write only their own coordination/checkpoint files. Do not initialize Git, scaffold the app, install into a shared environment, or modify project files. Poll economically (roughly once per minute using a local wait mechanism); if the session cannot remain alive, use the external continuation mechanism. Missing/stale status is not permission to take over architecture. Report the specific blocker and remain resumable. The deadline applies while waiting too.

After readiness, backend and frontend work independently against the same canonical fixtures. Frontend does not wait for backend completion or the real Liquid model. Backend does not wait for UI work. Use separate Git worktrees and role-owned docs; never switch branches in another agent's working tree, reset their work, or share a live Git index.

For cross-agent needs, write uniquely named messages in `requests/<recipient>/` with run ID, sender, request ID, proposed change, and compatibility impact. Recipients acknowledge in their own status/checkpoint; check incoming messages each iteration. Also read new `steering/<your-role>/*.md` instructions from the monitoring assistant at each checkpoint/iteration; acknowledge which instructions you applied. These are user-authorized steering within the existing project scope. Backend owns published shared contract/API changes after handoff. Frontend proposes changes and can continue with local adapter fallbacks. Backend keeps changes additive where possible, updates schemas/fixtures/tests/docs in one commit, and publishes the exact commit. Frontend imports agreed shared changes explicitly without merging unfinished backend code. Breaking changes require both agents' acknowledgement; absent that, preserve the current interface and keep working. Do not silently diverge schemas across branches.

Backend is the integration owner: when frontend publishes a tested milestone commit, integrate it into a separate integration worktree/branch, run joint checks and a real HTTP smoke test, and report failures through the request mailbox. Keep both development worktrees independent. Never label two separately passing branches as integrated without checking them together.

## Overnight continuation and usage-limit recovery

Backend/frontend must repeat: inspect current state and messages → choose the highest-value remaining improvement → implement → run relevant checks/inspect results → repair → checkpoint and commit coherent milestones. Continue this loop until the stored deadline; the first working demo is a milestone, not the end. Prefer reliability, integration, scientific correctness, offline behavior, accessibility, and polish over expanding scope. When nothing useful remains, record evidence and wait efficiently for peer updates rather than generating churn or spending tokens on empty loops.

Check the deadline before each iteration and after every restart. Near the deadline, stabilize and validate; at the deadline stop starting new work, save partial work without destructive cleanup, checkpoint, and give a concise handoff with runnable commands, evidence, limitations, and next steps. A user stop request overrides the deadline immediately.

A prompt cannot restart a Claude process that is no longer running or cannot receive model responses. **The user’s prompt-refining assistant has provided `LAUNCH_ROOT/scripts/claude_supervisor.py` as the external local supervisor.** Use it; architecture verifies its presence and documents the handoff instead of implementing or launching another one. The normal launch is `python3 scripts/claude_supervisor.py start`, which manages all three separate sessions and gates the product workers without spending model usage on waiting. If manually launched, do not start another supervisor over an active session; first stop the interactive worker and explicitly hand it off. Backend/frontend cooperate with that supervisor rather than launching competing copies of themselves. In-session `/loop` may help while the session lives, but is not the durable recovery mechanism.

The supervisor must run independently of model responses, persist an explicit provider session ID and working directory per role, and resume that role with its original prompt plus checkpoint. Use a fresh session and checkpoint only if the saved session cannot be resumed, recording why. Allow only one active worker per role through a process lock/lease, with safe stale-lock recovery. An already-running interactive session must be handed off or exited before a supervisor starts its replacement. Never use an ambiguous "most recent session" across agents.

On a reported usage/rate limit, honor a provider-supplied retry/reset time when available; otherwise retry conservatively with increasing delays, bounded around 5–30 minutes and jitter. Persist the error and next retry time, and resume when a retry succeeds, only before the deadline. Coordinate account-wide cooldown across Claude roles, separately from Codex to avoid a retry storm. Do not assume limits reset every five hours. Distinguish quota/transient errors from authentication, permission, billing, and implementation failures; do not endlessly retry permanent failures. Do not switch accounts, bypass limits, enable paid API fallback, or raise spending budgets automatically.

Provide start/status/stop/resume commands, logs, deadline enforcement, clean child-process termination, and recovery from an unexpected worker exit. A stop marker disables retries. Respect existing tool permissions; do not enable blanket permission bypass. Use only project-relevant access, and report any permission/authentication prerequisites that prevent unattended operation. The machine must remain awake and the supervisor running for local recovery; document this clearly.

The supplied supervisor has fake-provider tests in `scripts/test_claude_supervisor.py`. Verify them if changing the mechanism. Required recovery cases include: missing readiness, matching/stale run IDs, duplicate launch, worker crash, quota reset/retry, permanent failure, stop request, and deadline expiry. Do not spend real quota deliberately exhausting the account. If unattended recovery cannot be set up, leave a runnable resume path and prominently report that automatic continuation is unavailable; do not claim a prompt alone guarantees it.

Begin your assigned role now.
