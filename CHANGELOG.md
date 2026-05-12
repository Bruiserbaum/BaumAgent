# Changelog

All notable changes to BaumAgent will be documented in this file.

## [0.6.1] — 2025-07-14

### Added
- **Agent Log HTML sanitizer**: When the Agent Log contains embedded HTML (e.g. from server error responses returning HTML pages instead of JSON), it is now automatically detected and converted to clean, readable plain text before display.
- New `sanitizeLog` utility (`frontend/src/utils/sanitizeLog.ts`) that uses the browser's `DOMParser` to extract meaningful text content from HTML fragments, with a regex-based fallback.
- New reusable `LogTerminal` component (`frontend/src/components/LogTerminal.tsx`) that wraps the sanitization logic with `forwardRef` support.

### Changed
- `TaskDetail.tsx` now passes log text through `sanitizeLog()` via `useMemo` before rendering in the Agent Log terminal, so HTML-heavy log output appears as structured plain text instead of raw markup.

## [0.6.0] — 2025-07-13

### Added
- **Document attachments in AI Chat**: Users can now attach PDF, Word (.docx), Excel (.xlsx/.xls), and CSV files to chat messages via a 📎 paperclip button next to the input area.
- New backend endpoint `POST /api/chat/upload-document` that accepts file uploads and extracts text content for use in chat context.
- New `document_service.py` backend service with text extraction support for:
  - **PDF** files (via PyPDF2, page-by-page extraction)
  - **Word .docx** files (via python-docx, paragraphs and tables)
  - **Excel .xlsx/.xls** files (via openpyxl, all sheets with pipe-delimited columns)
  - **CSV** files (via Python stdlib csv module)
- Document content is injected into the LLM prompt as structured text blocks, enabling the AI to read, analyze, and work with file contents.
- Attached documents are shown as styled badges in chat messages and the input area, with file-type-specific emoji icons.
- Added `openpyxl>=3.1.0` and `PyPDF2>=3.0.0` to backend dependencies.

### Changed
- Chat API (`POST /api/chat`) now accepts an optional `documents` field (list of `{filename, content}` objects) alongside the existing `images` field.
- Frontend API client `chat()` method updated with an optional `documents` parameter.
- `ChatMessage` interface in `App.tsx` extended with optional `images` and `documents` fields.
