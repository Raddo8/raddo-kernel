

# Set SITE_URL and Create present_options Template

Two steps to unblock the end-to-end test.

---

## Step 1: Set the SITE_URL secret

SITE_URL tells the backend where to build response links. Since this project is not yet published, we will use the preview URL:

```
https://id-preview--ae13e380-add9-4492-8c49-ab005fe534ad.lovable.app
```

No trailing slash. This will be stored as a backend secret accessible by edge functions.

---

## Step 2: Create the `present_options` email template

No `present_options` template exists yet. We will insert one into the database via the Templates page. The template must include `{{response_url}}` so the rendered email contains the clickable link.

**Template details:**
- **template_type**: `present_options`
- **channel**: `email`
- **subject**: `Action Required: {{item.title}}`
- **body**:
```
Dear {{contact.name}},

Regarding invoice {{item.title}} for {{item.amount}}, please select one of the options below:

{{response_url}}

Thank you for your prompt attention.
```

This will be inserted directly into the `templates` table for the current workspace.

---

## Technical Details

| Step | Action |
|---|---|
| 1 | Use `add_secret` tool to set `SITE_URL` to the preview URL |
| 2 | Insert a row into `templates` table with `template_type = 'present_options'` and body containing `{{response_url}}` |

After both steps, you can queue a `present_options` action on any item to trigger the full flow.

