# Requirements Document

## Introduction

The `warden-guide-and-first-visit` feature gives Haunted House one guide and one way in.

The guide is the Warden: an original hooded spectre who stands at the front of every room, says in one plain sentence what is true now, and offers a short list of things to do. Everything he offers presses a control the house already has, so nothing he teaches is lost when he steps back. He is the house's guardrail made visible: dangerous to a ghost that strays, never to the person using the house.

The way in is a first visit with one decision per screen. A person who has never heard of Kiro, specs or agents knocks, gives a name, says what they want to build, and then walks the rooms until the requirements, the design, the task list and the code exist and are approved. No Kiro word is needed to get there, and every Kiro word is one press away.

The feature finishes what the 1990s house-as-interface idea set out to do, and treats that idea's known failures as rules: the copy never talks down, the help never replaces the real controls, the guide never interrupts or performs, and nothing heavy is added.

It is presentation only. It adds no workflow state, approval path, backend route, manifest permission, storage contract or runtime dependency, and it leaves `docs/permission-freeze.json` untouched. It replaces the Caretaker guide added on Nov 16 and builds on the walk-in room view of `house-ui-and-accessibility`.

## Scope

| Scope | Included behavior |
|---|---|
| **MVP** | The Warden in five labelled poses; the Balloon grammar in every Room view, live and replay; Guide_Options that press Real_Controls; Quiet_Mode; the Word_Book with "Show Kiro's words" and "What is this?"; Reveal_Mode with Object_Labels and the `?` key; the Gate and the Visitor_Name; the Idea_Step with three Example_Ideas; the three-option rhythm in the Study, Drafting Room and Workshop; the Catch; the Attic option; the Built_Page; the steering Tone change; property, DOM, keyboard, accessibility and parity tests |
| **Not now** | More than one guide character; moving rooms, doors or furniture; new sound design; new rooms; any backend change; keeping a name or a setting after the page closes; entering a Mansion without a press |
| **Excluded** | A guide that approves, starts or decides; a second live region; a toast, badge or sound from the guide; idle animation; gore, jump scares, flashing, screams; any third-party name, character, art or sound; a chat composer |

## Glossary

Terms of `house-ui-and-accessibility` keep their meaning here: **House_UI**, **Haunted_House**, **Backend**, **Crew_Gateway**, **Mansion**, **Foyer**, **Room**, **Room_Panel**, **House_Map**, **House_Projection**, **Door**, **Ghost**, **Needs_You_Item**, **Needs_You_Shortcut**, **Interruption_Policy**, **Polite_Live_Region**, **Host_Toast**, **Sidebar_Badge**, **Motion_Policy**, **Canonical_Record** and **Replay_Build**.

- **Visitor**: The local person using Haunted_House; the Operator of the earlier specs. This feature assumes the Visitor knows no Kiro vocabulary.
- **Warden**: The one guide character of the house. An original drawing; no agent, no authority.
- **Guide**: The Warden, his Balloon and the Object_Labels together.
- **Balloon**: The Warden's speech balloon.
- **Status_Line**: The first line of the Balloon: one plain statement of what is true now.
- **Question**: The fixed second line of the Balloon, "What do you want to do?".
- **Guide_Option**: One thing the Balloon offers, phrased as a task, with a label and a Consequence_Line.
- **Primary_Options**: The Guide_Options shown first, at most four.
- **Consequence_Line**: One line under a Guide_Option that says what pressing it does.
- **Guide_View**: The pure value the Balloon renders: Status_Line, Question, Guide_Options, Pose and Pose_Label.
- **Guide_Settings**: Quiet_Mode, Kiro_Words and Reveal_Mode.
- **Real_Control**: A control that already exists on the House_Map, in a Room_Panel, on the toolbar or on the replay bar and performs an action.
- **Pose**: One of the Warden's five stances: watching, pointing, offering a key, holding a ghost, stepped back.
- **Pose_Label**: The visible text that names the current Pose.
- **Quiet_Mode**: The setting in which the Warden has stepped back and the Balloon is put away.
- **Word_Book**: The one dictionary module that holds every Term.
- **Term**: One idea with a Plain_Word, a Kiro_Word and a two-sentence explanation.
- **Plain_Word**: The everyday word the Guide uses for a Term.
- **Kiro_Word**: The word Kiro, a Kiro file or a Real_Control uses for the same Term.
- **Kiro_Words**: The setting that shows the Kiro_Word beside each Plain_Word.
- **Reveal_Mode**: The setting in which every Working_Object carries an Object_Label.
- **Working_Object**: A painted thing in a Room view that forwards a press to a Real_Control.
- **Object_Label**: The text label of one Working_Object, shown in Reveal_Mode.
- **Gate**: The first screen of a first visit: the house exterior, a knocker and the question "Who is knocking?".
- **Visitor_Name**: The name given at the Gate, after normalising. It may be empty.
- **Foyer_Hall**: The Foyer before a Mansion is open.
- **First_Time_Visitor**: A Visitor who came in through the Gate during this visit.
- **Returning_Visitor**: A Visitor in live mode whose Mansion list already holds a Mansion when the page loads.
- **Idea_Step**: The Foyer_Hall screen that asks "What do you want to build?".
- **Example_Idea**: One of three ready-made ideas offered in the Idea_Step.
- **Landing_Room**: The Room shown when a Mansion opens.
- **Catch**: A Ghost that has been stopped: a risky action or Crew tool prompt waiting for a decision, or a blocked Ghost.
- **Built_Page**: The summary of what a finished Mansion holds.
- **Guide_Reserve**: The one part of the Room scene the Warden may overlap.

