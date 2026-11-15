# Requirements Document

## Introduction

The `mansion-lifecycle` feature replaces the foundation status page with the Foyer workflow for creating, listing, selecting, and opening software-project mansions. Each mansion lives under a configured safe root, defaults to `~/workspace/haunted-house/mansions/<kebab-name>`, and begins with the smallest Kiro-compatible spec directory. The feature keeps app-owned discovery metadata outside project folders, treats every existing path as user data, and performs no project write until name, root, containment, symlink, and collision checks pass.

## Scope

| Scope | Included behavior |
|---|---|
| **MVP** | Foyer list, create, select, and open; strict name validation; safe default root; compatible-versus-conflicting classification; minimal project tree; durable app-owned registry; API loading, empty, and error states; live and replay UI; accessibility; property and example tests |
| **Stretch (deferred)** | Custom roots, automatic discovery of unregistered projects, rename, archive, import, sorting preferences, and recent-mansion history |
| **Excluded from MVP** | Mansion deletion and project-file deletion |

## Glossary

- **Mansion_Lifecycle_Feature**: The MVP behavior that creates, lists, selects, and opens mansions.
- **Backend**: The Haunted House Python HTTP server started and reverse-proxied by Crew.
- **Foyer**: The React user interface where an Operator creates, lists, selects, and opens mansions.
- **Operator**: The local person using Haunted House through the Crew dashboard.
- **Mansion**: One software project represented by one directory and one Mansion_Record.
- **Mansion_Name**: The Operator-provided identifier for a Mansion.
- **Kebab_Name**: A string that matches `^[a-z0-9]+(-[a-z0-9]+)*$` and contains at most 40 characters.
- **Mansion_Name_Validator**: Pure logic that accepts exactly the Mansion_Name values allowed by the Kebab_Name rule.
- **Approved_Root**: A canonical Crew-approved working-directory root recorded by the verified S3 spike: `~/workspace`, `~/workspaces`, `~/workplace`, or `~/workplaces`.
- **Mansion_Root**: The server-configured parent directory that contains Mansion directories.
- **Default_Mansion_Root**: The directory `~/workspace/haunted-house/mansions` after home expansion and canonical resolution.
- **Mansion_Path**: The path formed from a safe Mansion_Root and a validated Mansion_Name; the API never accepts a Mansion_Path from a client.
- **Canonical_Path**: A path produced by resolving existing filesystem components, symbolic links, and relative components to a normalized absolute path.
- **Path_Policy**: Pure decision logic that accepts only safe Mansion_Root and Mansion_Path combinations contained by an Approved_Root.
- **Safe_Mansion_Root**: A Mansion_Root whose existing components are directories, whose existing components are not symbolic links, and whose Canonical_Path is contained by one Approved_Root.
- **Project_Spec**: The Kiro feature-spec folder for a Mansion; in the MVP the Project_Spec name equals the Mansion_Name.
- **Minimal_Project_Tree**: The new Mansion directory plus `.kiro/`, `.kiro/specs/`, and `.kiro/specs/<Project_Spec>/`, with no generated files.
- **Compatible_Mansion**: An existing real directory at the expected Mansion_Path whose `.kiro`, `.kiro/specs`, and `.kiro/specs/<Project_Spec>` entries are real directories contained by the Mansion_Path.
- **Conflicting_Path**: An existing filesystem entry at the Mansion_Path, or at a required descendant, that does not satisfy Compatible_Mansion rules.
- **Project_Initializer**: Backend behavior that inspects a Mansion_Path and creates a Minimal_Project_Tree only when no entry exists at the Mansion_Path.
- **App_Data_Directory**: Crew's app-scoped persistent data directory for Haunted House, outside every Mansion_Path.
- **Mansion_Record**: App-owned metadata containing a Mansion_Name, Project_Spec name, root-relative path, and origin without storing project content.
- **Metadata_Registry**: The versioned collection of Mansion_Record values stored in the App_Data_Directory.
- **Registry_Serializer**: Logic that converts a Metadata_Registry to and from the documented JSON representation.
- **Registry_Pretty_Printer**: Logic that writes a Metadata_Registry as deterministic, human-readable JSON.
- **Mansion_Service**: Backend orchestration that applies validation, path policy, filesystem inspection, project initialization, and metadata persistence.
- **Mansion_API**: Signed backend HTTP routes used by the Foyer to list, create, and open mansions.
- **Mansion_Descriptor**: API data containing a Mansion_Name, Project_Spec name, home-relative display path, and availability status.
- **Mansion_Shell**: The first in-app view after a Mansion opens; later feature specs add rooms and ghosts to the Mansion_Shell.
- **Replay_Build**: The static Haunted House UI build that runs against the Replay_Adapter instead of Crew.
- **Replay_Adapter**: The local SDK stand-in that presents the same Foyer with deterministic mansion responses and no Gateway request.

