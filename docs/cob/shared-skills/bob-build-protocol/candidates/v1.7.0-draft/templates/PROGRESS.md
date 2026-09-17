# PROGRESS.md · {{PROGRAM_TITLE}}

Newest entry first. One entry per pass, in the update-record shape. Times in the principal's timezone, taken from the clock and never from memory, with the zone named. Every entry is written during the pass, not at close.

## {{YYYY-MM-DD HH:MM zone}} · pass {{n}} · {{who ran it}}

```
program: {{id}} · version {{#.###.#}} · pass {{n}} · protocol {{1.6.0}} · trigger: {{invoked | commanded-continuous | event | run-desk}}
started: {{HH:MM zone}} · finished: {{HH:MM zone}} · BOB time: {{minutes}} · waiting on a person since last pass: {{hours or none}}
health: {{on track | at risk | off track}} · reason: {{required unless on track}}
appetite: {{hours}} / {{credits}} · used: {{hours}} / {{credits}}
units: {{verified}} of {{total}} · passed own check but failed the independent one: {{n}} of {{verified}}
scopes: {{name}} · how far along: {{0-100, under 50 means the approach is still being proven}} · done {{n of m}} · evidence {{link}}
blockers: {{item, who, since when}}
next: {{one unit}}
needs a person: {{item, recommended action, default, deadline}} or none
```

**Finished (proven by the builder):** {{unit ids and their proof refs, or none}}
**Independently checked this pass:** {{unit ids with pass or fail and the evaluator's critique ref, or none}}
**In process:** {{unit id, who holds it, what is left}}
**Planned next:** {{unit id, behind gate {{name}} or none}}
**Needs a person:** {{item, recommended action, default, deadline; or none}}
**Denominator:** {{n of m units verified across all milestones}}
**Written back this pass:** {{control surface republished y/n · log.json · defects.json · decisions.json · effort.json · thread update link}}
**What I would do differently:** {{one line}}
