# Narrowcasting Implementation Documentation

This folder contains canonical engineering contracts.

Implementation contracts translate the Architecture and Product Specification into concrete build-level agreements. They are technology-conscious but avoid prescribing database, framework, or transport details unless the product contract requires them.

The current contracts cover the Product 1.0 core platform and the additive Product 1.1-1.3 runtime extensions: Dynamic Content, Browser Renderer, Browser Automation, and Agent runtime watchdog recovery.

## Documents

| Document | Purpose |
| --- | --- |
| [17_DOMAIN_MODEL.md](17_DOMAIN_MODEL.md) | Canonical domain model, ownership, identity, lifecycle, validation boundaries, and entity relationships. |
| [18_API_CONTRACTS.md](18_API_CONTRACTS.md) | Canonical API principles, conventions, request and response contracts, validation boundaries, versioning, and Scheduler Resolver API rules. |
| [19_VALIDATION_CATALOG.md](19_VALIDATION_CATALOG.md) | Canonical validation rule taxonomy, ownership boundaries, entity validation categories, error handling, and UX validation expectations. |
| [20_PERMISSIONS_AND_SECURITY.md](20_PERMISSIONS_AND_SECURITY.md) | Canonical permissions, security principles, authorization boundaries, role model, Player trust, auditability, logging, and privacy expectations. |
| [21_PLAYER_PROTOCOL.md](21_PLAYER_PROTOCOL.md) | Canonical Server Runtime to Player protocol behaviour, synchronization, offline cache, playback, diagnostics, error handling, and versioning expectations. |
