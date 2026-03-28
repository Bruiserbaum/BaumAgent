# Changelog

All notable changes to BaumAgent will be documented in this file.

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
