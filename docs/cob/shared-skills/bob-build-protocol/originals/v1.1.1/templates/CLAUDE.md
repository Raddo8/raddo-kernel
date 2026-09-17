@AGENTS.md

# CLAUDE.md · {{PROGRAM_TITLE}}

SCOPE: {{FLEET or TENANT}}. This file exists because Claude Code reads CLAUDE.md. Everything that governs how an agent works in this program lives in `AGENTS.md`, imported on the first line above, so the two never drift. Add here only what is specific to Claude Code on this program.

## Skills to load
- `bob-build-protocol` (the loop, the gates, the playbooks).
- {{mechanism playbook, e.g. `playbooks/single-file-html-build.md`}}.

## Permissions shipped with every program (not a placeholder)
Put this in `.claude/settings.json` in the program folder. It keeps the builder hat out of the evaluator's checks mechanically, so the rule does not depend on prose.
```json
{
  "permissions": {
    "deny": [
      "Read(./evaluator/**)",
      "Edit(./evaluator/**)",
      "Write(./evaluator/**)",
      "Bash(git show*evaluator*)",
      "Bash(cat *evaluator*)"
    ]
  }
}
```
The evaluator hat runs from a separate session whose settings do not carry this deny list. A Stop hook that runs `./init.sh` before the pass may end is recommended; when it fails, the pass is not over.

## Hooks specific to this program
- {{Any hook that runs the basic check before a commit, or blocks a deploy without the gate.}}

## Local overrides
Put per-machine settings in `CLAUDE.local.md`, never here.
