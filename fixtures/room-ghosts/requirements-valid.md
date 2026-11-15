# Requirements Document

## Introduction

The guest book lets a visitor leave a short signed message and lets the host read every message in the order it arrived. Entry storage and rendering are MVP. Moderation is stretch scope.

## Glossary

- **Guest_Book**: The feature that stores and shows visitor entries.
- **Entry**: One visitor message with a name, a message, and a timestamp.
- **Entry_Store**: The component that keeps every Entry in insertion order.
- **Page_Renderer**: The component that turns stored entries into an HTML page.
- **Moderation**: The stretch-scope review of an Entry before it is shown.

## Requirements

### Requirement 1: Record entries

**User Story:** As a visitor, I want to leave a signed message, so that the host knows I stopped by.

#### Acceptance Criteria

1. WHEN a visitor submits a name and a message, THE Entry_Store SHALL save one Entry with the submission time.
2. THE Entry_Store SHALL keep a name of 1 to 80 characters and a message of 1 to 500 characters.
3. WHILE the Entry_Store holds entries, THE Entry_Store SHALL return every Entry in insertion order.

### Requirement 2: Refuse bad entries

**User Story:** As the host, I want malformed entries refused, so that the guest book stays readable.

#### Acceptance Criteria

1. IF a submitted name is blank, THEN THE Entry_Store SHALL reject the submission and save nothing.
2. IF a submitted message is longer than 500 characters, THEN THE Entry_Store SHALL reject the submission
   and report the limit.
3. WHERE Moderation is enabled, WHEN a visitor submits an Entry, THE Entry_Store SHALL hold the Entry until the host approves it.

### Requirement 3: Show the guest book

**User Story:** As a host, I want one page that lists every message, so that I can read them at a glance.

#### Acceptance Criteria

1. WHEN the host opens the Guest_Book, THE Page_Renderer SHALL list every saved Entry with its name, message, and date.
2. THE Page_Renderer SHALL escape HTML in every name and message — including “quoted” text and 漢字.