## Requirements

### Requirement 1: Foyer mansion journey [MVP]

**User Story:** As an Operator, I want to see and choose my software projects in a Foyer, so that I can enter the correct Mansion without using a chat log.

#### Acceptance Criteria

1. WHEN the Backend becomes reachable, THE Foyer SHALL request the current Mansion_Descriptor list from the Mansion_API.
2. WHEN the Mansion_API returns an empty Mansion_Descriptor list, THE Foyer SHALL display a named empty state and a create-mansion action.
3. WHEN the Mansion_API returns one or more Mansion_Descriptor values, THE Foyer SHALL display every Mansion_Name, home-relative display path, and availability status.
4. WHEN an Operator selects an available Mansion_Descriptor, THE Foyer SHALL identify exactly one Mansion_Descriptor as selected.
5. WHEN an Operator activates the open action for a selected Mansion_Descriptor, THE Foyer SHALL ask the Mansion_API to revalidate and open the selected Mansion.
6. WHEN the Mansion_API opens a Mansion, THE Foyer SHALL render the Mansion_Shell with the Mansion_Name and Project_Spec name.
7. WHEN an Operator returns from the Mansion_Shell, THE Foyer SHALL restore focus to the Mansion control used to open the Mansion_Shell.

### Requirement 2: Mansion name validation [MVP]

**User Story:** As an Operator, I want invalid project names rejected before filesystem access, so that a name cannot select an unintended path.

#### Acceptance Criteria

1. THE Mansion_Name_Validator SHALL accept a Mansion_Name exactly when the Mansion_Name matches `^[a-z0-9]+(-[a-z0-9]+)*$` and contains at most 40 characters.
2. WHEN the Foyer submits a create request, THE Mansion_Service SHALL validate the Mansion_Name before resolving or inspecting a Mansion_Path.
3. IF a create or open request contains a Mansion_Name rejected by the Mansion_Name_Validator, THEN THE Mansion_API SHALL return HTTP 422 with error code `invalid_mansion_name`.
4. IF a create or open request contains a Mansion_Name rejected by the Mansion_Name_Validator, THEN THE Mansion_Service SHALL leave the filesystem and Metadata_Registry unchanged.
5. THE Mansion_Service SHALL use the validated Mansion_Name without trimming, case conversion, Unicode normalization, or substitution.

### Requirement 3: Root and path confinement [MVP]

**User Story:** As an Operator, I want mansion paths confined to Crew-approved workspace roots, so that Haunted House cannot create projects elsewhere.

#### Acceptance Criteria

1. THE Mansion_Service SHALL use the Default_Mansion_Root when no test or runtime configuration supplies a Mansion_Root.
2. WHEN the Mansion_Service evaluates a Mansion_Root or Mansion_Path, THE Mansion_Service SHALL resolve existing path components to Canonical_Path values before making a filesystem mutation decision.
3. THE Path_Policy SHALL accept a Mansion_Path only when the Mansion_Path is a strict descendant of a Safe_Mansion_Root and the Safe_Mansion_Root is contained by one Approved_Root.
4. IF a Mansion_Root is relative, contains a lexical `..` component, resolves outside every Approved_Root, or has an existing symbolic-link component, THEN THE Mansion_Service SHALL return error code `unsafe_mansion_root` without changing the filesystem or Metadata_Registry.
5. IF a Mansion_Path or required descendant resolves outside the Safe_Mansion_Root through a symbolic link, THEN THE Mansion_Service SHALL return error code `symlink_escape` without changing the filesystem or Metadata_Registry.
6. THE Mansion_API SHALL derive every Mansion_Path from server configuration and a validated Mansion_Name.

### Requirement 4: Idempotent, non-destructive creation [MVP]

