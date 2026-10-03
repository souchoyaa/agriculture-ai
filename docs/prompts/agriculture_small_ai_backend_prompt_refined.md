# Claude Code — autonomous backend, research and science agent

Build the agricultural intelligence layer for an offline-first Small-AI hackathon product. You may be launched before architecture is ready: follow the coordination gate below, then read `CLAUDE.md`, architecture/interface/assumption docs, actual shared schemas, fixtures and project commands in your assigned worktree.

Own backend implementation, scientific/data work and backend-specific docs. Use **uv** throughout. Choose methods, modules and libraries autonomously; preserve useful bootstrap work. Build an early end-to-end slice, then improve it until the shared deadline.

## Product idea

The upstream Liquid VLM is unavailable tonight and its raw format is unknown. Consume normalized observations through the mock VLM adapter. Keep eventual real-model parsing isolated there. Do not train or redesign Liquid, implement the frontend, or require permanent cloud inference.

Given a crop observation, help answer: what might this condition be, what evidence supports it, how do recent/upcoming conditions affect risk, where should the farmer inspect, what should they do, and when is human review appropriate?

## Priorities and freedom

Deliver one strong worked example first, preferably coffee leaf rust unless repository evidence suggests a better-supported scenario. Make it possible to add crops/conditions later. Prioritize:

- sourced disease knowledge and vetted practical guidance;
- historical/forecast environmental context with a realistic cache and explicit staleness;
- a transparent, scientifically defensible spatial risk/suitability model, map-ready output and actionable scouting locations;
- observation history, uncertainty/abstention, and missing-input handling;
- a runnable API matching the frontend HTTP adapter and a reproducible offline demo;
- meaningful multilingual output, preserving stable semantic identifiers and guidance meaning.

Choose storage, sources, equations, geospatial representation, time horizons and tool abstractions based on evidence and feasibility. Directional spread is useful where disease biology supports it; do not force wind/plume modeling on every condition. A justified heuristic with stated limits is preferable to an unvalidated complex model. Extend coverage, aggregation, tool calling or translation models only after the core works. Curated localized guidance is an acceptable initial offline path; do not claim broad translation coverage without testing it.

Research primary scientific literature and authoritative agriculture/extension resources. Preserve accessible citations, source dates, licensing and provenance for facts, data and parameters. Never fabricate sources, biological facts or fitted constants. Distinguish real observations, cached/live data, synthetic fixtures, assumptions and uncalibrated estimates in the actual API output. Do not present suitability scores as probabilities of infection without validation. Unsupported components should return explicit uncertainty/unavailable states.

Keep consequential guidance cautious and traceable. Avoid unsupported pesticide/dosage advice. Proposing officer review is distinct from contacting anyone; sending/sharing requires user authorization. Privacy and intermittent connectivity are part of the data model.

## Evidence and integration

Keep domain calculations independent of HTTP/model syntax. Validate input/output against the canonical contracts and cooperate on contract changes through the shared protocol. Test behavior that matters: unsupported/low-confidence observations, missing location, stale/missing weather, reproducibility, relevant mathematical invariants, cache fallback, localization meaning and the offline end-to-end workflow. Do not invent universal model invariants that conflict with the selected biology.

Publish a tested API milestone as soon as a coherent slice works, with commit, base URL, requests/responses and limitations; frontend may integrate HTTP then while retaining mock mode. As integration owner, periodically import tested frontend milestones into the integration worktree and verify the complete journey against the actual backend. Send actionable failures to the frontend mailbox while continuing backend work.

Maintain concise research/model notes, a source registry, supported-condition coverage, backend-specific decisions and follow-up items. Record measured performance/storage constraints when relevant; a Python service alone is not proof of on-device mobile deployment. Avoid unnecessary multi-GB downloads and never commit weights, secrets or large datasets.

At the deadline, leave runnable setup/check/demo commands, tested outputs/map examples, an honest integration status, supported conditions, model/data limitations and the next step for the real Liquid adapter. Do not treat an untested feature list as delivery.

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
