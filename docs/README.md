# Narrowcasting Documentation

This folder is the entry point for Narrowcasting documentation.

The documentation is separated by ownership layer. Each document should have one authoritative location only.

## Documentation Layers

| Layer | Purpose |
| --- | --- |
| [Architecture](architecture/README.md) | Technical architecture: how the platform is built and how runtime boundaries are protected. |
| [Product Specification](product/README.md) | Product behaviour, UX, workflows, and commercial product expectations. |
| [Implementation](implementation/README.md) | Future engineering contracts such as domain models, API contracts, validation catalogs, and security. |
| [Deployment](deployment/README.md) | Production appliance setup, Raspberry Pi deployment, systemd services, and kiosk operation. |
| [Developer](developer/README.md) | Development setup, coding standards, API development, and build instructions. |
| [Testing](testing/README.md) | Manual verification, regression testing, test plans, and acceptance testing. |
| [User](user/README.md) | Future operator, administrator, installer, and tutorial documentation. |
| [Archive](archive/README.md) | Historical phase notes and superseded roadmap material. |

## Authoritative Sources

```text
Architecture
->
Product Specification
->
Implementation Contracts
->
Implementation
```

- Architecture is the technical authority.
- Product Specification is the behavioural authority.
- Implementation contracts will become the engineering authority for concrete build details.
- Deployment, developer, testing, and user guides explain how to operate or work with the platform.

## Current Primary Documents

- [Technical Architecture](architecture/ARCHITECTURE.md)
- [Scheduling Architecture](architecture/SCHEDULING_ARCHITECTURE.md)
- [Product Specification](product/00_PRODUCT_INDEX.md)
- [Production Deployment](deployment/PRODUCTION_DEPLOYMENT.md)

## Documentation Rules

- Do not duplicate authoritative content across layers.
- Link to the owning document instead of copying large sections.
- Keep runtime architecture in `architecture/`.
- Keep product behaviour in `product/`.
- Keep setup and operational procedures in `deployment/`, `developer/`, `testing/`, or `user/`.
- Keep historical material in `archive/`.
