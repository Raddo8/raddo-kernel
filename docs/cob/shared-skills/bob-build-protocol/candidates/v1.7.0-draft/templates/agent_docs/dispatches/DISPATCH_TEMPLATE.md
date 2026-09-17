# Dispatch · {{name}} — STAGED, NOT FIRED

SCOPE: {{FLEET or TENANT}}. A dispatch is a credit-consuming message. It is written in full here and **staged**. The builder never fires it. It fires only when the queue item was raised by the principal's own press and carries its approval, and then only this text, unchanged.

Status: **staged** · written: {{YYYY-MM-DD HH:MM zone}} · program version: {{#.###.#}} · unit: {{U#.#}}

## What it changes
{{The exact files and lines it touches, and nothing else. No incidental edits, no reformatting, no drive-by fixes.}}

| file | lines | change |
|---|---|---|
| {{path}} | {{n-m}} | {{one line}} |

## Cost
- **Estimated credits:** {{n}}
- **Estimated from:** {{the last comparable send, named, with its actual cost}}

## Window
- **Requested by the principal for:** {{date and time, zone named}}
- **Base hash at writing:** {{hash of the live base this was written against}}
- **Pre-flight:** the scheduled step re-reads the live base and compares its hash to the one above. If it moved, it stops and says so. It does not adapt and it does not proceed.

## Verification after the send
1. Read the deployed source back and compare it byte for byte to the expected result.
2. Verify on the live system by a marker this change carries: {{build id or named refusal}}. Never by the builder's report.
3. Write the receipt in the same pass.

## Rollback
{{What undoes this, and where the rollback text lives.}}

## The dispatch text
```
{{the exact text to be sent, in full}}
```

## Refusals this dispatch must not cross
- Nothing external under the principal's name without the gate.
- No money, no legal commitment, no irreversible action.
- No secret printed anywhere: not here, not in the queue, not in a report, not on the thread.
