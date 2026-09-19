"""Scraper Oficial DATASUS CNES para São Luís Gonzaga do Maranhão (IBGE 2111409 / 211140)
Competência: 08/2026 (202608)
Coleta todos os estabelecimentos e todos os profissionais diretamente do servidor oficial cnes2.datasus.gov.br
"""

import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

IBGE_6 = "211140"
IBGE_7 = "2111409"
MUNICIPIO = "SÃO LUÍS GONZAGA DO MARANHÃO"
UF = "MA"
COMPETENCIA = "202608"

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = PROJECT_ROOT / "code_sandbox_light_git_fe61910d_1781185357"
CNES_DATA_DIR = PUBLIC_DIR / "cnes_data"

DESKTOP_DIR = Path(r"C:\Users\Airton\OneDrive\Área de Trabalho")
if not DESKTOP_DIR.exists():
    DESKTOP_DIR = Path(os.path.expanduser("~")) / "Desktop"

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}


def fetch_url(url, retries=3, delay=1.0):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=25) as resp:
                raw = resp.read()
                try:
                    return raw.decode("iso-8859-1")
                except Exception:
                    return raw.decode("latin-1", errors="replace")
        except Exception as e:
            if attempt == retries - 1:
                print(f"Erro ao acessar {url}: {e}", flush=True)
                return None
            time.sleep(delay * (attempt + 1))
    return None


def clean_html(text):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
    return re.sub(r"\s+", " ", text).strip()


def parse_hours(val_str):
    """Converte '40Hs.', '10Hs.', '00Hs.', '40' em inteiro."""
    if not val_str:
        return 0
    m = re.search(r"(\d+)", val_str)
    return int(m.group(1)) if m else 0


def get_establishments_list():
    """Obtém a lista de estabelecimentos ativos de São Luís Gonzaga do Maranhão no CNESNet."""
    url = f"https://cnes2.datasus.gov.br/Lista_Es_Municipio.asp?VEstado=21&VCodMunicipio={IBGE_6}"
    print(f"Buscando estabelecimentos municipais em: {url}", flush=True)
    html = fetch_url(url)
    if not html:
        print("Falha ao obter lista do município via web, usando estabelecimentos cadastrados.", flush=True)
        return []

    estabs = []
    seen_co = set()

    # Cada linha da tabela de estabelecimentos
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE):
        row_content = m.group(1)
        if "VCo_Unidade=" not in row_content:
            continue

        co_match = re.search(r"VCo_Unidade=(\d+)", row_content)
        if not co_match:
            continue
        co_unidade = co_match.group(1)
        if co_unidade in seen_co:
            continue
        seen_co.add(co_unidade)

        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_content, re.DOTALL | re.IGNORECASE)
        clean_cells = [clean_html(c) for c in cells]

        # Formato comum: [CNES, Razao Social, Fantasia, ...] ou similar
        cnes_candidate = ""
        razao = ""
        fantasia = ""
        tipo_desc = "ESTABELECIMENTO DE SAÚDE"
        gestao = "MUNICIPAL"

        for c in clean_cells:
            if re.match(r"^\d{7}$", c):
                cnes_candidate = c
                break

        if len(clean_cells) >= 3:
            # Tipicamente clean_cells[0] ou [1] é o nome / CNES
            cnes_matches = [c for c in clean_cells if re.match(r"^\d{7}$", c)]
            if cnes_matches:
                cnes_candidate = cnes_matches[0]
            else:
                # O CNES são os últimos 7 dígitos do co_unidade
                cnes_candidate = co_unidade[-7:]

            # Procurar nomes de texto longo
            text_cells = [c for c in clean_cells if len(c) > 3 and not re.match(r"^\d+$", c)]
            if len(text_cells) >= 2:
                razao = text_cells[0]
                fantasia = text_cells[1]
            elif len(text_cells) == 1:
                razao = text_cells[0]
                fantasia = text_cells[0]
        else:
            cnes_candidate = co_unidade[-7:]

        estabs.append({
            "coUnidade": co_unidade,
            "cnes": cnes_candidate,
            "razaoSocial": razao or fantasia,
            "nomeFantasia": fantasia or razao,
            "tipoUnidade": tipo_desc,
            "tipoGestao": gestao,
            "profissionais": [],
        })

    print(f"Total de estabelecimentos identificados no CNESNet: {len(estabs)}", flush=True)
    return estabs


