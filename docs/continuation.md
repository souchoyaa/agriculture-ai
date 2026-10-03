# Live supervision and worktree handoff

Coordination directory: /Users/sachagodey/Documents/project/hackaton/.agent-coordination.
The supplied supervisor is /Users/sachagodey/Documents/project/hackaton/scripts/claude_supervisor.py; do not implement or launch another. Current run metadata fixes deadline at 2026-10-05T09:00:00+02:00; never recalculate it on restart. Provider preflight success is recorded in preflight.json. Fake-provider tests exercise control logic, not guarantee future account/network/permission availability.

From launch root:
```sh
python3 scripts/claude_supervisor.py status
python3 scripts/claude_supervisor.py stop
caffeinate -i python3 scripts/claude_supervisor.py resume
# Only for a new unsupervised launch:
caffeinate -i python3 scripts/claude_supervisor.py start
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```
Do not start while this supervised architecture session or interactive workers are active. Manually launched workers must exit and hand off exact session IDs/cwd before replacement. Supervisor records IDs in supervisor-ROLE.json, logs in logs/, owns process leases and shared Claude cooldown (separate Codex cooldown), retries transient/quota failures conservatively, blocks permanent failures, and terminates children at STOP/deadline. resume explicitly clears stop/blocked state: repair prerequisite first. Machine must remain awake and terminal/supervisor running; caffeinate does not protect against reboot/lid closure. After reboot, use resume with existing run/deadline.

Workers are gated locally without model usage while waiting. They enter run.json worktrees.backend/frontend only after matching architecture ready, bootstrap commit ancestry and checks. Both begin at the bootstrap commit. Integration is a third independent worktree owned by backend; cherry-pick tested frontend milestones there, then run both checks and an actual HTTP smoke journey before declaring integrated. Every iteration reads own mailbox/steering, checks deadline, implements highest-value improvement, validates, commits and checkpoints. A first demo is not the deadline. At deadline stop new work and report limitations.

If a prerequisite fails, report exact blocker in own status/checkpoint and use recorded original prompt plus checkpoint to resume. Do not claim that a prompt alone recovers a dead process. Provider permissions/authentication and network can still block unattended work even after successful preflight.