## Requirements

### Requirement 1: The Warden is the one guide [MVP]

**User Story:** As a Visitor, I want one guide who looks like the house's guardrail, so that I know who is speaking and what he stands for.

#### Acceptance Criteria

1. THE House_UI SHALL present the Warden as the only guide character at the Gate, in the Foyer_Hall and in every Room view.
2. THE House_UI SHALL contain no Caretaker art, name or copy.
3. THE Warden art SHALL be original SVG drawn in code from House_Palette scene tokens, with no image element, external reference, raster data, script or animation element.
4. THE Warden art SHALL depict a tall hooded spectre with lantern eyes, a ring of keys and a trailing chain.
5. THE House_UI SHALL hide the Warden art from the accessibility tree.
6. WHILE the inline viewport is at least 900 CSS pixels, THE House_UI SHALL draw the Warden at least twice as tall as a Ghost figure of the Room.
7. THE Warden SHALL show exactly one Pose from the set watching, pointing, offering a key, holding a ghost and stepped back.
8. WHEN the House_UI shows a Pose, THE House_UI SHALL show that Pose's Pose_Label as visible text beside the Warden.
9. THE Warden SHALL have no looping animation.
10. WHILE the Motion_Policy is `none`, THE House_UI SHALL change the Pose without a transition.
11. WHERE the Motion_Policy is `low-frequency`, THE House_UI SHALL change the Pose with at most one transition that does not repeat.
12. THE Warden art SHALL depict restraint only, through a held ghost, a chain and keys, and SHALL contain no wound, blood, weapon, sudden appearance, flash or scream.
13. THE Guide copy and art SHALL present the Warden as a danger to Ghosts that stray and SHALL contain no threat addressed to the Visitor.

### Requirement 2: The Pose follows the house [MVP]

**User Story:** As a Visitor, I want the Warden's stance to tell me what kind of moment this is, so that I can read the room before I read the words.

#### Acceptance Criteria

1. WHILE Quiet_Mode is on, THE Warden SHALL show the stepped-back Pose.
2. WHEN the most pressing fact of the Room is a Catch, THE Warden SHALL show the holding Pose and THE Pose_Label SHALL name the held Ghost.
3. WHEN the most pressing fact of the Room is a Door waiting for a decision, THE Warden SHALL show the offering-a-key Pose.
4. WHEN nothing waits in the Room and the next step is one the Visitor can take, THE Warden SHALL show the pointing Pose.
5. WHEN no other Pose applies, THE Warden SHALL show the watching Pose.
6. THE Pose SHALL be a pure function of the House_Projection, the Room and Quiet_Mode.
7. THE Warden SHALL change Pose or words only when the House_Projection, the open surface or a Guide_Setting changes.
8. THE Warden SHALL show the holding Pose in no Room without a Catch.

### Requirement 3: The Balloon grammar [MVP]

**User Story:** As a Visitor, I want every room to speak in the same shape, so that I learn it once and can use it everywhere.

#### Acceptance Criteria

