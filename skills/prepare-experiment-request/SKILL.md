---
name: prepare-experiment-request
description: Prepare or submit a Physical Validation experiment request for peptides, rabbits, mice, genes and plasmids, proteins and antibodies, sequencing, or other research work. Use when a person wants to specify work or send a sourcing request.
---

Use the connector's current request-tool schemas for field names, supported options, and validation. File uploads and account submissions require the host's managed OAuth connection. If sign-in is required, use the host's connection flow before calling an account tool.

1. For a new brief, nonblank text is enough to describe the work. When supplying structured specifications, select the applicable service family and preserve the person's requested outputs, quantities, materials, location, timeline and provider choices. Ask about missing answers needed for that format without inventing details. Treat supporting constructs or cohorts as inputs only when the person explicitly links them to the selected work.
2. For preparation or browser review, call `prepare_request` with the supplied information. It returns a review link containing the supplied fields and does not save an account draft or submit a request. Share that link with the person who requested it, taking account of any personal details it contains. If files are needed, follow the upload workflow below before submission.
3. Before filing, show the work and any supplied contact details and obtain the person's explicit agreement to submit and to the service terms and privacy notice. Existing explicit authorization for that request is sufficient. Connect through host OAuth and call `submit_request` with exactly one payload form:
   - For a new brief, use `{text, consent:true}`. The account supplies the verified email; `contact` (without an email override), `need`, `pricing`, and `providers` are optional.
   - For a new structured request, use `document`. If it references files, complete the upload workflow below and include `upload:{session}` in the same call.
   - For a saved draft, read it first and use its current ID and revision instead.
4. Retry an unchanged brief to recover its receipt; if you supplied an idempotency key, reuse it. Keep the same key for retries of a structured or saved-draft submission. If the outcome is uncertain, report it and avoid starting another submission. Resolve validation errors from the returned field details and obtain agreement again if the substantive request changes.
5. Report submission only after the tool returns a successful receipt. Halmos reviews submitted requests before any supplier outreach. A submission receipt establishes intake, not supplier acceptance or work starting. Use only receipt links and facts returned by the service.

## Brief filing over HTTP

If MCP is unavailable and the service exposes brief intake, POST `{text, email, consent:true}` to `/api/v1/requests`, adding supported optional fields only when supplied. The `202` response reserves a `req_…` ID and returns a private `intakeSecret`; the service emails the person a code. PUT `{code}` to `/api/v1/requests/{id}/verification` with `Authorization: Bearer <intakeSecret>`. Keep the secret and code private. An interrupted PUT can be retried with the same ID, secret, and code to recover the receipt. The POST alone does not submit anything. If the service does not expose this flow, offer the browser request page.

## File uploads

Only structured submissions accept files; a text brief cannot include an upload session. MCP tools carry file metadata; transferring actual bytes requires an HTTP client with access to the person's files. If the connected tools or file/HTTP access are unavailable, use the browser request page instead and report that the files have not been uploaded.

1. With the account connected through host-managed OAuth, call `request_upload` with `action:"prepare"` and `files`, declaring every file's actual `name`, media `type`, and byte `size`. Keep the returned `session`. If there are no files, skip this workflow and omit `upload` from submission.
2. For each file, call `request_upload` with `action:"url"`, the `session`, and its zero-based `index` in the declared file list. Use an HTTP PUT to send that file's actual bytes to the returned private storage URL with the returned required headers.
3. After the PUT succeeds, call `request_upload` with `action:"complete"`, the same `session` and `index`. Require `complete:true` for every declared file before proceeding. If a transfer or completion fails or is uncertain, report it and do not submit the incomplete upload session. Filenames alone do not upload files.
4. Include `upload:{session}` in `submit_request` only after every file completes and the person has authorized the complete request as described above. Uploading files submits nothing by itself.

Service terms and privacy are available at https://physicalvalidation.com/terms and https://physicalvalidation.com/privacy.
