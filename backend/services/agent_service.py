import base64
import json
import os
import re
import traceback
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy.orm import Session

from config import Settings
from models.task import Task, TaskStatus
from services.github_service import GitHubService
from services.llm import get_llm_client
from services.llm.base import ToolDefinition
from services import search_service
from routers.settings import get_doc_format


def _build_code_system_prompt(opts: dict) -> str:
    """Build the Github Coding system prompt dynamically based on task options."""
    delivery_mode = opts.get("delivery_mode", "pr_mode")
    build_after = opts.get("build_after_change", True)
    create_artifacts = opts.get("create_release_artifacts", False)
    publish_release = opts.get("publish_release", True)
    update_docs = opts.get("update_docs", "if_needed")
    update_changelog = opts.get("update_changelog", True)

    parts = [
        "You are BaumAgent, an autonomous AI software engineer working on a GitHub repository.\n",
        "STEP 1 — INSPECT\n"
        "Before touching any file:\n"
        "- Read README and main project configuration files (package.json, pyproject.toml, Cargo.toml, etc.)\n"
        "- Identify the language, framework, build/test commands, and overall code layout\n"
        "- Locate the files most likely relevant to the requested change\n",
        "STEP 2 — PLAN\n"
        "Create a brief internal implementation plan:\n"
        "- List the files that will change and why\n"
        "- Describe the behaviour being added or modified\n"
        "- Do not open a pull request yet\n",
        "STEP 3 — IMPLEMENT\n"
        "Make the code changes:\n"
        "- Edit only files directly relevant to the task\n"
        "- Preserve existing code style and patterns\n"
        "- Avoid unrelated refactors unless they are strictly required\n",
    ]

    if build_after:
        parts.append(
            "STEP 4 — VALIDATE\n"
            "After making changes:\n"
            "- Run linting if a linter is configured (eslint, ruff, pylint, etc.)\n"
            "- Run the test suite if tests exist\n"
            "- Run the build if applicable (npm run build, cargo build, dotnet build, etc.)\n"
            "- Record any failures clearly in your finish() summary\n"
        )

    parts.append(
        "STEP 5 — VERIFY\n"
        "Before delivering:\n"
        "- Confirm git diff is non-empty; if no files changed stop and call finish() reporting failure\n"
        "- Summarise every changed file and the reason it changed\n"
    )

    if update_changelog:
        parts.append(
            "STEP 6 — CHANGELOG\n"
            "Add an entry to CHANGELOG.md (create it if absent) describing what changed, why, "
            "and which version it targets. Keep existing entries intact.\n"
        )

    docs_instruction = {
        "always": "Update README.md and any relevant docs unconditionally.",
        "if_needed": "Update README.md and docs only when the change affects setup, usage, CLI flags, or public API.",
        "never": "Do not modify documentation files.",
    }.get(update_docs, "Update README.md if the change affects setup or usage.")
    parts.append(f"STEP 7 — DOCS\n{docs_instruction}\n")

    if create_artifacts:
        artifact_note = (
            "STEP 8 — RELEASE ARTIFACTS\n"
            "Build release/installer artifacts if a build script exists "
            "(install.sh, setup.py, Makefile, .nsis, .iss, CMakeLists.txt, build.gradle, pom.xml). "
            "Increment the version (patch bump unless a significant feature → minor bump).\n"
        )
        if publish_release:
            artifact_note += "After building, create a GitHub release tag and publish it.\n"
        parts.append(artifact_note)
    else:
        # Still version-bump if there's a version file
        parts.append(
            "STEP 8 — VERSION\n"
            "Search for a version file (package.json, setup.py, pyproject.toml, Cargo.toml, VERSION, "
            "version.txt, __version__.py, AssemblyInfo.cs). If found, increment the patch version "
            "(e.g. 1.2.3 → 1.2.4). For a significant new feature use a minor bump (1.2.3 → 1.3.0). "
            "If no version file exists, skip this step. Do not create a release tag.\n"
        )

    delivery_instructions = {
        "plan_only": (
            "DELIVERY\n"
            "You are in PLAN-ONLY mode. Analyse the repository and produce the implementation plan "
            "from Step 2, but do NOT make any file edits. Call finish() with the plan as your summary.\n"
        ),
        "pr_mode": (
            "DELIVERY\n"
            "You are in PR mode. After all changes are validated, the system will automatically "
            "create a branch, commit, push, and open a pull request. Your job is to complete all "
            "steps above and call finish() with a summary. Do not commit or push yourself.\n"
        ),
        "direct_commit": (
            "DELIVERY\n"
            "You are in DIRECT-COMMIT mode. After all changes are validated, the system will "
            "commit and push directly to the base branch. Your job is to complete all steps above "
            "and call finish() with a summary. Do not commit or push yourself.\n"
        ),
    }.get(delivery_mode, "")
    parts.append(delivery_instructions)

    parts.append(
        "FINISH\n"
        "Call finish() with a summary covering: the main changes made, validation results, "
        "version bump (if any), changelog entry (if any), and docs updates (if any). "
        "If no files changed, set the summary to clearly state that no changes were made.\n"
    )

    return "\n".join(parts)