1. THE Balloon SHALL present, in this order, the Status_Line, the Question, the Primary_Options, a "Something else…" control and a "Step back" control.
2. THE Status_Line SHALL state the most pressing true fact of the Room in this order: a locked Room, a decision waiting, a failed Ghost, a blocked Ghost, a working Ghost, and otherwise what the Room is for.
3. THE Balloon SHALL present at most four Primary_Options, with the most likely next step first.
4. THE Guide_Option label SHALL begin with a verb from the approved verb list.
5. THE Guide_Option SHALL carry one Consequence_Line that says what pressing it does.
6. WHEN the Visitor activates "Something else…", THE Balloon SHALL list every Guide_Option available in the current view.
7. THE Guide_View SHALL be a pure function of the House_Projection, the Room, the open surface, the task in hand and the Guide_Settings.
8. THE Status_Line SHALL hold at most 240 Unicode code points, a Guide_Option label at most 60, and a Consequence_Line at most 120.
9. THE Guide copy SHALL be plain declarative sentences that contain no exclamation mark, no emoji and no phrase from the banned-phrase list.
10. THE Balloon SHALL present the same grammar in live mode and in the Replay_Build.
11. THE Status_Line and the Guide_Options SHALL contain no tool input, artifact content or model text.

### Requirement 4: The Guide presses the real controls [MVP]

**User Story:** As a Visitor, I want the guide to operate the house's own controls, so that what I learn with him still works without him.

#### Acceptance Criteria

1. WHEN the Visitor activates a Guide_Option, THE House_UI SHALL press the Real_Control that already performs that action.
2. THE Guide SHALL send no command, request, approval or event of its own.
3. THE Guide SHALL offer a Guide_Option that approves or rejects only WHILE the surface that shows the exact subject of that decision is open.
4. WHEN a Guide_Option opens a surface that holds a decision, THE House_UI SHALL place focus on the heading of that decision and on no control that decides.
5. IF the Real_Control of an activated Guide_Option is absent or disabled, THEN THE House_UI SHALL change nothing and THE Balloon SHALL state the reason the Room gives.
6. WHILE the House_Projection is read-only or the mutation of a Room is disabled, THE Guide SHALL offer no Guide_Option that starts, decides or requests a revision in that Room.
7. WHEN a Guide_Option needs more than one press, THE House_UI SHALL press each Real_Control in order, each after the result of the one before it has rendered.
8. THE Guide SHALL preserve every Door, approval, phase-order, path and risky-action rule of the approved upstream specs.
9. WHERE Kiro_Words is on, THE Guide_Option SHALL display the Kiro_Word of its action beside its label.

### Requirement 5: Inside the interruption budget [MVP]

**User Story:** As a Visitor, I want a guide who waits to be read, so that he never interrupts my work or stands in front of it.

#### Acceptance Criteria

1. WHEN the Status_Line, the Guide_Options or the Pose change, THE House_UI SHALL update them in place without changing the Polite_Live_Region.
2. THE Guide SHALL request no Host_Toast, no Sidebar_Badge change and no sound.
3. WHEN the Visitor changes a Guide_Setting, THE Polite_Live_Region SHALL announce the new setting in one sentence.
4. THE House_UI SHALL contain exactly one Polite_Live_Region at the Gate, in the Foyer_Hall and in an open Mansion.
5. THE Guide SHALL open no modal surface, trap no focus and move focus only in response to a Visitor press.
6. WHILE the inline viewport is at least 900 CSS pixels, THE Balloon SHALL lie outside the Room scene and THE Warden SHALL overlap the Room scene only inside the Guide_Reserve.
7. THE Guide_Reserve SHALL contain no Working_Object, no Object_Label, no open Room_Panel and no House_Map sheet.
8. WHILE the inline viewport is below 900 CSS pixels, THE Balloon and the Warden SHALL follow the Room scene in document order and overlay nothing.
9. THE Guide SHALL start no timer.

### Requirement 6: Quiet mode [MVP]

**User Story:** As a Visitor who knows the house, I want to tell the guide to step back, so that I can work with the rooms alone.

#### Acceptance Criteria

1. THE Balloon SHALL always present the "Step back" control.
2. WHEN the Visitor activates "Step back", THE House_UI SHALL turn Quiet_Mode on, put the Balloon away, and show the stepped-back Pose with a "Call the Warden" control.
3. WHEN the Visitor activates "Call the Warden", THE House_UI SHALL turn Quiet_Mode off and place focus on the Status_Line.
4. WHILE Quiet_Mode is on, THE House_Map, the toolbar, the Room_Panels and the Needs_You_Shortcut SHALL operate unchanged.
5. WHILE Quiet_Mode is on, every action a Guide_Option can offer SHALL remain reachable through the House_Map, the toolbar and the Room_Panels.
6. WHILE Quiet_Mode is on, THE Interruption_Policy SHALL emit the same summaries as with Quiet_Mode off.
7. WHILE Quiet_Mode is on, THE House_UI SHALL keep the Balloon put away until the Visitor calls the Warden.
8. THE House_UI SHALL provide a "House map" control outside the Balloon in every layout where the House_Map is a put-away sheet.
9. THE House_UI SHALL hold Quiet_Mode in page state for the visit and SHALL begin every visit with Quiet_Mode off.