**User Story:** As an Operator, I want repeated creation requests to preserve existing project contents, so that Haunted House cannot overwrite my work.

#### Acceptance Criteria

1. WHEN no filesystem entry exists at a valid Mansion_Path, THE Project_Initializer SHALL create one Minimal_Project_Tree and return outcome `created`.
2. WHEN a create request repeats for a Mansion previously created by the Mansion_Service, THE Mansion_Service SHALL return the same Mansion_Record without changing the Mansion project tree.
3. WHEN a create request names a Compatible_Mansion absent from the Metadata_Registry, THE Mansion_Service SHALL add one Mansion_Record and return outcome `existing_compatible` without changing the Mansion project tree.
4. IF a filesystem entry at the Mansion_Path is a Conflicting_Path, THEN THE Mansion_API SHALL return HTTP 409 with error code `mansion_conflict`.
5. IF a filesystem entry at the Mansion_Path is a Conflicting_Path, THEN THE Mansion_Service SHALL leave the Conflicting_Path and Metadata_Registry byte-for-byte unchanged.
6. IF a collision appears during project initialization, THEN THE Project_Initializer SHALL stop initialization without replacing, truncating, or writing through the colliding entry.
7. WHEN concurrent create requests use the same Mansion_Name, THE Mansion_Service SHALL produce at most one `created` outcome and one Mansion_Record.

### Requirement 5: Minimal Kiro-compatible project tree [MVP]

**User Story:** As an Operator, I want a new Mansion ready for Kiro spec work without placeholder project files, so that later room ghosts can create only approved outputs.

#### Acceptance Criteria

1. WHEN the Project_Initializer creates a Mansion, THE Project_Initializer SHALL create exactly the Mansion directory, `.kiro/`, `.kiro/specs/`, and `.kiro/specs/<Project_Spec>/` beneath the Safe_Mansion_Root.
2. WHEN the Project_Initializer creates a Mansion, THE Project_Initializer SHALL create no file in the Mansion project tree.
3. THE Mansion_Service SHALL set the MVP Project_Spec name equal to the Mansion_Name.
4. WHEN the Mansion_Service inspects an existing Mansion_Path, THE Mansion_Service SHALL classify the Mansion_Path as Compatible_Mansion only when every required Minimal_Project_Tree entry is a real directory contained by the Mansion_Path.
5. IF any required Minimal_Project_Tree entry is missing, is not a directory, is a symbolic link, or resolves outside the Mansion_Path, THEN THE Mansion_Service SHALL classify the Mansion_Path as a Conflicting_Path.
6. WHEN a Compatible_Mansion contains additional files or directories, THE Mansion_Service SHALL preserve the additional entries and classify the Mansion as compatible.

### Requirement 6: Durable app-owned mansion metadata [MVP]

**User Story:** As an Operator, I want Haunted House to remember registered mansions across backend restarts, so that I can reopen a project without recreating project files.

#### Acceptance Criteria

1. THE Metadata_Registry SHALL store Mansion_Record values in the App_Data_Directory and outside every Mansion_Path.
2. THE Metadata_Registry SHALL store root-relative mansion paths instead of absolute home-directory paths.
3. WHEN the Mansion_Service records a Mansion, THE Metadata_Registry SHALL contain exactly one Mansion_Record for the Mansion_Name.
4. WHEN the Backend restarts after a successful registry write, THE Mansion_Service SHALL load an equivalent Mansion_Record collection.
5. WHEN no registry file exists, THE Mansion_Service SHALL load an empty Metadata_Registry without creating a Mansion project tree.
6. IF the registry file is malformed or has an unsupported schema version, THEN THE Mansion_API SHALL return error code `metadata_unavailable` and preserve the registry file unchanged.
7. WHEN the Metadata_Registry changes, THE Registry_Pretty_Printer SHALL replace the previous registry representation atomically with deterministic JSON.
8. WHEN the Registry_Serializer serializes and then parses any valid Metadata_Registry, THE Registry_Serializer SHALL produce an equivalent Metadata_Registry.

### Requirement 7: Mansion API contract [MVP]

**User Story:** As a Foyer developer, I want a small typed API with stable outcomes, so that every loading and failure state has one meaning.

#### Acceptance Criteria