def _build_structured_doc_system_prompt(opts: dict) -> str:
    """Build a dynamic system prompt for plan/proposal document generation."""
    mode = opts.get("document_mode", "plan")
    audience = opts.get("audience", "internal team")
    tone = opts.get("tone", "formal")
    detail = opts.get("detail_level", "standard")
    include_exec = opts.get("include_exec_summary", True)
    include_budget = opts.get("include_budget_section", True)
    include_timeline = opts.get("include_timeline_section", True)
    include_risks = opts.get("include_risks_section", True)
    include_appendix = opts.get("include_appendix", False)

    mode_label = {
        "plan": "Implementation Plan",
        "proposal": "Proposal",
        "proposal_with_plan": "Proposal with Implementation Plan",
    }.get(mode, "Plan")

    # Build required section list based on mode and toggles
    if mode == "plan":
        sections = ["Overview", "Objective", "Scope", "Current State / Background", "Proposed Approach"]
        if include_timeline:
            sections.append("Timeline / Phases")
        sections.append("Roles and Responsibilities")
        if include_budget:
            sections.append("Budget / Cost Estimate")
        if include_risks:
            sections.append("Risks and Mitigation")
        sections += ["Success Measures", "Next Steps"]
    elif mode == "proposal":
        sections = (["Executive Summary"] if include_exec else []) + [
            "Problem or Need", "Proposed Solution", "Expected Value / Why This Matters"]
        if include_timeline:
            sections.append("Implementation Overview")
        if include_budget:
            sections.append("Estimated Cost / Funding Request")
        if include_risks:
            sections.append("Risks and Considerations")
        sections += ["Decision Needed", "Conclusion"]
    else:  # proposal_with_plan
        sections = (["Executive Summary"] if include_exec else []) + [
            "Problem or Need", "Proposed Solution", "Expected Value / Why This Matters",
            "Objective", "Scope"]
        if include_timeline:
            sections.append("Timeline / Phases")
        sections.append("Roles and Responsibilities")
        if include_budget:
            sections.append("Budget / Cost Estimate")
        if include_risks:
            sections.append("Risks and Mitigation")
        sections += ["Success Measures", "Decision Needed", "Next Steps"]

    if include_appendix:
        sections.append("Appendix")

    sections_list = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(sections))

    tone_desc = {
        "formal": "formal and professional",
        "leadership": "executive-facing — clear, decisive, strategic-level; avoid jargon",
        "operational": "operational — direct, practical, action-oriented",
        "persuasive": "persuasive — compelling, benefit-focused, builds a clear case for action",
    }.get(tone, "formal and professional")

    detail_desc = {
        "brief": "concise (1–2 paragraphs per section, focus on essentials only)",
        "standard": "standard depth (3–5 paragraphs per major section, thorough but not exhaustive)",
        "extensive": "extensive (full narrative depth — elaborate on all implications, include full "
                     "justification for every recommendation, leave no question unanswered)",
    }.get(detail, "standard depth")

    mode_instruction = {
        "plan": (
            "You are writing a Plan. Focus entirely on execution: how the work will be structured, "
            "who does what, what the phases and milestones are, how resources are allocated, "
            "and how risks will be managed. The reader should finish this document knowing exactly "
            "how the work will be carried out."
        ),
        "proposal": (
            "You are writing a Proposal. Focus on the business case: what problem exists, why it matters, "
            "what the proposed solution is, what the expected value is, and what decision or funding is being requested. "
            "The reader should finish this document knowing exactly why they should approve or fund this."
        ),
        "proposal_with_plan": (
            "You are writing a combined Proposal and Implementation Plan. First make the case for why this should be "
            "approved (the proposal sections), then provide the execution detail (the plan sections). "
            "Both halves must be fully developed — not abbreviated."
        ),
    }.get(mode, "")

    return (
        f"You are a planning and proposal-writing agent. Your role is to transform user-provided "
        f"notes, context, and requirements into a polished, professional {mode_label} document.\n\n"

        f"{mode_instruction}\n\n"

        f"TARGET AUDIENCE: {audience}\n"
        f"TONE: {tone_desc}\n"
        f"DETAIL LEVEL: {detail_desc}\n\n"

        f"REQUIRED SECTIONS (produce in this order):\n{sections_list}\n\n"

        "PROCESS\n"
        "Step 1 — Analyze the inputs:\n"
        "  Extract all goals, constraints, dates, dependencies, stakeholder groups, cost/budget items, "
        "and assumptions from the provided context. Note what each required section will need to address.\n\n"

        "Step 2 — Infer document shape:\n"
        "  Decide if any sections need sub-sections given complexity. Identify where tables are more "
        "useful than prose (budget line items, phase timelines, risk registers, roles matrix).\n\n"

        "Step 3 — Draft every section:\n"
        "  Write full prose paragraphs — not bulleted summaries. Add logical sequencing, rationale, "
        "practical implications, and measurable outcomes where relevant.\n"
        "  For budget and timeline sections, format as a table using plain text with pipe separators:\n"
        "  | Phase | Duration | Deliverables | Owner |\n"
        "  | Budget Item | Estimated Cost | Notes |\n\n"

        "Step 4 — Review before finishing:\n"
        "  Confirm all required sections are present and fully written. Check tone consistency. "
        "Verify no unsupported factual claims have been introduced.\n\n"

        "INTEGRITY RULES — NON-NEGOTIABLE:\n"
        "  - Expand and organize the user-provided information aggressively into well-structured prose.\n"
        "  - DO NOT invent numbers, vendor capabilities, specific costs, dates, policies, or approvals "
        "that are not present in the user's input.\n"
        "  - Where information is missing, use clearly labeled placeholders: [TBD], "
        "[Assumption: describe assumption here], or [Requires Confirmation].\n"
        "  - CORRECT: 'Based on the timeline provided, a phased rollout would reduce implementation risk.'\n"
        "  - INCORRECT: 'This will save $42,000 annually' when no such figure was provided.\n\n"

        "OUTPUT:\n"
        "Call finish() with:\n"
        "  - title: the document title as a string\n"
        "  - sections: an ordered list of {heading, content} objects\n"
        "    Each content field must be full prose paragraphs. Tables are embedded in content using "
        "plain pipe-separated rows.\n"
        "Do not call finish() until every required section is fully written."
    )


STRUCTURED_DOC_TOOL_DEFINITIONS: list = [
    {
        "name": "web_search",
        "description": "Search the web for context, benchmarks, templates, or supporting information.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query."}},
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read the content of a URL for additional context.",
        "parameters": {
            "type": "object",
            "properties": {"url": {"type": "string", "description": "URL to fetch."}},
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": "Deliver the completed document. Call only when all required sections are fully written.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The full document title.",
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": {"type": "string", "description": "Section heading."},
                            "content": {"type": "string", "description": "Full prose content of this section."},
                        },
                        "required": ["heading", "content"],
                    },
                    "description": "Ordered list of document sections with full prose content.",
                },
            },
            "required": ["title", "sections"],
        },
    },
]


CODING_SYSTEM_PROMPT = (
    "You are BaumAgent, an autonomous AI script and code generator.\n\n"

    "Your job is to write complete, production-ready scripts or code files based on the user's "
    "description. You are NOT working inside a GitHub repository — you write files directly to "
    "an output directory that the user can download.\n\n"

    "PROCESS\n"
    "1. Understand exactly what the user needs: the language, platform, inputs, outputs, and "
    "any edge cases.\n"
    "2. Use web_search and read_url if you need to look up APIs, syntax, or best practices.\n"
    "3. Write the complete, working script(s) using write_file. Include helpful comments.\n"
    "4. If the task warrants multiple files (e.g. a main script + a helper module + a config), "
    "write all of them.\n"
    "5. Call finish() with the filename of the primary output file and a summary of what was "
    "created and how to use it.\n\n"

    "WRITING STANDARDS\n"
    "- Write complete, runnable code — no placeholders, no TODO stubs.\n"
    "- Include inline comments explaining non-obvious logic.\n"
    "- Handle errors and edge cases gracefully.\n"
    "- For shell/PowerShell scripts, include usage instructions at the top as comments.\n"
    "- For Python scripts, include a main() function and if __name__ == '__main__' guard."
)