### Requirement 7: Plain words, with Kiro's words one press away [MVP]

**User Story:** As a Visitor who knows no Kiro vocabulary, I want everyday words by default and the real words when I ask, so that I can succeed now and recognise Kiro later.

#### Acceptance Criteria

1. THE Word_Book SHALL define, for each Term, one Plain_Word, one Kiro_Word and an explanation of exactly two sentences.
2. THE Word_Book SHALL hold at least the Terms plan (spec), what it must do (requirements), how it will work (design), to-do list (tasks), ghost (agent), open the door (approve), house rules (steering) and wall (path limit).
3. THE Guide copy SHALL take every Term it shows from the Word_Book.
4. WHILE Kiro_Words is off, THE Guide copy SHALL show the Plain_Word alone and SHALL contain no Kiro_Word.
5. WHILE Kiro_Words is on, THE Guide copy SHALL show the Kiro_Word beside each Plain_Word.
6. THE House_UI SHALL provide a labelled "Show Kiro's words" toggle that exposes its pressed state.
7. WHEN the Status_Line names a Term, THE Balloon SHALL provide a "What is this?" control that shows the two sentences of that Term in place.
8. THE "Something else…" list SHALL give the whole Word_Book: each Plain_Word, its Kiro_Word and its two sentences.
9. THE Kiro_Word of each Term SHALL equal the word the matching Real_Control or Kiro file uses.
10. THE House_UI SHALL keep the existing visible name and accessible name of every Real_Control.
11. THE House_UI SHALL hold Kiro_Words in page state for the visit and SHALL begin every visit with Kiro_Words off.

### Requirement 8: Reveal what can be pressed [MVP]

**User Story:** As a Visitor looking at a painted room, I want one key that labels everything that works, so that I never have to guess what is furniture.

#### Acceptance Criteria

1. THE House_UI SHALL provide a labelled "Show me what I can press" toggle that exposes its pressed state.
2. WHEN the Visitor presses the `?` key while focus is outside a text field, THE House_UI SHALL toggle Reveal_Mode.
3. WHILE focus is in a text field, THE House_UI SHALL treat `?` as text.
4. WHILE Reveal_Mode is on, THE House_UI SHALL show one Object_Label of real text on every Working_Object of the Room.
5. WHILE Reveal_Mode is on, THE Object_Labels SHALL be buttons reachable by Tab in reading order, each with an accessible name that states the object, its state and what pressing it does.
6. WHEN the Visitor activates an Object_Label, THE House_UI SHALL press the same Real_Control as a pointer press on that Working_Object.
7. WHILE Reveal_Mode is off, THE House_UI SHALL keep the Object_Labels out of the accessibility tree and the Tab sequence.
8. THE House_UI SHALL label no decoration.
9. WHEN the Visitor presses Escape while Reveal_Mode is on and no surface or House_Map sheet is open, THE House_UI SHALL turn Reveal_Mode off and SHALL stay in the Mansion.
10. THE House_UI SHALL hold Reveal_Mode in page state for the visit and SHALL begin every visit with Reveal_Mode off.

### Requirement 9: The Gate [MVP]

**User Story:** As a first-time Visitor, I want to knock and say who I am, so that the house starts with one small step instead of a form.

#### Acceptance Criteria

1. WHILE the Backend is reachable, the Visitor has not knocked during this visit, and either the Mansion list is empty or the page is the Replay_Build, THE House_UI SHALL show the Gate.
2. THE Gate SHALL show the house exterior with a knocker, the Warden, the question "Who is knocking?", one labelled name field and one "Knock" control.
3. WHEN the Visitor activates "Knock" or presses Enter in the name field, THE House_UI SHALL admit the Visitor to the Foyer_Hall.
4. THE Gate SHALL accept an empty name.
5. THE House_UI SHALL reduce the entered name to one line of at most 40 Unicode code points with no control character.
6. WHEN a Visitor who knocked enters the Foyer_Hall, THE Warden SHALL greet the Visitor by Visitor_Name, or with the nameless greeting when the Visitor_Name is empty.
7. THE House_UI SHALL hold the Visitor_Name in page state for the visit only.
8. THE House_UI SHALL send the Visitor_Name to no Backend, Crew_Gateway, séance log, Host_Toast, Sidebar_Badge or browser storage.
9. WHILE the Mansion list of a live page holds at least one Mansion when it loads, THE House_UI SHALL skip the Gate and the Idea_Step and present the Foyer_Hall.
10. WHEN the Visitor activates "Step outside" in the Foyer_Hall, THE House_UI SHALL show the Gate and forget the Visitor_Name.
11. WHILE the Backend is unreachable, THE House_UI SHALL keep the foundation status and retry path and SHALL show no Gate.
12. THE Gate SHALL offer one decision: to knock.

