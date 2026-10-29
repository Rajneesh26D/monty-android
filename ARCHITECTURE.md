# Monty application map

## What it does

Monty is a personal English and Maths study workspace, expanded from the old
VocabMaster vocabulary app. English contains Grammar, Vocab, and
PQRS / RS / CT / RC sections. Maths has topic folders. Each folder holds
notes, original PDFs, imported question banks, practice progress, bookmarks,
and tests/results. Anto / Syno and Idioms are seeded vocabulary folders;
Percentage is the seeded Maths folder. Topic folders have one level.

Notes are stored without AI processing. Practice PDFs are parsed using
positioned PDF text. Maths preserves bilingual question text, options,
fractions, source order, and printed answer grids. Idioms use a separate table
parser. Vocabulary has synonym/antonym classification and bilingual meanings.
Supported known layouts are processed locally; unfamiliar English layouts
can use the hosted AI importer. Scanned or diagram-dependent Maths needs
review rather than invented solutions. Imports save resumable checkpoints.

Practice is untimed and preserves answers. Tests use a 15-minute active-time
clock, per-question timing, pause/resume, and local checkpoints. A palette
tracks visited/answered/review status. Review flags and bookmarks are separate.
Vocabulary answers require classifying every option. Maths PDFs create tests
in groups of 25 and a final remainder. Reattempts keep the previous result
until the new attempt is submitted.

## Frontend and domain code

- `src/main.tsx` loads polyfills and the error boundary, then `src/Monty.tsx`.
- `src/Monty.tsx` manages subject/section/folder navigation and Settings.
- `src/App.tsx` retains the vocabulary library and quiz interface, scoped
  into a folder by `src/storage/scoped.ts`.
- `StudyFolder`, `StudyContent`, `MCQView`, `ExamScreen`, `VocabularyExam`,
  and `QuestionTracker` implement the study and exam flows.
- `src/pdf/` reads PDFs in a worker and parses source layouts;
  `src/services/importer.ts` and `workspace.ts` coordinate imports and banks.
- `src/core/` contains question progress, quiz grading, exam construction,
  vocabulary merging, and Maths text cleanup.
- `shared/` defines validated state, banks, migration, and request schemas.

## Data and storage

State v2 keeps old entry/question identifiers and snapshots while adding a
Monty workspace: folders, attachments, bank references, tests, practice, and
scoped bookmarks. Question banks are immutable JSON attachments, separate
from the small main state. The saved code migrates old VocabMaster state and
flattens nested folders without changing IDs. It also reads old backup formats.

`src/storage/repository.ts` chooses platform storage. The web app uses
IndexedDB `vocabmaster` (kept at database version 1 for older tabs), plus
`monty-assets` for files, jobs, and clocks. Android uses native SQLite for
main state, app-private files for legacy PDFs, IndexedDB for newer assets and
clocks, and Android Keystore for device credentials. Backup ZIPs contain
state, source PDFs, banks, notes, bookmarks, answers, and results. They omit
connection credentials and pause active tests. Restore replaces the selected
device library after user confirmation.

The hosted version additionally syncs with private Cloudflare R2 through its
Sites Worker. Revision-based conditional saves and three-way merges protect
independent edits and deletions; Web Locks and broadcasts coordinate tabs.
Files up to 500 MB use resumable 8 MiB multipart uploads. Complete ZIP backups
currently have a separate 195 MB limit. Android retains its on-device storage;
it does not inherit the web app's browser sign-in or automatic cloud sync.

## Backend and security boundary

`server/app.ts` serves bundled frontend assets and `/api/` endpoints for
library state, original PDFs, attachment banks, multipart uploads, and AI.
The existing Sites sign-in/access boundary protects the single-owner library;
the Worker is not designed to be deployed publicly without authentication.
`server/models.ts`, `general.ts`, and `cache.ts` validate AI output, restrict
models to verified free routes, cache source-based requests, and handle quotas.
The OpenRouter API key is a server runtime secret and is never shipped in APKs.

The existing private web deployment remains at its Sites origin. This public
GitHub copy has no private Site identity, cloud data, study PDF fixtures,
runtime credentials, or historical commits containing those fixtures.

## Builds and updates

The original saved repository contained the web app and native storage code,
but no Android Gradle project, original Android package ID, signing key, or
earlier APK. This reconstructed Android release therefore cannot promise
replacement compatibility with the old USB-installed app. Its stable package
is `com.monty.study`. Transfer a backup once if migration is necessary.

`npm run android:sync` builds local frontend assets and synchronizes Capacitor
plugins. Java 21 / Gradle / Android API 36 produce universal and arm64-v8a APKs.
`android-version.json` controls the monotonically increasing app version.
GitHub Actions builds signed releases; `update.json` advertises their exact
hashes, sizes, version, and package name. Native update code checks those
fields and the installed APK signing certificate before invoking Android's
installer. WorkManager handles optional update-only notifications. See
`ANDROID.md` for installation, signing setup, and release instructions.
