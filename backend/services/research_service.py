"""Document generation for research tasks."""
import os
from pathlib import Path


def generate_pdf(title: str, sections: list[dict], sources: list[str], output_path: str) -> None:
    """Generate a PDF report using reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.colors import HexColor

    doc = SimpleDocTemplate(output_path, pagesize=letter,
                            rightMargin=inch, leftMargin=inch,
                            topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'],
                                  fontSize=24, spaceAfter=20)
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'],
                                    fontSize=14, spaceBefore=16, spaceAfter=8,
                                    textColor=HexColor('#2c3e50'))
    body_style = ParagraphStyle('CustomBody', parent=styles['Normal'],
                                 fontSize=11, leading=16, spaceAfter=8)
    source_style = ParagraphStyle('Source', parent=styles['Normal'],
                                   fontSize=9, textColor=HexColor('#7f8c8d'))

    story = []
    story.append(Paragraph(title, title_style))
    story.append(HRFlowable(width="100%", thickness=2, color=HexColor('#3498db')))
    story.append(Spacer(1, 0.2 * inch))

    for section in sections:
        story.append(Paragraph(section['heading'], heading_style))
        # Split content by newlines and add each as a paragraph
        for line in section['content'].split('\n'):
            if line.strip():
                story.append(Paragraph(line.strip(), body_style))
        story.append(Spacer(1, 0.1 * inch))

    if sources:
        story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#bdc3c7')))
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph("Sources", heading_style))
        for i, src in enumerate(sources, 1):
            story.append(Paragraph(f"{i}. {src}", source_style))

    doc.build(story)


def generate_docx(title: str, sections: list[dict], sources: list[str], output_path: str) -> None:
    """Generate a Word document using python-docx."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # Title
    title_para = doc.add_heading(title, 0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()  # spacer

    for section in sections:
        doc.add_heading(section['heading'], level=1)
        for line in section['content'].split('\n'):
            if line.strip():
                doc.add_paragraph(line.strip())

    if sources:
        doc.add_heading('Sources', level=1)
        for i, src in enumerate(sources, 1):
            p = doc.add_paragraph(style='List Number')
            p.add_run(f"{src}").font.size = Pt(9)

    doc.save(output_path)


def generate_document(title: str, sections: list[dict], sources: list[str],
                       output_format: str, output_dir: str) -> str:
    """Generate document and return full path."""
    os.makedirs(output_dir, exist_ok=True)
    ext = "pdf" if output_format == "pdf" else "docx"
    filename = f"report.{ext}"
    full_path = os.path.join(output_dir, filename)

    if output_format == "pdf":
        generate_pdf(title, sections, sources, full_path)
    else:
        generate_docx(title, sections, sources, full_path)

    return full_path