### Requirement 10: The idea step [MVP]

**User Story:** As a first-time Visitor, I want to say what I want to build in my own words or pick an example, so that I can start without knowing what a project folder or a brief is.

#### Acceptance Criteria

1. WHEN a First_Time_Visitor enters the Foyer_Hall of a live page, THE Warden SHALL ask "What do you want to build?" and present three Example_Ideas and one labelled free-text field.
2. WHEN the Visitor chooses an Example_Idea, THE Idea_Step SHALL place that idea's text in the field, where it stays editable.
3. THE Idea_Step SHALL apply the existing Mansion brief rules to the idea text and show the existing counter and refusal copy.
4. THE Idea_Step SHALL derive from the idea a Mansion name that satisfies the Mansion name rule and differs from every listed Mansion, and SHALL show that name before anything is created.
5. WHEN the Visitor activates "Build this", THE Idea_Step SHALL send the existing create request with the derived name and the idea as its brief and, when that succeeds, the existing open request for the same Mansion.
6. THE Idea_Step SHALL send no request other than the existing create and open requests.
7. IF the create or open request fails, THEN THE Idea_Step SHALL keep the idea text, show the existing error copy beside "Build this", and change nothing else.
8. WHEN the Mansion opens, THE House_UI SHALL show the Landing_Room.
9. THE Foyer SHALL keep its list, create, select, open, retry and return actions available and unchanged.
10. WHILE the page is the Replay_Build, THE Foyer_Hall SHALL present the invitation of the recording in place of the Idea_Step, with watching the recorded Mansion as the first Guide_Option.
11. WHEN a Returning_Visitor is in the Foyer_Hall and exactly one ready Mansion is listed or one is selected, THE first Guide_Option SHALL go back into that Mansion through the existing open action.
12. WHEN a Returning_Visitor chooses to build something new, THE Foyer_Hall SHALL present the Idea_Step.
13. THE Idea_Step SHALL offer one decision: what to build.

### Requirement 11: The three-option rhythm in the rooms [MVP]

**User Story:** As a Visitor, I want each working room to ask the same three things in the same order, so that the second room feels familiar and the third feels easy.

#### Acceptance Criteria

1. WHEN a Mansion opens, THE House_UI SHALL show as Landing_Room the Room of the first Needs_You_Item, otherwise the Room of the earliest phase whose Door is not open, otherwise the Attic.
2. WHEN the current phase of the Room can be started and the mutation of the Room is enabled, THE first Primary_Option SHALL start that phase through the start control of the Room.
3. WHILE a Ghost of the Room is working and nothing waits, THE Status_Line SHALL name the Ghost and state that the Door stays shut until the Visitor opens it.
4. WHEN a Door of the Room waits for a decision and its surface is closed, THE Primary_Options SHALL be, in order, to read the document, to ask for a change and to go to the Door.
5. WHILE the surface of that Door is open with a pending proposal and enabled decisions, THE Primary_Options SHALL be, in order, to open the Door, to ask for a change and to read the document again, and "Keep the door shut" SHALL be in the "Something else…" list.
6. WHEN the Visitor chooses to ask for a change, THE House_UI SHALL open the existing revision request and THE Balloon SHALL offer up to three ready-made change requests for that document and "Write my own".
7. WHEN the Visitor chooses a ready-made change request, THE House_UI SHALL place its text in the existing revision field, and sending it SHALL be a press of the existing send control.
8. WHEN a Door of the Room is open and a Room of a later phase exists, THE first Primary_Option SHALL go to the Room of the next phase.
9. WHEN the task list is approved and work can be started in the Workshop, THE first Primary_Option SHALL build every task that is ready by ticking each task the task board allows and pressing the start control of the board.
10. WHEN a failed run of the Room offers a fresh attempt, THE first Primary_Option SHALL press the retry control of that run.
11. WHILE the Room is locked, THE Balloon SHALL state the locked text of the Room and offer navigation only.
12. THE Study, the Drafting Room and the Workshop SHALL present the same order of Primary_Options for the same situation.