1. WHEN the Foyer sends `GET /api/mansions`, THE Mansion_API SHALL return HTTP 200 with a schema version and a list of Mansion_Descriptor values ordered by Mansion_Name.
2. WHEN the Foyer sends `POST /api/mansions` with a valid Mansion_Name, THE Mansion_API SHALL return HTTP 201 for outcome `created` or HTTP 200 for outcome `existing_compatible`.
3. WHEN the Foyer sends `POST /api/mansions/open` for a registered Compatible_Mansion, THE Mansion_API SHALL return HTTP 200 with a revalidated Mansion_Descriptor.
4. IF an open request names a Mansion absent from the Metadata_Registry, THEN THE Mansion_API SHALL return HTTP 404 with error code `mansion_not_registered`.
5. IF a request body is not a JSON object containing exactly one string field named `name`, THEN THE Mansion_API SHALL return HTTP 400 with error code `invalid_request` without changing the filesystem or Metadata_Registry.
6. IF filesystem or registry access fails unexpectedly, THEN THE Mansion_API SHALL return HTTP 500 with a documented error code and no absolute path or exception text.
7. WHEN a Mansion_Record points to a missing or conflicting project tree, THE Mansion_API SHALL include status `missing` or `conflict` in the corresponding Mansion_Descriptor and refuse the open request.
8. WHILE a Mansion_API route is handling a request, THE Backend SHALL apply the proxy-signature trust boundary defined by the `crew-app-foundation` requirements.

### Requirement 8: Foyer states and accessibility [MVP]

**User Story:** As an Operator, I want clear, keyboard-accessible state and error feedback, so that I can manage mansions without guessing or relying on color.

#### Acceptance Criteria

1. WHILE a mansion list request is pending, THE Foyer SHALL display a text-labelled loading state and disable mansion open actions.
2. WHILE a create request is pending, THE Foyer SHALL disable duplicate create submissions and identify the pending Mansion_Name.
3. WHILE an open request is pending, THE Foyer SHALL disable duplicate open submissions and identify the pending Mansion_Name.
4. IF a list request fails, THEN THE Foyer SHALL display an inline error message and a retry action.
5. IF a create or open request fails, THEN THE Foyer SHALL preserve the current Mansion list and display the documented error beside the initiating control.
6. WHEN focus is within the Mansion selection list, THE Foyer SHALL support Arrow keys for selection and Enter for the open action.
7. WHEN the Mansion_Shell is open and the Operator presses Escape, THE Mansion_Shell SHALL return to the Foyer.
8. THE Foyer SHALL provide programmatic labels, visible focus indicators, and text or icon labels for every state without relying on color alone.
9. THE Foyer SHALL use Crew theme values and preserve text contrast of at least 4.5:1 and control and focus-indicator contrast of at least 3:1.
10. WHILE reduced motion or the Still House setting is active, THE Foyer SHALL suppress non-essential animation.
11. THE Foyer SHALL reserve one polite live region for completed create and open results.
12. THE Foyer SHALL present routine loading progress inline outside the polite live region.

### Requirement 9: Live and replay parity [MVP]

**User Story:** As a judge without a running Gateway, I want the Foyer journey in replay mode, so that I can inspect the feature without filesystem effects.

#### Acceptance Criteria

1. WHEN the Replay_Build renders, THE Replay_Adapter SHALL render the same Foyer and Mansion_Shell components as the live build.
2. WHEN the Replay_Adapter receives list, create, or open calls, THE Replay_Adapter SHALL return deterministic fixture-backed responses without a Gateway request or filesystem mutation.
3. WHEN the Replay_Adapter simulates a create outcome, THE Foyer SHALL update the visible Mansion list through the same state transition used by the live build.

### Requirement 10: MVP operation boundary [MVP]

**User Story:** As an Operator, I want the first mansion lifecycle release limited to reversible navigation and non-destructive creation, so that project removal cannot happen accidentally.

#### Acceptance Criteria

1. THE Mansion_API SHALL expose list, create, and open as the complete Mansion_Lifecycle_Feature operation set.
2. THE Foyer SHALL present list, create, select, open, retry, and return as the complete Mansion_Lifecycle_Feature action set.
3. IF a client sends an unsupported mansion mutation method or path, THEN THE Mansion_API SHALL return HTTP 404 or HTTP 405 without changing the filesystem or Metadata_Registry.
