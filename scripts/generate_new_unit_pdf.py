"""Gerador do Relatório Oficial / Nota Técnica em PDF da Auditoria do Novo Estabelecimento CNES
Município: São Luís Gonzaga do Maranhão - MA
Unidade: UNIDADE MÓVEL ODONTOLÓGICA (CNES 8503001)
Competência: 08/2026
"""

import os
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
)
from reportlab.pdfgen import canvas

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = PROJECT_ROOT / "code_sandbox_light_git_fe61910d_1781185357"
IMG_LOGO = PUBLIC_DIR / "img" / "olho-cyber.png"
if not IMG_LOGO.exists():
    IMG_LOGO = PUBLIC_DIR / "img" / "logo.jpg"

DESKTOP_DIR = Path(r"C:\Users\Airton\OneDrive\Área de Trabalho")
if not DESKTOP_DIR.exists():
    DESKTOP_DIR = Path(os.path.expanduser("~")) / "Desktop"

PDF_OUTPUT = DESKTOP_DIR / "CNES_Nota_Tecnica_Nova_Unidade_8503001_202608.pdf"


class NumberedCanvas(canvas.Canvas):
    """Canvas para rodapé dinâmico com numeração de páginas 'Página X de Y'."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_footer(self, page_count):
        self.saveState()
        page_w, page_h = self._pagesize
        margin = 14 * mm
        footer_y = 11 * mm

        # Fundo do rodapé
        self.setFillColor(colors.HexColor("#F8FAFC"))
        self.rect(0, 0, page_w, footer_y + 3 * mm, fill=1, stroke=0)

        # Linha divisória sutil
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.6)
        self.line(margin, footer_y + 3 * mm, page_w - margin, footer_y + 3 * mm)

        # Texto de validação e rastreabilidade
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#475569"))
        now_str = datetime.now().strftime("%d/%m/%Y às %H:%M")
        self.drawString(margin, footer_y - 1 * mm, f"ARGOS - Monitoramento Inteligente do SUS | São Luís Gonzaga do Maranhão - MA (IBGE: 2111409) | Emissão: {now_str}")
        self.drawRightString(page_w - margin, footer_y - 1 * mm, f"Página {self._pageNumber} de {page_count}")
        self.restoreState()


def build_pdf():
    print(f"Gerando Nota Técnica em PDF oficial: {PDF_OUTPUT}", flush=True)

    page_w, page_h = A4
    margin = 14 * mm
    content_w = page_w - (2 * margin)

    doc = SimpleDocTemplate(
        str(PDF_OUTPUT),
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=16 * mm
    )

    styles = getSampleStyleSheet()

    # Tipografias Customizadas
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        textColor=colors.white,
        leading=14.5
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=colors.HexColor("#DBEAFE"),
        leading=11
    )
    meta_style = ParagraphStyle(
        "DocMeta",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        textColor=colors.HexColor("#93C5FD"),
        leading=9.5
    )

    body_style = ParagraphStyle(
        "DocBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.0,
        textColor=colors.HexColor("#1E293B"),
        leading=11.0
    )

    body_bold = ParagraphStyle(
        "DocBodyBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.0,
        textColor=colors.HexColor("#0F172A"),
        leading=11.0
    )

    alert_text = ParagraphStyle(
        "AlertText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.8,
        textColor=colors.HexColor("#92400E"),
        leading=10.5
    )

    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.2,
        textColor=colors.HexColor("#0F172A"),
        leading=9.0
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        textColor=colors.HexColor("#0F172A"),
        leading=9.0
    )

    table_center = ParagraphStyle(
        "TableCenter",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        textColor=colors.HexColor("#0F172A"),
        alignment=1,
        leading=9.0
    )

    story = []

    # ═════════════════════════════════════════════════════════════════
    # 1. CABEÇALHO OFICIAL ARGOS (PÁGINA 1)
    # ═════════════════════════════════════════════════════════════════
    logo_w = 26 * mm
    logo_h = 13 * mm
    header_left = Paragraph(
        f"<b>ARGOS</b><br/><font size=6.5 color='#DBEAFE'>AUDITORIA SUS</font>",
        ParagraphStyle("LogoFallback", fontName="Helvetica-Bold", fontSize=11, textColor=colors.white, alignment=1)
    )
    if IMG_LOGO.exists():
        from reportlab.platypus import Image
        header_left = Image(str(IMG_LOGO), width=logo_w, height=logo_h)

    now_str = datetime.now().strftime("%d/%m/%Y às %H:%M")
    header_right = [
        Paragraph("NOTA TÉCNICA DE AUDITORIA CADASTRAL DO CNES", title_style),
        Spacer(1, 0.6 * mm),
        Paragraph("Identificação de Novo Estabelecimento de Saúde na Competência 08/2026", subtitle_style),
        Paragraph(f"Município: SÃO LUÍS GONZAGA DO MARANHÃO - MA (IBGE: 2111409) | Emissão: {now_str}", meta_style)
    ]

    header_table = Table([[header_left, header_right]], colWidths=[30 * mm, content_w - 30 * mm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#1E3A8A")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3 * mm),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 3.0 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 2. CONTEXTO EXECUTIVO DA AUDITORIA
    # ═════════════════════════════════════════════════════════════════
    contexto_p = (
        "<b>SUMÁRIO EXECUTIVO DA AUDITORIA:</b> Na auditoria de movimentação cadastral entre as competências "
        "<b>07/2026</b> e <b>08/2026</b>, foi identificado o acréscimo de uma nova unidade de saúde na rede municipal "
        "de São Luís Gonzaga do Maranhão, elevando o total de <b>20 para 21 estabelecimentos</b> no DATASUS/CNES. "
        "Trata-se do cadastramento de uma <b>segunda Unidade Móvel Odontológica</b> no município. "
        "A seguir, apresentam-se os dados oficiais, a cronologia de habilitação, o quadro comparativo assistencial e a relação nominal da equipe alocada."
    )
    box_contexto = Table([[Paragraph(contexto_p, body_style)]], colWidths=[content_w])
    box_contexto.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 2.0 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.0 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2.5 * mm),
    ]))
    story.append(box_contexto)
    story.append(Spacer(1, 3.0 * mm))

    # Função auxiliar de título de bloco
    def bloco_titulo(txt, cor="#1E3A8A"):
        t = Table([[Paragraph(f"<b>{txt}</b>", ParagraphStyle("ST", fontName="Helvetica-Bold", fontSize=8.2, textColor=colors.white))]], colWidths=[content_w])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(cor)),
            ('TOPPADDING', (0, 0), (-1, -1), 1.3 * mm),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1.3 * mm),
            ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        return t

    # ═════════════════════════════════════════════════════════════════
    # 3. DADOS OFICIAIS DO NOVO ESTABELECIMENTO
    # ═════════════════════════════════════════════════════════════════
    story.append(bloco_titulo("1. DADOS CADASTRAIS OFICIAIS NO CNESNET / DATASUS"))
    story.append(Spacer(1, 1.0 * mm))

    dados_est = [
        [Paragraph("<b>Código CNES:</b>", body_bold), Paragraph("<b>8503001</b>", body_bold), Paragraph("<b>Código Unidade (CO_UNIDADE):</b>", body_bold), Paragraph("2111408503001", body_style)],
        [Paragraph("<b>Nome Fantasia (CNES):</b>", body_bold), Paragraph("UNDADE MOVEL ODONTOLOGICO DE SAO LUIS GONZAGA DO MARANHAO", body_style), Paragraph("<b>Razão Social / Mantenedora:</b>", body_bold), Paragraph("MUNICÍPIO DE SÃO LUÍS GONZAGA DO MARANHÃO", body_style)],
        [Paragraph("<b>Tipo de Unidade:</b>", body_bold), Paragraph("40 - UNIDADE MÓVEL TERRESTRE", body_style), Paragraph("<b>Subtipo de Unidade:</b>", body_bold), Paragraph("UNIDADE MÓVEL ODONTOLÓGICA", body_style)],
        [Paragraph("<b>Gestão / Esfera:</b>", body_bold), Paragraph("MUNICIPAL (Plena)", body_style), Paragraph("<b>Dependência / Natureza:</b>", body_bold), Paragraph("MANTIDA (Poder Público Municipal)", body_style)],
        [Paragraph("<b>Endereço / Sede:</b>", body_bold), Paragraph("AV. JOÃO PESSOA, S/N - CENTRO", body_style), Paragraph("<b>CEP / Município / UF:</b>", body_bold), Paragraph("65708-000 | SÃO LUÍS GONZAGA DO MARANHÃO - MA", body_style)],
    ]
    t_dados = Table(dados_est, colWidths=[38 * mm, 54 * mm, 45 * mm, content_w - 137 * mm])
    t_dados.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_dados)
    story.append(Spacer(1, 3.0 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 4. HISTÓRICO DA AUDITORIA CADASTRAL E CRONOLOGIA
    # ═════════════════════════════════════════════════════════════════
    story.append(bloco_titulo("2. HISTÓRICO DA AUDITORIA CADASTRAL (CRONOLOGIA DE IMPLANTAÇÃO)"))
    story.append(Spacer(1, 1.0 * mm))

    crono_rows = [
        [
            Paragraph("<b>Data</b>", table_center),
            Paragraph("<b>Etapa / Evento Cadastral</b>", table_cell_bold),
            Paragraph("<b>Órgão / Sistema</b>", table_cell_bold),
            Paragraph("<b>Descrição Técnica / Impacto</b>", table_cell_bold),
        ],
        [
            Paragraph("<b>04/08/2026</b>", table_center),
            Paragraph("<b>Alvará Sanitário</b>", table_cell),
            Paragraph("Secretaria Municipal de Saúde (SMS)", table_cell),
            Paragraph("Emissão do Alvará de Autorização Sanitária de Funcionamento da Unidade Móvel.", table_cell),
        ],
        [
            Paragraph("<b>08/09/2026</b>", table_center),
            Paragraph("<b>Atualização Local</b>", table_cell),
            Paragraph("Gestão Municipal / Operador CNES", table_cell),
            Paragraph("Alimentação e inserção das informações assistenciais no aplicativo do CNES local.", table_cell),
        ],
        [
            Paragraph("<b>11/09/2026</b>", table_center),
            Paragraph("<b>Inclusão no DATASUS</b>", table_cell),
            Paragraph("Servidor Central Ministério da Saúde", table_cell),
            Paragraph("Transmissão do arquivo de carga e homologação do CNES 8503001 na competência 08/2026.", table_cell),
        ],
        [
            Paragraph("<b>08/2026</b>", table_center),
            Paragraph("<font color='#B45309'><b>Status no CNESNet</b></font>", table_cell),
            Paragraph("DATASUS / CNESNet Oficial", table_cell),
            Paragraph("<b>'Estabelecimento com Inconsistência'</b>: condição usual de cadastros recentes aguardando validação de regras de vinculação.", alert_text),
        ]
    ]

    t_crono = Table(crono_rows, colWidths=[24 * mm, 38 * mm, 45 * mm, content_w - 107 * mm])
    t_crono.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F766E")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor("#F0FDFA")]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#FFFBEB")),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_crono)
    story.append(Spacer(1, 3.0 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 5. QUADRO COMPARATIVO DAS UNIDADES MÓVEIS
    # ═════════════════════════════════════════════════════════════════
    story.append(bloco_titulo("3. DIFERENCIAÇÃO ENTRE AS DUAS UNIDADES MÓVEIS ODONTOLÓGICAS"))
    story.append(Spacer(1, 1.0 * mm))

    comp_rows = [
        [
            Paragraph("<b>Parâmetro</b>", table_cell_bold),
            Paragraph("<b>Unidade Móvel 1 (Veterana / Competência 07)</b>", table_cell_bold),
            Paragraph("<b>Unidade Móvel 2 (Nova / Competência 08)</b>", table_cell_bold),
        ],
        [
            Paragraph("<b>Código CNES</b>", table_cell_bold),
            Paragraph("<b>9506039</b>", table_cell),
            Paragraph("<b>8503001</b>", table_cell),
        ],
        [
            Paragraph("<b>Nome Fantasia</b>", table_cell_bold),
            Paragraph("UNIDADE MOVEL ODONTOLOGICA DE SAO LUIS GONZAGA DO MARANHAO", table_cell),
            Paragraph("UNDADE MOVEL ODONTOLOGICO DE SAO LUIS GONZAGA DO MARANHAO", table_cell),
        ],
        [
            Paragraph("<b>Presença no Mês 07</b>", table_cell_bold),
            Paragraph("<font color='#166534'><b>Ativa na base 202607</b> (Já operante no município)</font>", table_cell),
            Paragraph("<font color='#B91C1C'><b>Inexistente no mês 07</b> (Alvará sanitário em 08/2026)</font>", table_cell),
        ],
        [
            Paragraph("<b>Equipe Vinculada</b>", table_cell_bold),
            Paragraph("<b>8 Profissionais</b> (Dra. Bianca Aryell, Dr. Fabio Catão, etc.)", table_cell),
            Paragraph("<b>8 Profissionais</b> (Dra. Kaciane Silva, Dr. Leandro Carvalho, etc.)", table_cell),
        ],
        [
            Paragraph("<b>Gerência Cadastrada</b>", table_cell_bold),
            Paragraph("Pablo Henrique Nascimento da Costa (CNS ...1262)", table_cell),
            Paragraph("Beatriz Silva de Sousa (CNS ...7987)", table_cell),
        ]
    ]

    t_comp = Table(comp_rows, colWidths=[36 * mm, (content_w - 36 * mm)/2.0, (content_w - 36 * mm)/2.0])
    t_comp.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0369A1")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F9FF")]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_comp)

    # ═════════════════════════════════════════════════════════════════
    # QUEBRA DE PÁGINA: PÁGINA 2 INICIA COM A EQUIPE COMPLETA
    # ═════════════════════════════════════════════════════════════════
    story.append(PageBreak())

    # Mini-Cabeçalho de Continuação na Página 2
    header_p2 = Table([
        [
            Paragraph("<b>ARGOS</b> | AUDITORIA DE CNES E FINANCIAMENTO DO SUS", ParagraphStyle("H2L", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#1E3A8A"))),
            Paragraph("<b>NOTA TÉCNICA — CNES 8503001</b> (COMPETÊNCIA 08/2026)", ParagraphStyle("H2R", fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#64748B"), alignment=2))
        ]
    ], colWidths=[content_w * 0.55, content_w * 0.45])
    header_p2.setStyle(TableStyle([
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('LINEBELOW', (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
    ]))
    story.append(header_p2)
    story.append(Spacer(1, 3.5 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 6. EQUIPE COMPLETA DA NOVA UNIDADE (CNES 8503001)
    # ═════════════════════════════════════════════════════════════════
    story.append(bloco_titulo("4. EQUIPE COMPLETA DE PROFISSIONAIS ALOCADOS (08/2026)", "#166534"))
    story.append(Spacer(1, 1.2 * mm))

    prof_head = [
        Paragraph("<b>#</b>", table_center),
        Paragraph("<b>Nome do Profissional</b>", table_cell_bold),
        Paragraph("<b>Cartão Nacional de Saúde (CNS)</b>", table_center),
        Paragraph("<b>CBO / Ocupação Oficial</b>", table_cell_bold),
        Paragraph("<b>CH Semanal</b>", table_center),
        Paragraph("<b>Situação</b>", table_center)
    ]

    prof_data = [
        ("1", "BEATRIZ SILVA DE SOUSA", "706407642017987", "142105 - GERENTE ADMINISTRATIVO", "40h", "Ativo"),
        ("2", "KACIANE SILVA DA SILVA", "701207017601115", "223293 - CIRURGIÃO-DENTISTA DA ESF", "40h", "Ativo"),
        ("3", "LEANDRO CARVALHO GONCALVES", "700302945964238", "223293 - CIRURGIÃO-DENTISTA DA ESF", "40h", "Ativo"),
        ("4", "LUCCAS VINICIUS DE ARAGAO BORRALHO", "700500961002654", "223293 - CIRURGIÃO-DENTISTA DA ESF", "40h", "Ativo"),
        ("5", "LUIS DIOGO DE JESUS BOGEA", "700204924239324", "322430 - AUXILIAR EM SAÚDE BUCAL DA ESF", "40h", "Ativo"),
        ("6", "MARIA EVA BENICIO DE SOUSA", "700900968117593", "322430 - AUXILIAR EM SAÚDE BUCAL DA ESF", "40h", "Ativo"),
        ("7", "ROSIMAR RODRIGUES DE CARVALHO", "700401125232650", "322430 - AUXILIAR EM SAÚDE BUCAL DA ESF", "40h", "Ativo"),
        ("8", "SAMUEL DE SOUZA", "700002742162806", "782310 - MOTORISTA DE FURGÃO OU VEÍCULO SIMILAR", "40h", "Ativo"),
    ]

    prof_rows = [prof_head]
    for num, nome, cns, cbo, ch, sit in prof_data:
        prof_rows.append([
            Paragraph(f"<b>{num}</b>", table_center),
            Paragraph(f"<b>{nome}</b>", table_cell_bold),
            Paragraph(cns, table_center),
            Paragraph(cbo, table_cell),
            Paragraph(f"<b>{ch}</b>", table_center),
            Paragraph(f"<font color='#166534'><b>{sit}</b></font>", table_center)
        ])

    col_w_prof = [10 * mm, 52 * mm, 36 * mm, 52 * mm, 18 * mm, 14 * mm]
    t_prof = Table(prof_rows, colWidths=col_w_prof)
    t_prof.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#166534")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0FDF4")]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2.2 * mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_prof)
    story.append(Spacer(1, 4.0 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 7. CONCLUSÃO TÉCNICA E RECOMENDAÇÕES DE AUDITORIA
    # ═════════════════════════════════════════════════════════════════
    story.append(bloco_titulo("5. PARECER TÉCNICO E RECOMENDAÇÕES DA AUDITORIA FPA ARGOS", "#1E3A8A"))
    story.append(Spacer(1, 1.2 * mm))

    conclusao_p = (
        "<b>1. Fidedignidade dos Dados Oficiais:</b><br/>"
        "A variação de 20 para 21 unidades de saúde reflete estritamente o cadastro no banco central do DATASUS. "
        "Não se trata de duplicidade nem erro de importação, mas sim de expansão física/móvel da rede pública com equipe própria alocada.<br/><br/>"
        "<b>2. Monitoramento de Regularidade e Repasse Financeiro (FNS):</b><br/>"
        "O apontamento ministerial de <i>'Estabelecimento com Inconsistência'</i> deve ser saneado pelo setor de regulação "
        "e cadastro da Secretaria Municipal de Saúde, visando garantir a futura habilitação de incentivos específicos de "
        "Saúde Bucal no Bloco de Custeio da Atenção Primária à Saúde (APS / Portaria GM/MS).<br/><br/>"
        "<b>3. Auditoria da Portaria SAS/MS 134/2011:</b><br/>"
        "Nenhum dos 8 profissionais da nova Unidade Móvel apresenta extrapolação isolada de carga horária (>60h na unidade), "
        "cumprindo o limite padrão contratual de 40 horas semanais."
    )
    box_conclusao = Table([[Paragraph(conclusao_p, body_style)]], colWidths=[content_w])
    box_conclusao.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor("#93C5FD")),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3 * mm),
    ]))
    story.append(box_conclusao)
    story.append(Spacer(1, 5.0 * mm))

    # ═════════════════════════════════════════════════════════════════
    # 8. QUADRO DE AUTENTICAÇÃO E ASSINATURA DIGITAL
    # ═════════════════════════════════════════════════════════════════
    auth_data = [
        [
            Paragraph("<b>RESPONSÁVEL PELA AUDITORIA</b><br/>Sistema FPA ARGOS — Inteligência e Regulação do SUS", table_cell),
            Paragraph("<b>CHAVE DE RASTREABILIDADE</b><br/><code>DATASUS-CNES-211140-202608-8503001-OK</code>", table_center),
            Paragraph("<b>STATUS DA NOTA TÉCNICA</b><br/><font color='#166534'><b>EMITIDA E CONCILIADA</b></font>", table_center)
        ]
    ]
    t_auth = Table(auth_data, colWidths=[content_w * 0.40, content_w * 0.35, content_w * 0.25])
    t_auth.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 2.0 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.0 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2.5 * mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_auth)

    # Compilar Documento
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"-> Relatório PDF gerado com sucesso em: {PDF_OUTPUT}", flush=True)


if __name__ == "__main__":
    build_pdf()