RESEARCH_SYSTEM_PROMPT = (
    "You are a research reporting agent. Your job is not to provide a brief answer, but to "
    "produce a fully developed written report.\n\n"

    "PROCESS\n"
    "When given a topic, follow this process:\n"
    "1. Internally create a structured outline with the major sections needed to cover the topic "
    "thoroughly.\n"
    "2. For each section, identify the specific questions that must be answered.\n"
    "3. Research and draft each section separately — run dedicated web searches per section, "
    "read full pages with read_url, not just search snippets.\n"
    "4. After all sections are researched, synthesize them into a final document with smooth "
    "transitions between sections.\n"
    "5. Before calling finish(), review the draft for thin sections, missing dimensions, or "
    "over-summarized content and expand where necessary.\n\n"

    "SECTION REQUIREMENTS\n"
    "Every major section must include:\n"
    "- A thorough explanation of the topic or subtopic\n"
    "- Important evidence, data, or findings\n"
    "- Practical implications for the reader\n"
    "- Limitations, risks, or counterarguments\n"
    "- Concrete examples where relevant\n\n"

    "WRITING REQUIREMENTS\n"
    "- Prefer completeness over brevity. Do not compress complex topics into one-liners.\n"
    "- Write in full paragraphs with substance. Avoid thin bullet lists.\n"
    "- Aim for a substantial, multi-section report unless the user explicitly asks for a summary.\n"
    "- Include an executive summary section at the top, but preserve full detail in the body.\n"
    "- Write like an analyst preparing a briefing document, not a chatbot answering a question.\n"
    "- Synthesize — do not merely restate facts. Highlight patterns, contradictions, and "
    "what matters most.\n\n"

    "OUTPUT FORMAT\n"
    "Call finish() with:\n"
    "- title: a descriptive report title (string)\n"
    "- sections: a list of {heading, content} objects where each content field is multiple "
    "full paragraphs of developed prose (not one-line summaries)\n"
    "- sources: list of URLs cited\n\n"

    "Do not call finish() until every planned section is fully drafted with multiple substantive "
    "paragraphs. A section with one or two sentences is not complete."
)

RESEARCH_DEEP_STUDY_PROMPT = (
    "You are a deep-study research agent. You produce structured, authoritative study documents "
    "modeled after rigorous biblical commentary, legal analysis, and academic reference works — "
    "direct, source-heavy, and built for serious readers who want the full picture.\n\n"

    "STYLE MODEL\n"
    "Your output should read like an expert who has fully mastered the topic and is now "
    "walking the reader through it step by step. The tone is authoritative, direct, and "
    "never hedging. Do not say 'some might argue' — state positions clearly and support them. "
    "Avoid filler, padding, or transitional fluff. Every sentence carries weight.\n\n"

    "SECTION STRUCTURE (apply to every major section)\n"
    "1. Section heading — phrased as a direct question or a bold declarative (e.g. 'Does X Support Y?')\n"
    "2. Direct answer — answer the question immediately in 1–3 sentences before any analysis.\n"
    "3. Primary source evidence — quote primary sources verbatim with inline citations. "
    "For non-textual topics, cite data, founding documents, expert consensus, or case studies.\n"
    "4. Breakdown — a subsection titled 'Breakdown' that explains what the evidence means and "
    "what it does NOT mean. Clarify common misreadings.\n"
    "5. Contrast — where applicable, show what the evidence directs (✔) vs what it does NOT "
    "direct (✖). Use short punchy lines for each.\n\n"

    "REQUIRED SECTIONS\n"
    "Structure your document to include these types of sections (adapt headings to the topic):\n"
    "- What Is [Topic]? — foundational definition with primary-source grounding\n"
    "- Historical/Origin Context — how it developed or where it comes from\n"
    "- What the Evidence Actually Says — direct examination of primary sources\n"
    "- Common Errors on Both Sides — two errors (overcorrection in each direction)\n"
    "- [Topic]-Specific Deep Dives — 2–4 focused sub-questions from the prompt\n"
    "- How Major Traditions/Positions Differ — perspectives with 'why' explained\n"
    "- The Real Standard — the core criteria that matter, stripped of noise\n"
    "- Straight Answer / Bottom Line — final verdict with ✔/✖ lists\n\n"

    "WRITING REQUIREMENTS\n"
    "- Short paragraphs. One idea per paragraph. No multi-topic paragraphs.\n"
    "- Bold key terms, concepts, and critical phrases inline (e.g. **self-examination**).\n"
    "- Use direct quotes from authoritative sources. Attribute them exactly.\n"
    "- After presenting evidence, always explain its implications in plain language.\n"
    "- Cover the errors on both extremes — do not only criticize one side.\n"
    "- State the 'real litmus test' or practical takeaway for each major section.\n"
    "- Do not compress complex distinctions into a single sentence. Unpack them.\n"
    "- Prefer completeness. If a question deserves two paragraphs, write two.\n\n"

    "TONE\n"
    "Authoritative. Not arrogant. Willing to say 'the evidence does not support X' directly. "
    "Willing to say 'the short answer is: rarely, situationally — but not as the model.' "
    "State positions. Do not bury conclusions in qualifications.\n\n"

    "OUTPUT FORMAT\n"
    "Call finish() with:\n"
    "- title: a sharp, descriptive title for the study document\n"
    "- sections: a list of {heading, content} objects. Each section must be fully developed. "
    "Headings should be direct questions or bold declarations. Content must include: direct "
    "answer, primary source quotes with citations, breakdown analysis, and practical takeaway.\n"
    "- sources: list of all URLs and sources cited\n\n"

    "Do not call finish() until every section is fully developed. A section is not complete "
    "until it includes a direct answer, evidence, breakdown, and practical implication."
)

