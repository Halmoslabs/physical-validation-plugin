# Physical Validation

Version 1.1.0 is prepared for directory review. The remote service and host-managed OAuth are live. The directory listings are not yet published.

Find CROs, CDMOs, and research facilities, compare their published evidence, and prepare experiment requests with Physical Validation by Halmos Labs. The shared skills cover provider discovery, request preparation and submission, and existing account drafts.

Requests support peptides, rabbits, mice, genes and plasmids, proteins and antibodies, sequencing, and other research work. Each request selects one service family. A request can include inline specifications, provider preferences, contact information, budget currency, and the other fields supported by the connected tools. Attach files using `request_upload` with host-managed OAuth and an HTTP client that can read and upload the person's files. If the tools or file/HTTP access are unavailable, use the browser request page instead.

For files, call `request_upload` with `action:"prepare"` and every file's `name`, media `type`, and byte `size`. For each zero-based file `index`, call `request_upload` with `action:"url"` and the returned `session`, HTTP PUT the actual bytes to the returned private URL using its required headers, then call `request_upload` with `action:"complete"`. Require `complete:true` for every declared file before including `upload:{session}` in an authorized `submit_request`. Uploading alone submits nothing; names alone do not upload files. See the [file upload workflow](skills/prepare-experiment-request/SKILL.md#file-uploads) for empty-file and failed-upload handling.

The plugin connects to https://physicalvalidation.com/mcp. Catalogue search and evidence reads are public. Use the host's managed OAuth connection for account drafts and MCP submissions. With the person's explicit agreement, file a new brief with `submit_request` using `{text, consent:true}`; OAuth supplies the verified email. Contact details, structured needs, pricing and provider preferences are optional. An unchanged retry returns the same receipt; reuse any explicit idempotency key. Briefs cannot carry file uploads; use a structured submission for files.

Without MCP, an HTTP client can start the same brief with `POST /api/v1/requests` using `{text, email, consent:true}` and any supported optional fields. The `202` response reserves a `req_…` ID and returns a private intake secret while the service emails a code. Send `PUT /api/v1/requests/{id}/verification` with `{code}` and `Authorization: Bearer <intakeSecret>`. Retry that same PUT to recover the receipt. Do not share the code or secret or treat the initial response as a submission. Use these flows only when the connected service exposes them; otherwise offer the browser request page.

Request preparation returns a review link, not a submission. Report submission only after receiving a receipt. Halmos reviews requests before supplier outreach.

## Install and use

This source contains both platform formats. Claude reads `.claude-plugin/plugin.json` and `.mcp.json`. Hosts supporting Agent Plugins read the root `plugin.json` and `mcp.json`. Both use the same `skills/` directory. Connect Physical Validation in the host's connector settings, then ask for a workflow such as the following.

- Find GLP bioanalysis providers in Europe and show the sources behind their capabilities.
- Prepare a peptide synthesis request using my specifications for review.
- Show my saved request drafts and open the one about sequencing.

Capabilities depend on the tools the connected service exposes. Provider records report published claims and unknowns. Existing draft tools support listing, reading, deletion, and submission. Use the returned browser links for saved edits; file uploads can use the tool workflow above or the browser fallback.

## Data and support

The plugin sends search criteria and requested tool inputs to Physical Validation. Account workflows also use the person's supplied request and contact details. The service's privacy policy describes processing, storage, retention, and contact rights. Plugin files contain workflow instructions and connector configuration. The service operates under its own terms.

- Documentation — https://physicalvalidation.com/docs/mcp
- Privacy — https://physicalvalidation.com/privacy
- Terms — https://physicalvalidation.com/terms
- Support — https://physicalvalidation.com/support and inquiry@physicalvalidation.com

## License

The MIT license in `LICENSE` covers the files in this plugin distribution. It grants no license to Physical Validation's hosted service or catalogue data and no trademark rights. Service access and data use are governed by the service terms linked above.