### Requirement 12: The catch [MVP]

**User Story:** As a Visitor, I want to see a stopped ghost held and be told plainly what it tried, so that the house's limits are something I can watch working.

#### Acceptance Criteria

1. WHEN a risky action waits in the Room, THE Status_Line SHALL say that the named Ghost is held and what the Ghost asked to do, in the bounded wording the House_Projection supplies.
2. WHEN a risky action waits and its proposal is not shown, THE first Primary_Option SHALL open the Room_Panel at that proposal.
3. WHILE that proposal is shown, THE Primary_Options SHALL be to allow it once and to refuse it, each pressing the control of that proposal.
4. WHEN a Ghost is blocked and no decision is offered, THE Status_Line SHALL give the safe reason of the Ghost and THE Balloon SHALL offer no Guide_Option that approves or refuses.
5. WHEN a Crew tool prompt waits, THE Status_Line SHALL say that it is answered in Crew and THE Balloon SHALL offer no Guide_Option that approves or refuses.
6. THE Guide SHALL keep no record of earlier Catches, so the first Catch and every later one read the same.

### Requirement 13: The Attic and what was made [MVP]

**User Story:** As a Visitor who finished a build, I want to watch how it happened and see what now exists under its real names, so that I can carry on in Kiro.

#### Acceptance Criteria

1. WHILE the Visitor is in the Attic, THE first Primary_Option SHALL watch how the house was built by opening the Attic and pressing its play control.
2. WHEN every phase Door of the Mansion is open, THE Balloon SHALL offer "See what was made" in every Room.
3. THE Built_Page SHALL list each approved document with its Plain_Word, its Kiro_Word and its real file path, in phase order.
4. THE Built_Page SHALL list the finished tasks with the files the task list names for them.
5. THE Built_Page SHALL show the folder of the Mansion as the Backend reported it and the steps that open that folder in Kiro.
6. WHERE a link that opens a folder in the installed Kiro has been verified, THE Built_Page SHALL offer that link.
7. THE Built_Page SHALL add no command, no request and no Room, and SHALL be part of the Foyer Room_Panel of the open Mansion.
8. WHILE the page is the Replay_Build, THE Built_Page SHALL state that the folder is not on this computer.
9. THE Built_Page SHALL list no document whose Door is not open.

### Requirement 14: Parity, constraints and verification [MVP]

**User Story:** As a maintainer and a judge, I want the guide proven equal in live and replay and proven harmless to the house's rules, so that the friendliest part of the product is also a trustworthy one.

#### Acceptance Criteria

1. WHEN equivalent Canonical_Records drive live mode and the Replay_Build, THE Guide SHALL show the same Status_Line, Pose and Pose_Label in both.
2. THE Replay_Build SHALL show the Gate, the Warden, the Balloon, Quiet_Mode, Reveal_Mode and the Word_Book while making no request to Crew_Gateway or Backend.
3. THE feature SHALL add no runtime dependency, Backend route, manifest permission, SDK import outside the adapter seam or browser storage use, and SHALL leave `docs/permission-freeze.json` unchanged.
4. THE core modules of the feature SHALL be pure: no React, DOM, Crew SDK, network, filesystem, storage, timer or clock.
5. THE test suite SHALL run one fast-check property test of at least 200 cases for each Correctness Property of the design.
6. THE test suite SHALL run accessibility-rule checks on the Gate, the Idea_Step, each Pose, Quiet_Mode, Reveal_Mode, the Word_Book list and the Built_Page in light, dark and reduced-motion states.
7. THE test suite SHALL prove that a First_Time_Visitor reaches an approved requirements Door using Guide_Options only, once with pointer presses and once with the keyboard alone.
8. THE test suite SHALL prove, for every Guide_Option of the fixture matrix, that its Real_Control is reachable while Quiet_Mode is on.
9. THE existing test suites SHALL pass, and a test that asserts the removed Caretaker copy or the old first screen SHALL be updated in the same change without weakening an assertion about authority, parity, lifecycle or accessibility.
10. THE steering Tone SHALL read "Menacing, never harmful", and every document that quotes the Tone SHALL agree with it.
11. THE House_UI, its assets and its fixtures SHALL contain no third-party product, publisher or character name, logo, art or sound.
