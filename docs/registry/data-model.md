# Contractor registry data model (demo)

## Scope and storage boundaries

This model is a local demonstration dataset. The registry will use browser-local storage on GitHub Pages and a separate on-device database in Android. Both clients can load the same seed fixture, but edits do not synchronize between devices until a backend is explicitly introduced. Client-side roles and approvals are workflow demonstrations, not authorization controls.

The existing technician demo profiles and the verifier checker remain separate from this contractor registry. The four existing anime profiles are legacy scanner fixtures; they are not contractor records and are not subject to the new contractor-company direction restrictions.

## Entities

- **Company**: stable `CTR-*` ID, name, status, allowed direction IDs, maximum directions, creation date. Company changes are captured in the audit log.
- **Employee**: permanent `EMP-*` ID, fictional full name, unique 12-digit `demoNumber`, current company ID, active/inactive status, creation/update times and comments. The demo number is not a real IIN.
- **Direction**: extensible `DIR-*` catalog entry. The seed contains Face ID, ACS, APS, fire protection, CCTV and alarm directions.
- **Assignment**: separate `ASN-*` ID, employee/company/direction references, start/end date, active/closed status and comment. Closing an assignment preserves it; company transfer closes old assignments and adds new ones without changing the employee ID.
- **Audit event**: stable `EVT-*` ID, UTC timestamp, actor ID/role, action, entity type/ID, and old/new JSON values. Company and assignment history is represented by these events and retained assignments.
- **Approval request**: request ID, requester, optional reviewer, subject, requested changes, status and timestamps. The requester must differ from the reviewer. This is only a demo workflow without server enforcement.

## Invariants

1. Employee IDs, demo numbers, assignment IDs and event IDs are unique and never reassigned.
2. Demo numbers contain exactly 12 digits and are generated from random values for newly created people. Seed values are fictional and fixed so initial data can be regenerated deterministically.
3. Every active employee has one to three distinct active directions. A company's maximum applies as an additional cap.
4. `CTR-001` through `CTR-004` allow only `DIR-FACE` and `DIR-ACS`, with a maximum of two directions. Other catalog directions stay available for future companies but are not assigned to these four companies.
5. Active assignments must reference an existing employee, company and direction, and must match the employee's current company.
6. Changing company closes existing active assignments, records an audit event and creates only assignments allowed by the new company. No old assignment is deleted.
7. Seed installation is idempotent: clients insert the fixture only into an empty store, or upsert by the stable primary IDs. They must never append a second copy on each launch.
8. QR payloads use only the employee's `EMP-*` ID. Names, companies and demo numbers are looked up from the local profile after scanning.

## Seed fixture

`data/registry-seed.json` is the canonical fictional seed for the registry. `scripts/generate-demo-registry-seed.js` deterministically rebuilds it; `scripts/validate-registry-seed.js` checks uniqueness, references and company restrictions. The existing checker protocol is retained separately for backward compatibility.

## Requirement resolution

The request both restricts the four named companies to Face ID and ACS and asks to assign the other four directions to demo employees. These cannot both be true for those companies. This phase follows the stricter company rule: all six directions exist in the catalog, but only Face ID and ACS are assigned. Demonstrating the other four requires a future unrestricted company or explicit policy change.
