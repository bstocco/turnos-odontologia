# Spec Delta

## MODIFIED Requirements

### Requirement: Función resolver_clinica_por_slug
The system SHALL provide the `SECURITY DEFINER` function `resolver_clinica_por_slug(slug)` of minimum scope, for the public routes that query the clinic by slug. The function MUST return only the identifier of an **active** clinic whose slug matches exactly, MUST run with a fixed `search_path`, and `EXECUTE` on it MUST be revoked from `PUBLIC` and granted only to the application role.

#### Scenario: Resolving a clinic by slug
- **WHEN** the function is called with a clinic slug
- **THEN** it returns the clinic identifier, or nothing if no clinic matches

#### Scenario: Inactive clinic
- **WHEN** the function is called with the slug of an inactive clinic
- **THEN** it returns nothing, exactly as for a nonexistent slug

#### Scenario: Only the identifier
- **WHEN** the application role calls the function
- **THEN** the result has a single `uuid` value and no other clinic column

#### Scenario: Restricted execution
- **WHEN** the function's privileges are inspected in the catalog
- **THEN** `PUBLIC` holds no `EXECUTE` privilege and the application role does