DEEP_RESEARCH_PROMPT = (
    "You are a deep-research agent. You produce authoritative, well-structured study documents "
    "modeled after rigorous theological commentary, legal analysis, and academic reference works — "
    "direct, source-heavy, and built for serious readers who want the full picture.\n\n"

    "STYLE MODEL\n"
    "Your output should read like an expert who has fully mastered the topic and is walking "
    "the reader through it step by step. The tone is authoritative, direct, and never hedging. "
    "Do not say 'some might argue' — state positions clearly and support them with evidence. "
    "Avoid filler, padding, or transitional fluff. Every sentence carries weight.\n\n"

    "SECTION STRUCTURE (apply to every major section)\n"
    "1. Section heading — written as a bold declarative statement (e.g. 'The Role of Discipline in Scripture'). "
    "Do NOT phrase headings as questions.\n"
    "2. Open directly with the substance of the section — no 'Direct answer:' label, no meta-commentary. "
    "Begin immediately with the argument, evidence, or definition.\n"
    "3. Primary source evidence — quote primary sources verbatim with inline citations. "
    "For non-textual topics, cite data, founding documents, expert consensus, or case studies.\n"
    "4. Breakdown — a subsection titled 'Breakdown' that explains what the evidence means and "
    "what it does NOT mean. Clarify common misreadings.\n"
    "5. Contrast — where applicable, show what the evidence directs (✔) vs what it does NOT "
    "direct (✖). Use short, punchy lines for each.\n\n"

    "BIBLICAL VERSES\n"
    "Whenever a biblical passage is referenced or cited, write out the full verse text in NIV "
    "(New International Version) wording, followed by the reference in parentheses. "
    "Do not paraphrase or abbreviate the verse — quote it exactly as it appears in the NIV. "
    "Example: 'I can do all this through him who gives me strength. (Philippians 4:13, NIV)'\n\n"

    "REQUIRED SECTIONS\n"
    "Structure your document to include these types of sections (adapt headings to the topic):\n"
    "- Foundational Definition — what the topic is, grounded in primary sources\n"
    "- Historical and Origin Context — how it developed or where it comes from\n"
    "- What the Evidence Actually Says — direct examination of primary sources\n"
    "- Common Errors on Both Sides — two errors (overcorrection in each direction)\n"
    "- Deep Dives — 2–4 focused sub-topics drawn from the prompt\n"
    "- How Major Traditions or Positions Differ — perspectives with 'why' explained\n"
    "- The Real Standard — the core criteria that matter, stripped of noise\n"
    "- Bottom Line — final verdict with ✔/✖ lists\n\n"

    "WRITING REQUIREMENTS\n"
    "- Short paragraphs. One idea per paragraph. No multi-topic paragraphs.\n"
    "- Bold key terms, concepts, and critical phrases inline (e.g. **faithfulness**).\n"
    "- Use direct quotes from authoritative sources. Attribute them exactly.\n"
    "- After presenting evidence, always explain its implications in plain language.\n"
    "- Cover the errors on both extremes — do not only criticize one side.\n"
    "- State the practical takeaway for each major section.\n"
    "- Do not compress complex distinctions into a single sentence. Unpack them.\n"
    "- Prefer completeness. If a topic deserves two paragraphs, write two.\n"
    "- Use only standard printable characters. Do not use curly quotes, en-dashes, em-dashes, "
    "or any non-ASCII punctuation — use straight quotes, hyphens, and standard ASCII only.\n\n"

    "TONE\n"
    "Authoritative. Not arrogant. Willing to say 'the evidence does not support X' directly. "
    "State positions clearly. Do not bury conclusions in qualifications.\n\n"

    "OUTPUT FORMAT\n"
    "Call finish() with:\n"
    "- title: a sharp, descriptive title for the study document\n"
    "- sections: a list of {heading, content} objects. Each section must be fully developed. "
    "Headings must be bold declarative statements (not questions). Content must include: "
    "substantive analysis, primary source quotes with citations (full NIV text for any Bible "
    "verse), breakdown analysis, and practical takeaway. Do NOT begin any content with the "
    "words 'Direct answer'.\n"
    "- sources: list of all URLs and sources cited\n\n"

    "Do not call finish() until every section is fully developed. A section is not complete "
    "until it includes evidence, breakdown, and practical implication."
)


def _build_research_system_prompt(opts: dict) -> str:
    """Return the appropriate system prompt based on research_style in opts."""
    if opts.get("research_style") == "deep_study":
        return RESEARCH_DEEP_STUDY_PROMPT
    return RESEARCH_SYSTEM_PROMPT


def _clean_research_sections(sections: list[dict]) -> list[dict]:
    """Strip common encoding artifacts and odd punctuation from section content.

    Fixes double-encoded UTF-8 mojibake (e.g. â€" -> --, â€˜ -> '),
    curly/smart quotes, and other non-ASCII punctuation that renders
    as garbage in PDF/DOCX output.
    """
    import re

    # Map of known mojibake sequences -> clean ASCII replacements
    replacements = [
        # Em-dash variants
        ('\u00e2\u20ac\u201c', '--'),   # â€" (double-encoded em-dash)
        ('\u00e2\u20ac\u201d', '--'),   # â€" variant
        ('\u2014', '--'),               # actual em-dash U+2014
        ('\u2013', '-'),                # en-dash U+2013
        # Smart/curly quotes
        ('\u2018', "'"),                # left single quote
        ('\u2019', "'"),                # right single quote / apostrophe
        ('\u201c', '"'),                # left double quote
        ('\u201d', '"'),                # right double quote
        # Other common artifacts
        ('\u00e2\u20ac\u2122', "'"),    # â€™ (double-encoded right single quote)
        ('\u00e2\u20ac\u0153', '"'),    # â€œ (double-encoded left double quote)
        ('\u00e2\u20ac', '"'),          # â€ fragment
        ('\u00c2\u00a0', ' '),          # non-breaking space
        ('\u00a0', ' '),               # non-breaking space U+00A0
        ('\u2026', '...'),             # ellipsis U+2026
        ('\u00e2\u20ac\u00a6', '...'), # double-encoded ellipsis
    ]

    cleaned = []
    for sec in sections:
        content = sec.get('content', '')
        heading = sec.get('heading', '')
        for bad, good in replacements:
            content = content.replace(bad, good)
            heading = heading.replace(bad, good)
        # Strip any remaining non-ASCII characters that aren't useful symbols
        # Keep: checkmarks ✔ ✖, degree °, arrows, bullets •
        keep_chars = set('\u2714\u2716\u00b0\u2022\u2192\u2190\u2191\u2193')
        content = ''.join(c if (ord(c) < 128 or c in keep_chars) else '' for c in content)
        heading = ''.join(c if (ord(c) < 128 or c in keep_chars) else '' for c in heading)
        # Collapse multiple spaces introduced by removals
        content = re.sub(r'  +', ' ', content)
        heading = re.sub(r'  +', ' ', heading)
        cleaned.append({'heading': heading, 'content': content})
    return cleaned

# Tools available for code tasks
CODE_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "list_dir",
        "description": "List files and directories at the given path (relative to repo root).",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path inside the repository. Use '.' for root.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file (relative to repo root). Returns up to 8000 characters.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file inside the repository.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file (relative to repo root). Creates directories as needed.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file inside the repository.",
                },
                "content": {
                    "type": "string",
                    "description": "The full content to write to the file.",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file from the repository.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file to delete.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL. Returns the first 3000 characters of the page text.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch.",
                }
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that the task is complete. Call this when all changes are done.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "A summary of the changes made.",
                }
            },
            "required": ["summary"],
        },
    },
]

# Tools available for research tasks
RESEARCH_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL. Returns the first 3000 characters of the page text.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch.",
                }
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": (
            "Signal that research is complete. Call this with a structured report. "
            "sections is a list of {heading, content} objects. sources is a list of URLs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the research report.",
                },
                "sections": {
                    "type": "array",
                    "description": "List of report sections.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["heading", "content"],
                    },
                },
                "sources": {
                    "type": "array",
                    "description": "List of source URLs cited in the report.",
                    "items": {"type": "string"},
                },
            },
            "required": ["title", "sections", "sources"],
        },
    },
]

# Tools available for local coding / script-generation tasks
CODING_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "write_file",
        "description": "Write a file to the output directory. Use this to create scripts, code files, configs, etc.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Filename including extension, e.g. 'script.ps1' or 'utils/helper.py'.",
                },
                "content": {
                    "type": "string",
                    "description": "The complete file content.",
                },
            },
            "required": ["filename", "content"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a file you previously wrote, to review or build on it.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Filename to read (must have been written in this session).",
                }
            },
            "required": ["filename"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch."}
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that all scripts are written and ready.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Summary of what was created and how to use it.",
                },
                "main_file": {
                    "type": "string",
                    "description": "Filename of the primary output script/file.",
                },
            },
            "required": ["summary", "main_file"],
        },
    },
]

