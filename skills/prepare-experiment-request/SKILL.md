---
name: prepare-experiment-request
description: Prepare or submit a Physical Validation experiment request for peptides, rabbits, mice, genes and plasmids, proteins and antibodies, sequencing, or other research work. Use when a person wants to specify work or send a sourcing request.
---

Use the connector's current request-tool schemas for field names, supported options, and validation. File uploads and account submissions require the host's managed OAuth connection. If sign-in is required, use the host's connection flow before calling an account tool.

1. Select one service family for each request. The supported families are peptides, rabbits, mice, genes and plasmids, proteins and antibodies, sequencing, and other work described in a brief. Preserve the person's scientific specifications, requested outputs, quantities, materials, location, timeline, and provider choices. Ask about missing required answers without inventing sequences, animal details, legal entity information, or budget currency. Treat supporting constructs or cohorts as inputs only when the person explicitly links them to the selected work.
2. For preparation or browser review, call `prepare_request` with the supplied information. It returns a review link containing the supplied fields and does not save an account draft or submit a request. Share that link with the person who requested it, taking account of any personal details it contains. If files are needed, follow the upload workflow below before submission.
3. For submission, show the complete requested work and contact details, and obtain the person's explicit agreement to submit and to the service terms and privacy notice. Existing explicit authorization for that complete request is sufficient. Authenticate through the host and call `submit_request` with exactly one supported payload form. For an existing saved draft, read it first and use its current ID and revision.
4. Keep the same idempotency key when retrying an unchanged submission. If a response is interrupted, preserve the payload and key. Report an uncertain outcome honestly and avoid a fresh submission key that could duplicate the request. Resolve validation errors from the returned field details, and obtain agreement again if the substantive request changes.
5. Report submission only after the tool returns a successful receipt. Halmos reviews submitted requests before any supplier outreach. A submission receipt establishes intake, not supplier acceptance or work starting. Use only receipt links and facts returned by the service.

## File uploads

MCP tools carry file metadata; transferring actual bytes requires an HTTP client with access to the person's files. If the connected tools or file/HTTP access are unavailable, use the browser request page instead and report that the files have not been uploaded.

1. With the account connected through host-managed OAuth, call `request_upload` with `action:"prepare"` and `files`, declaring every file's actual `name`, media `type`, and byte `size`. Keep the returned `session`. If there are no files, skip this workflow and omit `upload` from submission.
2. For each file, call `request_upload` with `action:"url"`, the `session`, and its zero-based `index` in the declared file list. Use an HTTP PUT to send that file's actual bytes to the returned private storage URL with the returned required headers.
3. After the PUT succeeds, call `request_upload` with `action:"complete"`, the same `session` and `index`. Require `complete:true` for every declared file before proceeding. If a transfer or completion fails or is uncertain, report it and do not submit the incomplete upload session. Filenames alone do not upload files.
4. Include `upload:{session}` in `submit_request` only after every file completes and the person has authorized the complete request as described above. Uploading files submits nothing by itself.

Service terms and privacy are available at https://physicalvalidation.com/terms and https://physicalvalidation.com/privacy.