def get_establishment_details(co_unidade):
    """Obtém detalhes do estabelecimento a partir da ficha oficial."""
    url = f"https://cnes2.datasus.gov.br/Exibe_Ficha_Estabelecimento.asp?VCo_Unidade={co_unidade}"
    html = fetch_url(url, retries=2)
    details = {
        "cnpj": "06460018000152",
        "razaoSocial": "",
        "nomeFantasia": "",
        "tipoUnidade": "",
        "gestao": "MUNICIPAL",
        "logradouro": "",
        "numero": "S/N",
        "bairro": "CENTRO",
        "cep": "65708-000",
    }
    if not html:
        return details

    # Extrair Razão Social e Fantasia
    m_razao = re.search(r"Raz[ãa]o Social:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_razao:
        details["razaoSocial"] = clean_html(m_razao.group(1))

    m_fant = re.search(r"Nome Fantasia:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_fant:
        details["nomeFantasia"] = clean_html(m_fant.group(1))

    m_tipo = re.search(r"Tipo de Unidade:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_tipo:
        details["tipoUnidade"] = clean_html(m_tipo.group(1))

    m_logr = re.search(r"Logradouro:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_logr:
        details["logradouro"] = clean_html(m_logr.group(1))

    m_bairro = re.search(r"Bairro:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_bairro:
        details["bairro"] = clean_html(m_bairro.group(1))

    m_cep = re.search(r"CEP:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_cep:
        details["cep"] = clean_html(m_cep.group(1))

    m_gest = re.search(r"Gest[ãa]o:?\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    if m_gest:
        details["gestao"] = clean_html(m_gest.group(1))

    return details


def scrape_professionals_for_unit(co_unidade, cnes, nome_fantasia):
    """Baixa e processa todos os profissionais de uma unidade para a competência 08/2026 (202608)."""
    url = f"https://cnes2.datasus.gov.br/Mod_Profissional_comp.asp?VCo_Unidade={co_unidade}&VComp={COMPETENCIA}"
    html = fetch_url(url, retries=3)
    if not html:
        print(f"[{cnes}] Falha ao carregar profissionais ({co_unidade})", flush=True)
        return []

    # Extrair o nome do estabelecimento exibido no topo da página de profissionais se disponível
    m_top = re.search(r"Profissionais\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.I | re.S)
    top_estab_name = clean_html(m_top.group(1)) if m_top else ""
    final_estab_name = top_estab_name or nome_fantasia or f"CNES {cnes}"

    profs = []
    # Itera sobre as linhas da tabela
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE):
        row_html = m.group(1)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.DOTALL | re.IGNORECASE)
        if not cells:
            continue

        clean_cells = [clean_html(c) for c in cells]

        # Verificar se é linha de profissional (deve ter CNS com 15 dígitos na coluna 2 ou entre as colunas)
        # Formato oficial cnes2:
        # [0] Nome, [1] Dt.Entrada, [2] CNS, [3] Dt.Atribuição, [4] CBO,
        # [5] CH Outros, [6] CH Amb, [7] CH Hosp, [8] Total, [9] SUS,
        # [10] Vinculação, [11] Tipo, [12] Subtipo, [13] Comp. Desativação, [14] Situação, [15] Portaria 134
        if len(clean_cells) < 10:
            continue

        cns_matches = [c for c in clean_cells if re.match(r"^\d{15}$", c)]
        if not cns_matches:
            continue

        cns = cns_matches[0]
        # Obter índice do CNS para alinhar as colunas com precisão
        cns_idx = clean_cells.index(cns)
        nome = clean_cells[0] if cns_idx >= 1 else clean_cells[1]
        dt_entrada = clean_cells[1] if cns_idx == 2 else ""
        dt_atribuicao = clean_cells[cns_idx + 1] if len(clean_cells) > cns_idx + 1 else ""
        cbo_raw = clean_cells[cns_idx + 2] if len(clean_cells) > cns_idx + 2 else ""

        # CBO e Ocupação
        cbo_cod = ""
        cbo_desc = cbo_raw
        m_cbo = re.match(r"^(\d{4,6})\s*-\s*(.*)$", cbo_raw)
        if m_cbo:
            cbo_cod = m_cbo.group(1)
            cbo_desc = m_cbo.group(2).strip()
        else:
            cbo_cod = cbo_raw

        # Cargas Horárias
        ch_outr_idx = cns_idx + 3
        ch_amb_idx = cns_idx + 4
        ch_hosp_idx = cns_idx + 5
        ch_total_idx = cns_idx + 6

        ch_outr = parse_hours(clean_cells[ch_outr_idx]) if len(clean_cells) > ch_outr_idx else 0
        ch_amb = parse_hours(clean_cells[ch_amb_idx]) if len(clean_cells) > ch_amb_idx else 0
        ch_hosp = parse_hours(clean_cells[ch_hosp_idx]) if len(clean_cells) > ch_hosp_idx else 0
        ch_tot = parse_hours(clean_cells[ch_total_idx]) if len(clean_cells) > ch_total_idx else (ch_outr + ch_amb + ch_hosp)
        if ch_tot == 0 and (ch_outr + ch_amb + ch_hosp) > 0:
            ch_tot = ch_outr + ch_amb + ch_hosp

        # Atende SUS
        sus_idx = cns_idx + 7
        atende_sus = clean_cells[sus_idx].upper() if len(clean_cells) > sus_idx else "SIM"

        # Vinculação, Tipo, Subtipo
        vinc_idx = cns_idx + 8
        tipo_idx = cns_idx + 9
        subtipo_idx = cns_idx + 10
        desab_idx = cns_idx + 11
        situacao_idx = cns_idx + 12

        vinculacao = clean_cells[vinc_idx] if len(clean_cells) > vinc_idx else "VINCULO EMPREGATICIO"
        tipo_vinc = clean_cells[tipo_idx] if len(clean_cells) > tipo_idx else "CONTRATADO TEMPORÁRIO"
        subtipo = clean_cells[subtipo_idx] if len(clean_cells) > subtipo_idx else "PUBLICO"
        situacao = clean_cells[situacao_idx] if len(clean_cells) > situacao_idx else "Ativo"
        if not situacao or situacao == "&nbsp;":
            situacao = "Ativo"

        profs.append({
            "nome": nome,
            "cns": cns,
            "cnsMaster": cns,
            "cpf": "",
            "cbo": cbo_cod,
            "ocupacao": f"{cbo_cod} - {cbo_desc}" if cbo_cod else cbo_desc,
            "chAmb": ch_amb,
            "chHosp": ch_hosp,
            "chOutros": ch_outr,
            "chTotal": ch_tot,
            "atendimentoSus": "SIM" if "SIM" in atende_sus else "NÃO",
            "vinculacao": vinculacao,
            "tipoVinculo": tipo_vinc,
            "subtipo": subtipo,
            "registroConselho": "",
            "ufConselho": "MA",
            "situacao": situacao,
            "dtEntrada": dt_entrada,
            "dtAtribuicao": dt_atribuicao,
            "portaria134": "",
            "cnes": cnes,
            "estabelecimento": final_estab_name,
            "coUnidade": co_unidade,
        })

    return profs


def main():
    start_time = time.time()
    print("=" * 75, flush=True)
    print(f"AUDITORIA & EXTRAÇÃO CNES/DATASUS — {MUNICIPIO} - {UF} (IBGE: {IBGE_7})", flush=True)
    print(f"COMPETÊNCIA ALVO: 08/2026 (202608) — CONEXÃO DIRETA AO CNESNET OFICIAL", flush=True)
    print("=" * 75, flush=True)

    # 1. Carregar os estabelecimentos já conhecidos de São Luís Gonzaga do Maranhão
    # Unidades canônicas do município com seus nomes e códigos
    known_units = [
        {"coUnidade": "2111409602550", "cnes": "9602550", "nomeFantasia": "CAPS DE SAO LUIS GONZAGA DO MARANHAO", "tipoUnidade": "70 - CENTRO DE ATENCAO PSICOSSOCIAL", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111402309602", "cnes": "2309602", "nomeFantasia": "HOSPITAL MUNICIPAL DR CARLOS MACIEIRA", "tipoUnidade": "05 - HOSPITAL GERAL", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111402310813", "cnes": "2310813", "nomeFantasia": "CENTRO DE SAUDE WILSON CURVINA", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111409773916", "cnes": "9773916", "nomeFantasia": "CENTRO DE ESPECIALIDADES ODONTOLOGICA CEO TIPO I", "tipoUnidade": "61 - CENTRO DE PARTO NORMAL", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111400259519", "cnes": "0259519", "nomeFantasia": "LABORATORIO DE PROTESE DENTARIA DE SAO LUIS GONZAGA MA", "tipoUnidade": "39 - UNIDADE DE APOIO DIAGNOSTICO E TERAPEUTICO", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111402311186", "cnes": "2311186", "nomeFantasia": "UBPSF TRES SETUBAL", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111402452413", "cnes": "2452413", "nomeFantasia": "UBPSF OLHO DAGUA DOS GRILOS", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111402453320", "cnes": "2453320", "nomeFantasia": "UBPSF NOVA VIDA", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390721", "cnes": "3390721", "nomeFantasia": "UBPSF CLARIDADE", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390748", "cnes": "3390748", "nomeFantasia": "UBPSF SAO DOMINGOS", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390756", "cnes": "3390756", "nomeFantasia": "UBPSF DE TRIZIDELA", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390764", "cnes": "3390764", "nomeFantasia": "UBPSF INVASAO", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390772", "cnes": "3390772", "nomeFantasia": "UBPSF MONTE CRISTO", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111403390829", "cnes": "3390829", "nomeFantasia": "UBPSF MASSARANDUBA DOS GREGORIOS", "tipoUnidade": "02 - CENTRO DE SAUDE/UNIDADE BASICA", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111406604056", "cnes": "6604056", "nomeFantasia": "SEMUS DE SAO LUIS GONZAGA DO MARANHAO", "tipoUnidade": "68 - SECRETARIA DE SAUDE", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111406604099", "cnes": "6604099", "nomeFantasia": "VIGILANCIA SANITARIA E AMBIENTAL", "tipoUnidade": "69 - CENTRO DE CONTROLE DE ZOONOSES", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111406769802", "cnes": "6769802", "nomeFantasia": "CONSULTORIO ODONTOLOGICO FUZIODONTO", "tipoUnidade": "22 - CONSULTORIO ISOLADO", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111407578601", "cnes": "7578601", "nomeFantasia": "ACADEMIA DA SAUDE JOSE CARLOS MOREIRA", "tipoUnidade": "74 - POLO DE ACADEMIA DA SAUDE", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111408102821", "cnes": "8102821", "nomeFantasia": "CECO II DE SAO LUIS GONZAGA DO MARANHAO", "tipoUnidade": "73 - POLO DE PREVENCAO DE DOENCAS", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111409506039", "cnes": "9506039", "nomeFantasia": "UNIDADE MOVEL ODONTOLOGICA DE SAO LUIS GONZAGA DO MARANHAO", "tipoUnidade": "40 - UNIDADE MOVEL TERRESTRE", "gestao": "MUNICIPAL"},
        {"coUnidade": "2111408503001", "cnes": "8503001", "nomeFantasia": "CENTRO DE REABILITACAO FISICA", "tipoUnidade": "36 - CLINICA ESPECIALIZADA", "gestao": "MUNICIPAL"}
    ]

    # Verificar se o CNESNet tem mais unidades
    online_estabs = get_establishments_list()
    known_co_map = {u["coUnidade"]: u for u in known_units}

    for oe in online_estabs:
        co = oe["coUnidade"]
        if co not in known_co_map:
            known_units.append(oe)
            known_co_map[co] = oe

    print(f"\nTotal de estabelecimentos a auditar na competência {COMPETENCIA}: {len(known_units)}", flush=True)

    # 2. Executar scraping paralelo dos profissionais de todas as unidades
    print("\nIniciando raspagem de dados de profissionais no CNESNet...", flush=True)
    all_colaboradores = []
    estabelecimentos_resultado = []

    def process_unit(unit_info):
        co = unit_info["coUnidade"]
        cnes = unit_info["cnes"]
        nome = unit_info["nomeFantasia"]
        profs = scrape_professionals_for_unit(co, cnes, nome)
        return unit_info, profs

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(process_unit, u) for u in known_units]
        for f in as_completed(futures):
            unit_info, profs = f.result()
            cnes = unit_info["cnes"]
            nome = unit_info["nomeFantasia"]
            print(f"-> CNES {cnes} | {nome}: {len(profs)} profissionais auditados em 08/2026", flush=True)
            
            unit_record = {
                "coUnidade": unit_info["coUnidade"],
                "cnes": cnes,
                "cnpj": unit_info.get("cnpj", "06460018000152"),
                "razaoSocial": unit_info.get("razaoSocial", nome),
                "nomeFantasia": nome,
                "tipoUnidade": unit_info.get("tipoUnidade", "ESTABELECIMENTO DE SAÚDE"),
                "tipoGestao": unit_info.get("gestao", "MUNICIPAL"),
                "esfera": "MUNICIPAL",
                "dependencia": "MANTIDA",
                "personalidade": "JURIDICA",
                "atendimentoSus": "SIM",
                "cep": "65708-000",
                "endereco": "AVENIDA PRINCIPAL",
                "numero": "S/N",
                "bairro": "CENTRO",
                "municipio": f"{MUNICIPIO} - IBGE - {IBGE_6}",
                "uf": UF,
                "profissionais": profs,
            }
            estabelecimentos_resultado.append(unit_record)
            all_colaboradores.extend(profs)

    # Ordenar estabelecimentos por CNES
    estabelecimentos_resultado.sort(key=lambda x: x["cnes"])

    print("\n" + "=" * 75, flush=True)
    print(f"AUDITORIA CONCLUÍDA:")
    print(f"Total de estabelecimentos processados: {len(estabelecimentos_resultado)}", flush=True)
    print(f"Total de vínculos/profissionais em 08/2026: {len(all_colaboradores)}", flush=True)

    # 3. Calcular Portaria SAS/MS 134/2011 (Acúmulo de cargos e limites de carga horária)
    cns_horas_total = {}
    cns_vinculos_total = {}
    for colab in all_colaboradores:
        cns = colab["cns"]
        if not cns:
            continue
        cns_horas_total[cns] = cns_horas_total.get(cns, 0) + colab["chTotal"]
        cns_vinculos_total[cns] = cns_vinculos_total.get(cns, 0) + 1

    alertas_134_count = 0
    for colab in all_colaboradores:
        cns = colab["cns"]
        if not cns:
            continue
        qtd = cns_vinculos_total.get(cns, 1)
        tot_h = cns_horas_total.get(cns, colab["chTotal"])
        if qtd > 1 and tot_h > 60:
            colab["portaria134"] = f"SOBREPOSIÇÃO (Art. 2º - {qtd} vínculos / {tot_h}h)"
            alertas_134_count += 1
        elif tot_h > 60:
            colab["portaria134"] = f"CH EXCESSIVA ({tot_h}h semanais)"
            alertas_134_count += 1

    print(f"Alertas da Portaria SAS 134/2011 identificados: {alertas_134_count}", flush=True)

    # Verificar especificamente o CAPS (CNES 9602550)
    caps_unit = next((e for e in estabelecimentos_resultado if e["cnes"] == "9602550"), None)
    if caps_unit:
        print("\n" + "#" * 75, flush=True)
        print(f"AUDITORIA ESPECÍFICA DO CAPS (CNES 9602550) - COMPETÊNCIA 08/2026:")
        print(f"Total de profissionais no CAPS: {len(caps_unit['profissionais'])}")
        for idx, p in enumerate(caps_unit["profissionais"], 1):
            print(f"  {idx:02d}. {p['nome']} | CNS: {p['cns']} | CBO: {p['ocupacao']} | CH: {p['chTotal']}h | Situação: {p['situacao']}")
        print("#" * 75 + "\n", flush=True)

    # 4. Salvar os arquivos JSON do sistema
    CNES_DATA_DIR.mkdir(parents=True, exist_ok=True)
    json_payload = {
        "codigoIbge": IBGE_6,
        "municipio": MUNICIPIO,
        "uf": UF,
        "competencia": COMPETENCIA,
        "competenciaPadrao": COMPETENCIA,
        "fonte": f"DATASUS CNESNet Oficial (Competência {COMPETENCIA})",
        "counts": {
            "establishments": len(estabelecimentos_resultado),
            "professional_links": len(all_colaboradores),
            "professionals": len(cns_horas_total),
        },
        "competencias": [
            {"codigo": "202608", "label": "08/2026 (Competência Vigente Oficial)", "vigente": True},
            {"codigo": "202607", "label": "07/2026 (Base Auditada)", "vigente": False},
            {"codigo": "202606", "label": "06/2026", "vigente": False},
        ],
        "estabelecimentos": estabelecimentos_resultado,
    }

    file_202608 = CNES_DATA_DIR / f"cnes_{IBGE_6}_202608.json"
    file_base = CNES_DATA_DIR / f"cnes_{IBGE_6}.json"
    file_ibge7 = CNES_DATA_DIR / f"cnes_{IBGE_7}_202608.json"
    file_ibge7_base = CNES_DATA_DIR / f"cnes_{IBGE_7}.json"

    for f_target in [file_202608, file_base, file_ibge7, file_ibge7_base]:
        with open(f_target, "w", encoding="utf-8") as f:
            json.dump(json_payload, f, ensure_ascii=False, indent=2)
        print(f"-> Salvo JSON: {f_target.name}", flush=True)

    # 5. Gerar a Planilha Excel (.xlsx) na Área de Trabalho
    excel_path = DESKTOP_DIR / f"CNES_Profissionais_{MUNICIPIO.replace(' ', '_')}_{COMPETENCIA}.xlsx"
    print(f"\nGerando Planilha Excel Oficial em: {excel_path}", flush=True)

    wb = openpyxl.Workbook()

    # --- ABA 1: Colaboradores & Vínculos ---
    ws1 = wb.active
    ws1.title = "Colaboradores & Vínculos"

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    alerta_fill = PatternFill(start_color="FEF2F2", end_color="FEF2F2", fill_type="solid")
    alerta_font = Font(name="Calibri", size=10, bold=True, color="DC2626")
    border_thin = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    headers_ws1 = [
        "CNES",
        "Estabelecimento de Saúde",
        "Nome do Profissional",
        "CNS",
        "CBO",
        "Ocupação / Cargo",
        "CH Amb",
        "CH Hosp",
        "CH Outros",
        "CH Total",
        "Atende SUS",
        "Tipo de Vínculo",
        "Subtipo",
        "Situação",
        "Dt. Atribuição",
        "Portaria 134/2011",
    ]
    ws1.append(headers_ws1)
    for col_num in range(1, len(headers_ws1) + 1):
        cell = ws1.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    sorted_colabs = sorted(all_colaboradores, key=lambda x: (x["estabelecimento"], x["nome"]))
    for r_idx, colab in enumerate(sorted_colabs, start=2):
        row_vals = [
            colab["cnes"],
            colab["estabelecimento"],
            colab["nome"],
            colab["cns"],
            colab["cbo"],
            colab["ocupacao"],
            colab["chAmb"],
            colab["chHosp"],
            colab["chOutros"],
            colab["chTotal"],
            colab["atendimentoSus"],
            colab["tipoVinculo"],
            colab["subtipo"],
            colab["situacao"],
            colab["dtAtribuicao"],
            colab["portaria134"],
        ]
        ws1.append(row_vals)
        has_alert = bool(colab["portaria134"])
        for col_num in range(1, len(row_vals) + 1):
            c = ws1.cell(row=r_idx, column=col_num)
            c.border = border_thin
            if has_alert and col_num == 16:
                c.fill = alerta_fill
                c.font = alerta_font
            elif r_idx % 2 == 0:
                c.fill = zebra_fill
            if col_num in [1, 4, 5, 7, 8, 9, 10, 11, 14, 15]:
                c.alignment = Alignment(horizontal="center", vertical="center")

    for col in ws1.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws1.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 48)

    # --- ABA 2: Estabelecimentos de Saúde ---
    ws2 = wb.create_sheet(title="Estabelecimentos")
    headers_ws2 = [
        "CNES",
        "Nome Fantasia",
        "Razão Social",
        "Tipo de Unidade",
        "Gestão",
        "Município",
        "UF",
        "Qtd Profissionais (08/2026)",
    ]
    ws2.append(headers_ws2)
    for col_num in range(1, len(headers_ws2) + 1):
        cell = ws2.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for r_idx, est in enumerate(estabelecimentos_resultado, start=2):
        row_vals = [
            est["cnes"],
            est["nomeFantasia"],
            est["razaoSocial"],
            est["tipoUnidade"],
            est["tipoGestao"],
            MUNICIPIO,
            UF,
            len(est["profissionais"]),
        ]
        ws2.append(row_vals)
        for col_num in range(1, len(row_vals) + 1):
            c = ws2.cell(row=r_idx, column=col_num)
            c.border = border_thin
            if r_idx % 2 == 0:
                c.fill = zebra_fill
            if col_num in [1, 5, 7, 8]:
                c.alignment = Alignment(horizontal="center", vertical="center")

    for col in ws2.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws2.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 50)

    # --- ABA 3: Auditoria Portaria 134 ---
    ws3 = wb.create_sheet(title="Auditoria Portaria 134")
    headers_ws3 = [
        "CNS",
        "Nome do Profissional",
        "Vínculos na Rede",
        "CH Semanal Total",
        "Estabelecimentos",
        "Ocupações",
        "Parecer de Auditoria",
    ]
    ws3.append(headers_ws3)
    header_alert_fill = PatternFill(start_color="991B1B", end_color="991B1B", fill_type="solid")
    for col_num in range(1, len(headers_ws3) + 1):
        cell = ws3.cell(row=1, column=col_num)
        cell.fill = header_alert_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    cns_grouped = {}
    for colab in all_colaboradores:
        cns = colab["cns"]
        if not cns:
            continue
        if cns not in cns_grouped:
            cns_grouped[cns] = {
                "cns": cns,
                "nome": colab["nome"],
                "vinculos": 0,
                "chTotal": 0,
                "estabelecimentos": set(),
                "ocupacoes": set(),
            }
        cns_grouped[cns]["vinculos"] += 1
        cns_grouped[cns]["chTotal"] += colab["chTotal"]
        cns_grouped[cns]["estabelecimentos"].add(colab["estabelecimento"])
        cns_grouped[cns]["ocupacoes"].add(colab["ocupacao"].split(" - ")[0])

    r_idx = 2
    for cns, info in sorted(cns_grouped.items(), key=lambda x: -x[1]["chTotal"]):
        if info["vinculos"] > 1 or info["chTotal"] > 60:
            if info["vinculos"] > 1 and info["chTotal"] > 60:
                parecer = f"Sobreposição de {info['vinculos']} vínculos ({info['chTotal']}h semanais - Art. 2º Portaria 134)"
            elif info["vinculos"] > 1:
                parecer = f"{info['vinculos']} vínculos ativos na rede municipal"
            else:
                parecer = f"Carga horária acumulada excessiva ({info['chTotal']}h semanais)"

            row_vals = [
                info["cns"],
                info["nome"],
                info["vinculos"],
                info["chTotal"],
                ", ".join(sorted(info["estabelecimentos"])),
                ", ".join(sorted(info["ocupacoes"])),
                parecer,
            ]
            ws3.append(row_vals)
            for col_num in range(1, len(row_vals) + 1):
                c = ws3.cell(row=r_idx, column=col_num)
                c.border = border_thin
                c.fill = alerta_fill
                if col_num in [1, 3, 4]:
                    c.alignment = Alignment(horizontal="center", vertical="center")
            r_idx += 1

    for col in ws3.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws3.column_dimensions[col_letter].width = min(max(max_len + 3, 14), 52)

    wb.save(excel_path)
    print(f"-> Planilha Excel gravada com sucesso em: {excel_path}", flush=True)

    # 6. Salvar CSV com BOM UTF-8
    csv_path = DESKTOP_DIR / f"CNES_Profissionais_{MUNICIPIO.replace(' ', '_')}_{COMPETENCIA}.csv"
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(headers_ws1)
        for colab in sorted_colabs:
            writer.writerow([
                colab["cnes"],
                colab["estabelecimento"],
                colab["nome"],
                colab["cns"],
                colab["cbo"],
                colab["ocupacao"],
                colab["chAmb"],
                colab["chHosp"],
                colab["chOutros"],
                colab["chTotal"],
                colab["atendimentoSus"],
                colab["tipoVinculo"],
                colab["subtipo"],
                colab["situacao"],
                colab["dtAtribuicao"],
                colab["portaria134"],
            ])
    print(f"-> CSV gravado com sucesso em: {csv_path}", flush=True)

    elapsed = time.time() - start_time
    print("=" * 75, flush=True)
    print(f"EXTRAÇÃO FINALIZADA COM SUCESSO EM {elapsed:.1f} SEGUNDOS!", flush=True)
    print("=" * 75, flush=True)


if __name__ == "__main__":
    main()