# Keep backward-compatible alias pointing to code tools
TOOL_DEFINITIONS = CODE_TOOL_DEFINITIONS


class AgentService:
    def __init__(self, task: Task, db: Session, settings: Settings) -> None:
        self._task = task
        self._db = db
        self._settings = settings
        self._repo_path: str = ""
        self._output_dir: str = ""
        self._finished: bool = False
        self._research_result: dict | None = None
        self._coding_result: dict | None = None
        self._structured_doc_result: dict | None = None
        self._collected_image_urls: list[str] = []

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _log(self, message: str) -> None:
        print(message, flush=True)
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        self._task.log = (self._task.log or "") + line
        self._task.updated_at = datetime.now(timezone.utc)
        self._db.commit()

    async def _fetch_gitnexus_context(self, task, db) -> str | None:
        """Query GitNexus for code snippets relevant to this task and repo.

        Powered by GitNexus (https://github.com/abhigyanpatwari/GitNexus).
        Returns None silently if GitNexus is disabled, unreachable, or returns no results.
        """
        try:
            from routers.settings import _get_user_settings
            from models.user import User as UserModel

            user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
            if user is None:
                return None
            user_settings = _get_user_settings(user)
            gn = user_settings.get("gitnexus", {})
            if not gn.get("enabled", False):
                return None

            gitnexus_url = gn.get("url", "http://gitnexus:4747").rstrip("/")
            query = task.description[:500]

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{gitnexus_url}/api/search",
                    json={"query": query, "repoUrl": task.repo_url, "limit": 5},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json()

            results = data.get("results", [])
            if not results:
                return None

            self._log(f"GitNexus: injecting {len(results)} relevant code snippet(s) as context.")
            lines = [
                "## GitNexus Code Intelligence Context",
                "The following code snippets from the repository are semantically relevant to this task:\n",
            ]
            for r in results:
                file_path = r.get("filePath") or r.get("file_path", "")
                content = r.get("content") or r.get("text", "")
                score = r.get("score")
                score_str = f" (relevance: {score:.2f})" if isinstance(score, float) else ""
                lines.append(f"### `{file_path}`{score_str}")
                lines.append(f"```\n{content}\n```\n")
            return "\n".join(lines)
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    def _abs(self, path: str) -> str:
        """Resolve a repo-relative path to an absolute path."""
        return os.path.normpath(os.path.join(self._repo_path, path))

    def _tool_list_dir(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.exists(abs_path):
            return f"Path does not exist: {path}"
        entries = os.listdir(abs_path)
        lines = []
        for entry in sorted(entries):
            full = os.path.join(abs_path, entry)
            suffix = "/" if os.path.isdir(full) else ""
            lines.append(f"{entry}{suffix}")
        return "\n".join(lines) if lines else "(empty directory)"

    def _tool_read_file(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.isfile(abs_path):
            return f"File not found: {path}"
        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read(8000)
            if os.path.getsize(abs_path) > 8000:
                content += "\n... [truncated — file exceeds 8000 characters]"
            return content
        except Exception as exc:
            return f"Error reading file: {exc}"

    def _tool_write_file(self, path: str, content: str) -> str:
        abs_path = self._abs(path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        try:
            with open(abs_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            return f"Written: {path}"
        except Exception as exc:
            return f"Error writing file: {exc}"

    def _tool_delete_file(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.isfile(abs_path):
            return f"File not found: {path}"
        try:
            os.remove(abs_path)
            return f"Deleted: {path}"
        except Exception as exc:
            return f"Error deleting file: {exc}"

    def _tool_web_search(self, query: str) -> str:
        try:
            return search_service.web_search(query)
        except Exception as exc:
            return f"Search error: {exc}"

    def _tool_read_url(self, url: str) -> str:
        try:
            resp = httpx.get(url, follow_redirects=True, timeout=10)
            raw_html = resp.text

            # Extract image URLs before stripping HTML
            img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', raw_html, re.IGNORECASE)
            for src in img_srcs:
                if src.startswith('data:'):
                    continue
                # Skip tiny icons / svgs
                if src.lower().endswith('.svg') or 'icon' in src.lower() or 'logo' in src.lower():
                    continue
                abs_url = urljoin(url, src)
                if abs_url not in self._collected_image_urls:
                    self._collected_image_urls.append(abs_url)
                if len(self._collected_image_urls) >= 10:
                    break

            # Strip HTML tags
            text = re.sub(r'<[^>]+>', '', raw_html)
            # Collapse whitespace
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:3000]
        except Exception as exc:
            return f"Error fetching URL: {exc}"

    def _tool_finish_code(self, summary: str) -> str:
        self._finished = True
        self._log(f"[finish] {summary}")
        return "Task complete."

    def _tool_finish_research(self, title: str, sections: list, sources: list) -> str:
        self._finished = True
        self._research_result = {
            "title": title,
            "sections": sections,
            "sources": sources,
        }
        self._log(f"[finish] Research complete: {title}")
        return "Research complete."

    def _tool_coding_write_file(self, filename: str, content: str) -> str:
        # Sanitize path — no traversal outside output dir
        safe_name = os.path.normpath(filename).lstrip("/\\")
        full_path = os.path.join(self._output_dir, safe_name)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        try:
            with open(full_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            size = len(content.encode("utf-8"))
            self._log(f"[write_file] {safe_name} ({size} bytes)")
            return f"Written: {safe_name}"
        except Exception as exc:
            return f"Error writing file: {exc}"

    def _tool_coding_read_file(self, filename: str) -> str:
        safe_name = os.path.normpath(filename).lstrip("/\\")
        full_path = os.path.join(self._output_dir, safe_name)
        if not os.path.isfile(full_path):
            return f"File not found: {safe_name}"
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read(8000)
        except Exception as exc:
            return f"Error reading file: {exc}"

    def _tool_finish_coding(self, summary: str, main_file: str) -> str:
        self._finished = True
        self._coding_result = {"summary": summary, "main_file": main_file}
        self._log(f"[finish] Coding complete: {main_file}")
        return "Scripts ready."

    def _tool_finish_structured_document(self, title: str, sections: list) -> str:
        self._finished = True
        self._structured_doc_result = {"title": title, "sections": sections}
        self._log(f"[finish] Document complete: {title} ({len(sections)} sections)")
        return "Document complete."

    # ------------------------------------------------------------------
    # Tool dispatcher
    # ------------------------------------------------------------------

    async def tool_executor(self, name: str, args: dict) -> str:
        task_type = getattr(self._task, "task_type", "code")

        if name == "list_dir":
            return self._tool_list_dir(args.get("path", "."))
        elif name == "read_file":
            if task_type == "coding":
                return self._tool_coding_read_file(args["filename"])
            return self._tool_read_file(args["path"])
        elif name == "write_file":
            if task_type == "coding":
                return self._tool_coding_write_file(args["filename"], args["content"])
            return self._tool_write_file(args["path"], args["content"])
        elif name == "delete_file":
            return self._tool_delete_file(args["path"])
        elif name == "web_search":
            return self._tool_web_search(args["query"])
        elif name == "read_url":
            return self._tool_read_url(args["url"])
        elif name == "finish":
            if task_type == "research":
                return self._tool_finish_research(
                    title=args.get("title", "Research Report"),
                    sections=args.get("sections", []),
                    sources=args.get("sources", []),
                )
            elif task_type == "coding":
                return self._tool_finish_coding(
                    summary=args.get("summary", ""),
                    main_file=args.get("main_file", ""),
                )
            elif task_type == "structured_document":
                return self._tool_finish_structured_document(
                    title=args.get("title", "Document"),
                    sections=args.get("sections", []),
                )
            else:
                return self._tool_finish_code(args.get("summary", ""))
        else:
            return f"Unknown tool: {name}"

    # ------------------------------------------------------------------
    # Build initial message (with optional image blocks)
    # ------------------------------------------------------------------

    def _build_initial_message(self, text: str):
        """Return str if no images, else a list of content blocks."""
        image_blocks = []
        image_paths = json.loads(self._task.images or "[]")
        for img_path in image_paths:
            full_path = f"/app/data/{img_path}"
            if os.path.exists(full_path):
                with open(full_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                ext = img_path.rsplit('.', 1)[-1].lower()
                media_type = {
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "gif": "image/gif",
                    "webp": "image/webp",
                }.get(ext, "image/png")
                image_blocks.append({"type": "image", "data": b64, "media_type": media_type})

        if image_blocks:
            return [{"type": "text", "text": text}] + image_blocks
        return text  # plain str — no images

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    async def _dispatch(self, task_type: str, task, db, settings, llm_client) -> None:
        """Dispatch to the appropriate runner based on task_type."""
        if task_type == "research":
            await self._run_research(task, db, llm_client)
        elif task_type == "deep_research":
            await self._run_deep_research(task, db, llm_client)
        elif task_type == "coding":
            await self._run_coding(task, db, llm_client)
        elif task_type == "structured_document":
            await self._run_structured_document(task, db, llm_client)
        else:
            await self._run_code(task, db, settings, llm_client)

    def _task_produced_output(self, task_type: str) -> bool:
        """Return True if the agent actually finished and produced usable output."""
        if task_type in ("research", "deep_research"):
            return self._research_result is not None
        if task_type == "coding":
            return self._coding_result is not None
        if task_type == "structured_document":
            return self._structured_doc_result is not None
        # For code tasks, success is measured by task status being set to COMPLETE
        return self._finished

    async def run(self) -> None:
        task = self._task
        db = self._db
        settings = self._settings

        # 1. Mark task as running
        task.status = TaskStatus.RUNNING
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Task started.")

        task_type = getattr(task, "task_type", "code")
        opts: dict = json.loads(task.extra_data or "{}")
        fallback_enabled = opts.get("fallback_to_anthropic", False)
        fallback_model = opts.get("fallback_anthropic_model", "claude-sonnet-4-6")
        primary_backend = task.llm_backend

        llm_client = get_llm_client(primary_backend, task.llm_model, settings)
        self._log(f"Starting agent loop with {primary_backend}/{task.llm_model}")

        primary_failed = False
        primary_error: Exception | None = None

        try:
            await self._dispatch(task_type, task, db, settings, llm_client)
        except Exception as exc:
            primary_failed = True
            primary_error = exc
            self._log(f"[error] Primary model raised an exception: {exc}")

        # Check if we should fall back: exception OR agent never called finish()
        should_fallback = (
            fallback_enabled
            and primary_backend != "anthropic"
            and settings.anthropic_api_key
            and (primary_failed or not self._task_produced_output(task_type))
        )

        if should_fallback:
            reason = "exception" if primary_failed else "did not produce output"
            self._log(
                f"[fallback] Primary model ({primary_backend}/{task.llm_model}) {reason}. "
                f"Retrying with Anthropic {fallback_model} ..."
            )
            # Reset task to RUNNING for the retry
            task.status = TaskStatus.RUNNING
            task.updated_at = datetime.now(timezone.utc)
            db.commit()

            fallback_client = get_llm_client("anthropic", fallback_model, settings)
            await self._dispatch(task_type, task, db, settings, fallback_client)

        elif primary_failed:
            # No fallback — re-raise so the worker marks the task as FAILED
            raise primary_error  # type: ignore[misc]

    async def _run_research(self, task, db, llm_client) -> None:
        """Run a research task: web search + document generation, no GitHub."""
        initial_message_text = (
            f"Research task: {task.description}\n\n"
            "Follow the full research process:\n"
            "1. Plan your sections and the questions each must answer.\n"
            "2. Research each section with dedicated searches — use read_url to read full pages, "
            "not just search snippets.\n"
            "3. Draft each section with multiple full paragraphs covering: explanation, evidence, "
            "implications, risks/counterarguments, and examples.\n"
            "4. Review for thin or over-summarized sections and expand them.\n"
            "5. Only then call finish() with the complete structured report.\n\n"
            "Do not call finish() early. A section is not complete if it contains only one or "
            "two sentences."
        )
        initial_content = self._build_initial_message(initial_message_text)

        self._finished = False
        self._research_result = None
        self._collected_image_urls = []

        try:
            _extra_opts = json.loads(task.extra_data or "{}")
        except Exception:
            _extra_opts = {}

        await llm_client.run_agent_loop(
            system=_build_research_system_prompt(_extra_opts),
            initial_message=initial_content,
            tools=RESEARCH_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        # Generate document if research result is available
        if self._research_result:
            from services.research_service import generate_document
            output_format = getattr(task, "output_format", None) or "pdf"
            output_dir = f"/app/data/outputs/{task.id}"
            self._log(f"Generating {output_format.upper()} document ...")
            try:
                # Try to load user's doc format settings
                try:
                    from models.user import User as UserModel
                    from routers.settings import _get_user_settings, get_doc_format as _get_doc_fmt
                    _user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                    _user_cfg = _get_user_settings(_user) if _user else None
                    _fmt = _get_doc_fmt(_user_cfg)
                except Exception:
                    _fmt = get_doc_format()
                output_file = generate_document(
                    title=self._research_result["title"],
                    sections=self._research_result["sections"],
                    sources=self._research_result["sources"],
                    output_format=output_format,
                    output_dir=output_dir,
                    fmt=_fmt,
                    image_urls=self._collected_image_urls if _fmt.get("include_images") else [],
                )
                task.output_file = output_file
                db.commit()
                if os.path.exists(output_file):
                    size = os.path.getsize(output_file)
                    self._log(f"Document saved: {output_file} ({size} bytes)")
                else:
                    self._log(f"[ERROR] generate_document returned path but file does not exist: {output_file}")
                    task.output_file = None
                    db.commit()
            except Exception as _doc_err:
                self._log(f"[ERROR] Document generation failed: {_doc_err}\n{traceback.format_exc()}")
        else:
            self._log("WARNING: LLM did not call finish() — no research result to generate document from.")

        # Upload to SMB share if configured by user
        if task.output_file:
            try:
                from models.user import User as UserModel
                from routers.settings import _get_user_settings
                _smb_user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                if _smb_user:
                    _smb_user_cfg = _get_user_settings(_smb_user)
                    smb_cfg = _smb_user_cfg.get("smb", {})
                    if smb_cfg.get("enabled"):
                        from services.smb_service import upload_to_smb
                        unc = upload_to_smb(task.output_file, smb_cfg)
                        self._log(f"[smb] Uploaded to {unc}")
            except Exception as _smb_err:
                self._log(f"[smb] Upload failed (non-fatal): {_smb_err}")

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_deep_research(self, task, db, llm_client) -> None:
        """Run a deep-research task: authoritative study document with NIV verses and symbol cleanup."""
        initial_message_text = (
            f"Deep research task: {task.description}\n\n"
            "Follow the full research process:\n"
            "1. Plan your sections as bold declarative headings — not questions.\n"
            "2. Research each section thoroughly — use read_url to read full pages, "
            "not just search snippets.\n"
            "3. Draft each section with multiple full paragraphs: argument, evidence, "
            "breakdown, and practical implication.\n"
            "4. For every biblical verse referenced, write the full NIV text followed by "
            "the reference in parentheses.\n"
            "5. Do NOT begin any section content with the words 'Direct answer'.\n"
            "6. Review for thin sections and expand before calling finish().\n\n"
            "Do not call finish() early. A section is not complete if it contains only "
            "one or two sentences."
        )
        initial_content = self._build_initial_message(initial_message_text)

        self._finished = False
        self._research_result = None
        self._collected_image_urls = []

        await llm_client.run_agent_loop(
            system=DEEP_RESEARCH_PROMPT,
            initial_message=initial_content,
            tools=RESEARCH_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        if self._research_result:
            from services.research_service import generate_document
            # Clean up any encoding artifacts or odd characters before rendering
            cleaned_sections = _clean_research_sections(self._research_result["sections"])
            output_format = getattr(task, "output_format", None) or "pdf"
            output_dir = f"/app/data/outputs/{task.id}"
            self._log(f"Generating {output_format.upper()} document ...")
            try:
                try:
                    from models.user import User as UserModel
                    from routers.settings import _get_user_settings, get_doc_format as _get_doc_fmt
                    _user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                    _user_cfg = _get_user_settings(_user) if _user else None
                    _fmt = _get_doc_fmt(_user_cfg)
                except Exception:
                    _fmt = get_doc_format()
                output_file = generate_document(
                    title=self._research_result["title"],
                    sections=cleaned_sections,
                    sources=self._research_result["sources"],
                    output_format=output_format,
                    output_dir=output_dir,
                    fmt=_fmt,
                    image_urls=self._collected_image_urls if _fmt.get("include_images") else [],
                )
                task.output_file = output_file
                db.commit()
                if os.path.exists(output_file):
                    size = os.path.getsize(output_file)
                    self._log(f"Document saved: {output_file} ({size} bytes)")
                else:
                    self._log(f"[ERROR] generate_document returned path but file does not exist: {output_file}")
                    task.output_file = None
                    db.commit()
            except Exception as _doc_err:
                self._log(f"[ERROR] Document generation failed: {_doc_err}\n{traceback.format_exc()}")
        else:
            self._log("WARNING: LLM did not call finish() — no research result to generate document from.")

        if task.output_file:
            try:
                from models.user import User as UserModel
                from routers.settings import _get_user_settings
                _smb_user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                if _smb_user:
                    _smb_user_cfg = _get_user_settings(_smb_user)
                    smb_cfg = _smb_user_cfg.get("smb", {})
                    if smb_cfg.get("enabled"):
                        from services.smb_service import upload_to_smb
                        unc = upload_to_smb(task.output_file, smb_cfg)
                        self._log(f"[smb] Uploaded to {unc}")
            except Exception as _smb_err:
                self._log(f"[smb] Upload failed (non-fatal): {_smb_err}")

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_structured_document(self, task, db, llm_client) -> None:
        """Run a structured document task: plan or proposal generation."""
        opts: dict = json.loads(task.extra_data or "{}")
        system_prompt = _build_structured_doc_system_prompt(opts)

        # Build rich initial message from all intake fields
        mode = opts.get("document_mode", "plan")
        mode_label = {"plan": "Implementation Plan", "proposal": "Proposal",
                      "proposal_with_plan": "Proposal with Implementation Plan"}.get(mode, "Plan")

        lines = [f"Document Request: {mode_label}\n"]
        lines.append(f"## Summary / Purpose\n{task.description}")

        for key, label in [
            ("title",            "Working Title"),
            ("audience",         "Target Audience"),
            ("purpose",          "Objective / Purpose"),
            ("background",       "Background / Current State"),
            ("constraints",      "Constraints"),
            ("timeline",         "Timeline / Target Dates"),
            ("budget",           "Budget / Cost Information"),
            ("stakeholders",     "Stakeholders"),
            ("required_sections","Required Sections (user-specified)"),
            ("decision_needed",  "Decision Needed"),
            ("risks_concerns",   "Known Risks / Concerns"),
            ("alternatives",     "Alternatives Considered"),
            ("assumptions",      "Assumptions"),
            ("success_measures", "Success Measures"),
        ]:
            val = str(opts.get(key, "")).strip()
            if val:
                lines.append(f"\n## {label}\n{val}")

        lines.append(
            "\n---\n"
            "Using all the information above, produce the complete document following your instructions. "
            "Write every required section with full prose. Do not call finish() until all sections are complete."
        )

        initial_content = self._build_initial_message("\n".join(lines))
        self._finished = False
        self._structured_doc_result = None

        await llm_client.run_agent_loop(
            system=system_prompt,
            initial_message=initial_content,
            tools=STRUCTURED_DOC_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        if self._structured_doc_result:
            from services.research_service import generate_document
            output_format = getattr(task, "output_format", None) or "pdf"
            output_dir = f"/app/data/outputs/{task.id}"
            self._log(f"Generating {output_format.upper()} document ...")
            try:
                try:
                    from models.user import User as UserModel
                    from routers.settings import _get_user_settings, get_doc_format as _get_doc_fmt
                    _user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                    _user_cfg = _get_user_settings(_user) if _user else None
                    _fmt = _get_doc_fmt(_user_cfg)
                except Exception:
                    _fmt = get_doc_format()
                output_file = generate_document(
                    title=self._structured_doc_result["title"],
                    sections=self._structured_doc_result["sections"],
                    sources=[],
                    output_format=output_format,
                    output_dir=output_dir,
                    fmt=_fmt,
                    image_urls=[],
                )
                task.output_file = output_file
                db.commit()
                if os.path.exists(output_file):
                    size = os.path.getsize(output_file)
                    self._log(f"Document saved: {output_file} ({size} bytes)")
                else:
                    self._log(f"[ERROR] generate_document returned path but file does not exist: {output_file}")
                    task.output_file = None
                    db.commit()
            except Exception as _doc_err:
                self._log(f"[ERROR] Document generation failed: {_doc_err}\n{traceback.format_exc()}")
        else:
            self._log("WARNING: LLM did not call finish() — no document result.")

        # SMB upload if configured
        if task.output_file:
            try:
                from models.user import User as UserModel
                from routers.settings import _get_user_settings
                _smb_user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                if _smb_user:
                    _smb_user_cfg = _get_user_settings(_smb_user)
                    smb_cfg = _smb_user_cfg.get("smb", {})
                    if smb_cfg.get("enabled"):
                        from services.smb_service import upload_to_smb
                        unc = upload_to_smb(task.output_file, smb_cfg)
                        self._log(f"[smb] Uploaded to {unc}")
            except Exception as _smb_err:
                self._log(f"[smb] Upload failed (non-fatal): {_smb_err}")

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_coding(self, task, db, llm_client) -> None:
        """Run a local coding/script task: generate files, no GitHub."""
        output_dir = f"/app/data/outputs/{task.id}"
        os.makedirs(output_dir, exist_ok=True)
        self._output_dir = output_dir

        self._finished = False
        self._coding_result = None

        initial_message = (
            f"Coding task: {task.description}\n\n"
            "Write complete, production-ready scripts. Use write_file to create each file. "
            "Search the web if you need to look up syntax, APIs, or best practices. "
            "When all files are written, call finish() with the primary filename and a usage summary."
        )

        await llm_client.run_agent_loop(
            system=CODING_SYSTEM_PROMPT,
            initial_message=self._build_initial_message(initial_message),
            tools=CODING_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        if self._coding_result:
            main_file = self._coding_result.get("main_file", "")
            full_path = os.path.join(output_dir, os.path.normpath(main_file).lstrip("/\\"))
            if os.path.isfile(full_path):
                task.output_file = full_path
                self._log(f"Primary output: {full_path}")
            else:
                # Pick first file in output dir as fallback
                files = [f for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
                if files:
                    task.output_file = os.path.join(output_dir, sorted(files)[0])
                    self._log(f"Primary output (fallback): {task.output_file}")
        else:
            self._log("WARNING: LLM did not call finish() — checking output dir for files")
            files = [f for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
            if files:
                task.output_file = os.path.join(output_dir, sorted(files)[0])

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_code(self, task, db, settings, llm_client) -> None:
        """Run a code task: clone repo, apply changes, deliver per delivery_mode."""
        opts: dict = json.loads(task.extra_data or "{}")
        delivery_mode = opts.get("delivery_mode", "pr_mode")

        github_service = GitHubService(
            token=settings.github_token,
            user_name=settings.github_user_name,
            user_email=settings.github_user_email,
        )
        self._log(f"Cloning {task.repo_url} (branch: {task.base_branch}) ...")
        self._repo_path = github_service.clone(task.id, task.repo_url, task.base_branch)
        self._log(f"Cloned to {self._repo_path}")

        try:
            self._finished = False
            initial_message_text = (
                f"Task: {task.description}\n"
                f"Repo: {task.repo_url}\n\n"
                "Start by listing the repository structure."
            )

            # Prepend GitNexus code-intelligence context when available
            gitnexus_ctx = await self._fetch_gitnexus_context(task, db)
            if gitnexus_ctx:
                initial_message_text = gitnexus_ctx + "\n\n---\n\n" + initial_message_text

            initial_content = self._build_initial_message(initial_message_text)

            system_prompt = _build_code_system_prompt(opts)
            await llm_client.run_agent_loop(
                system=system_prompt,
                initial_message=initial_content,
                tools=CODE_TOOL_DEFINITIONS,
                tool_executor=self.tool_executor,
                log_fn=self._log,
            )

            # Check for actual changes
            from git import Repo as GitRepo
            repo = GitRepo(self._repo_path)
            has_changes = repo.is_dirty(untracked_files=True)

            if delivery_mode == "plan_only":
                # No repo mutations — just mark complete
                task.status = TaskStatus.COMPLETE
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Plan-only mode: no changes committed.")
                return

            if not has_changes:
                raise RuntimeError(
                    "Agent completed without making any file changes. "
                    "No commit or PR will be created. Check the task log for details."
                )

            commit_message = f"baumagent: {task.description[:72]}\n\nTask-ID: {task.id}"

            if delivery_mode == "direct_commit":
                self._log("Committing and pushing directly to base branch ...")
                commit_sha = github_service.commit_all(self._repo_path, commit_message)
                self._log(f"Committed: {commit_sha}")
                github_service.push(self._repo_path, task.base_branch)
                self._log("Pushed to base branch.")

                task.status = TaskStatus.COMPLETE
                task.commit_sha = commit_sha
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Done.")

            else:  # pr_mode (default)
                branch_name = f"baumagent/{task.id[:8]}"
                self._log(f"Creating branch {branch_name} ...")
                github_service.create_branch(self._repo_path, branch_name)

                self._log("Committing changes ...")
                commit_sha = github_service.commit_all(self._repo_path, commit_message)
                self._log(f"Committed: {commit_sha}")

                self._log("Pushing branch ...")
                github_service.push(self._repo_path, branch_name)

                self._log("Generating PR description ...")
                pr_description_prompt = (
                    f"Write a concise GitHub pull request description for the following task.\n\n"
                    f"Task: {task.description}\n"
                    f"Repo: {task.repo_url}\n\n"
                    "Include: what was changed and why. Use Markdown. Be concise."
                )
                pr_body = await llm_client.run_agent_loop(
                    system="You are a helpful assistant that writes clear pull request descriptions.",
                    initial_message=pr_description_prompt,
                    tools=[],
                    tool_executor=self.tool_executor,
                    log_fn=lambda _: None,
                )

                pr_title = task.description[:72]
                self._log(f"Opening PR: {pr_title}")
                pr_url, pr_number = github_service.open_pr(
                    repo_url=task.repo_url,
                    branch_name=branch_name,
                    base_branch=task.base_branch,
                    title=pr_title,
                    body=pr_body or task.description,
                )
                self._log(f"PR opened: {pr_url}")

                task.status = TaskStatus.COMPLETE
                task.branch_name = branch_name
                task.pr_url = pr_url
                task.pr_number = pr_number
                task.commit_sha = commit_sha
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Done.")

        finally:
            github_service.cleanup(self._repo_path)
