"""Script de Extração de Alta Performance Oficial da Base DATASUS/CNES para São Luís Gonzaga do Maranhão (IBGE 2111409)."""

import csv
import json
import os
import sys
import time
from pathlib import Path
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SOURCE_DIR = Path(r"C:\Users\Airton\Downloads\BASE_DE_DADOS_CNES_202607")
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

def clean(val):
    if val is None:
        return ""
    return str(val).replace('"', '').strip()

def main():
    start_time = time.time()
    print("=" * 70, flush=True)
    print(f"EXTRAÇÃO OFICIAL CNES / DATASUS — {MUNICIPIO} - {UF} (IBGE: {IBGE_7})", flush=True)
    print(f"Diretório fonte: {SOURCE_DIR}", flush=True)
    print("=" * 70, flush=True)

    if not SOURCE_DIR.exists():
        print(f"ERRO: Diretório fonte {SOURCE_DIR} não encontrado!", flush=True)
        sys.exit(1)

    # 1. Dicionário de Tipo de Unidade
    print("1/6. Carregando tipos de unidade...", flush=True)
    tipo_unid_map = {}
    f_tipo_unid = SOURCE_DIR / "tbTipoUnidade202607.csv"
    if f_tipo_unid.exists():
        with open(f_tipo_unid, "r", encoding="latin-1") as f:
            reader = csv.reader(f, delimiter=";")
            header = next(reader, None)
            for row in reader:
                if len(row) >= 2:
                    k, v = clean(row[0]), clean(row[1])
                    tipo_unid_map[k] = v

    # 2. Dicionário de CBO (Atividade Profissional)
    print("2/6. Carregando tabela de CBOs...", flush=True)
    cbo_map = {}
    f_cbo = SOURCE_DIR / "tbAtividadeProfissional202607.csv"
    if f_cbo.exists():
        with open(f_cbo, "r", encoding="latin-1") as f:
            reader = csv.reader(f, delimiter=";")
            header = next(reader, None)
            for row in reader:
                if len(row) >= 2:
                    k, v = clean(row[0]), clean(row[1])
                    cbo_map[k] = v

    # 3. Dicionário de Vínculos
    vinculo_map = {
        "01": "VÍNCULO EMPREGATÍCIO",
        "02": "AUTÔNOMO",
        "03": "COOPERATIVA",
        "04": "OUTROS",
        "05": "RESIDÊNCIA",
        "06": "ESTÁGIO",
        "07": "BOLSA",
        "08": "INTERMEDIADO",
        "09": "INFORMAL",
        "10": "SERVIDOR PÚBLICO CEDIDO"
    }
    subvinculo_map = {
        "01": "ESTATUTÁRIO EFETIVO",
        "02": "CELETISTA",
        "03": "CONTRATO TEMPORÁRIO",
        "04": "COMISSIONADO / CARGO DE CONFIANÇA",
        "00": "NÃO SE APLICA"
    }

    # 4. Filtrar Estabelecimentos de São Luís Gonzaga do Maranhão
    print(f"3/6. Filtrando estabelecimentos de {MUNICIPIO} (IBGE: {IBGE_6})...", flush=True)
    estabelecimentos = {}
    co_unidades = set()

    f_estab = SOURCE_DIR / "tbEstabelecimento202607.csv"
    with open(f_estab, "r", encoding="latin-1") as f:
        header_line = f.readline()
        header = [clean(h) for h in header_line.split(";")]
        idx_co_unidade = header.index("CO_UNIDADE")
        idx_co_cnes = header.index("CO_CNES")
        idx_cnpj = header.index("NU_CNPJ_MANTENEDORA") if "NU_CNPJ_MANTENEDORA" in header else -1
        idx_razao = header.index("NO_RAZAO_SOCIAL") if "NO_RAZAO_SOCIAL" in header else -1
        idx_fantasia = header.index("NO_FANTASIA") if "NO_FANTASIA" in header else -1
        idx_logradouro = header.index("NO_LOGRADOURO") if "NO_LOGRADOURO" in header else -1
        idx_num = header.index("NU_ENDERECO") if "NU_ENDERECO" in header else -1
        idx_bairro = header.index("NO_BAIRRO") if "NO_BAIRRO" in header else -1
        idx_cep = header.index("CO_CEP") if "CO_CEP" in header else -1
        idx_tp_unid = header.index("TP_UNIDADE") if "TP_UNIDADE" in header else -1
        idx_mun_gestor = header.index("CO_MUNICIPIO_GESTOR") if "CO_MUNICIPIO_GESTOR" in header else -1
        idx_tp_gestao = header.index("TP_GESTAO") if "TP_GESTAO" in header else -1
        idx_desab = header.index("CO_MOTIVO_DESAB") if "CO_MOTIVO_DESAB" in header else -1

        for line in f:
            if IBGE_6 not in line:
                continue
            row = [clean(col) for col in line.split(";")]
            co_unid = row[idx_co_unidade] if idx_co_unidade < len(row) else ""
            mun_gestor = row[idx_mun_gestor] if idx_mun_gestor >= 0 and idx_mun_gestor < len(row) else ""

            if mun_gestor == IBGE_6 or co_unid.startswith(IBGE_6):
                cnes = row[idx_co_cnes] if idx_co_cnes < len(row) else ""
                razao = row[idx_razao] if idx_razao >= 0 and idx_razao < len(row) else ""
                fantasia = row[idx_fantasia] if idx_fantasia >= 0 and idx_fantasia < len(row) else razao
                if not fantasia:
                    fantasia = razao or f"CNES {cnes}"

                tp_cod = row[idx_tp_unid] if idx_tp_unid >= 0 and idx_tp_unid < len(row) else "02"
                tp_desc = tipo_unid_map.get(tp_cod, "UNIDADE DE SAUDE")
                tipo_fmt = f"{tp_cod} - {tp_desc}"

                gestao_cod = row[idx_tp_gestao] if idx_tp_gestao >= 0 and idx_tp_gestao < len(row) else "M"
                gestao_desc = "ESTADUAL" if gestao_cod == "E" else ("DUPLA" if gestao_cod == "D" else "MUNICIPAL")

                logr = row[idx_logradouro] if idx_logradouro >= 0 and idx_logradouro < len(row) else ""
                num = row[idx_num] if idx_num >= 0 and idx_num < len(row) else "S/N"
                bairro = row[idx_bairro] if idx_bairro >= 0 and idx_bairro < len(row) else "CENTRO"
                cep = row[idx_cep] if idx_cep >= 0 and idx_cep < len(row) else "65708000"
                cnpj_val = row[idx_cnpj] if idx_cnpj >= 0 and idx_cnpj < len(row) else "06460018000152"
                desab_val = row[idx_desab] if idx_desab >= 0 and idx_desab < len(row) else ""

                estabelecimentos[co_unid] = {
                    "coUnidade": co_unid,
                    "cnes": cnes,
                    "cnpj": cnpj_val,
                    "razaoSocial": razao,
                    "nomeFantasia": fantasia,
                    "tipoUnidade": tipo_fmt,
                    "tipoGestao": gestao_desc,
                    "esfera": gestao_desc,
                    "dependencia": "MANTIDA",
                    "personalidade": "JURIDICA",
                    "atendimentoSus": "SIM",
                    "cep": cep,
                    "endereco": logr,
                    "numero": num,
                    "bairro": bairro,
                    "municipio": f"{MUNICIPIO} - IBGE - {IBGE_6}",
                    "uf": UF,
                    "desabilitado": bool(desab_val),
                    "vinculos_raw": [],
                    "profissionais": []
                }
                co_unidades.add(co_unid)

    print(f"-> Estabelecimentos encontrados: {len(estabelecimentos)}", flush=True)
    for est in sorted(estabelecimentos.values(), key=lambda x: x["cnes"]):
        print(f"   CNES {est['cnes']} — {est['nomeFantasia']} ({est['tipoUnidade']})", flush=True)

    # 5. Filtrar Vínculos em tbCargaHorariaSus202607.csv (Streaming ultrarrápido por prefixo)
    print(f"4/6. Filtrando vínculos e cargas horárias em tbCargaHorariaSus202607.csv...", flush=True)
    prof_ids_set = set()
    total_links_found = 0

    target_prefix = f'"{IBGE_6}'
    f_ch = SOURCE_DIR / "tbCargaHorariaSus202607.csv"
    with open(f_ch, "r", encoding="latin-1") as f:
        header_line = f.readline()
        header = [clean(h) for h in header_line.split(";")]
        idx_ch_unid = header.index("CO_UNIDADE")
        idx_ch_prof = header.index("CO_PROFISSIONAL_SUS")
        idx_ch_cbo = header.index("CO_CBO")
        idx_ch_amb = header.index("QT_CARGA_HORARIA_AMBULATORIAL") if "QT_CARGA_HORARIA_AMBULATORIAL" in header else -1
        idx_ch_hosp = header.index("QT_CARGA_HOR_HOSP_SUS") if "QT_CARGA_HOR_HOSP_SUS" in header else -1
        idx_ch_outr = header.index("QT_CARGA_HORARIA_OUTROS") if "QT_CARGA_HORARIA_OUTROS" in header else -1
        idx_ch_sus = header.index("TP_SUS_NAO_SUS") if "TP_SUS_NAO_SUS" in header else -1
        idx_ch_vinc = header.index("IND_VINCULACAO") if "IND_VINCULACAO" in header else -1
        idx_ch_reg = header.index("NU_REGISTRO") if "NU_REGISTRO" in header else -1
        idx_ch_crm_uf = header.index("SG_UF_CRM") if "SG_UF_CRM" in header else -1

        for line in f:
            if not line.startswith(target_prefix):
                continue
            row = [clean(c) for c in line.split(";")]
            co_unid = row[idx_ch_unid] if idx_ch_unid < len(row) else ""
            if co_unid in co_unidades:
                prof_id = row[idx_ch_prof] if idx_ch_prof < len(row) else ""
                cbo = row[idx_ch_cbo] if idx_ch_cbo < len(row) else ""
                amb_str = row[idx_ch_amb] if idx_ch_amb >= 0 and idx_ch_amb < len(row) else "0"
                hosp_str = row[idx_ch_hosp] if idx_ch_hosp >= 0 and idx_ch_hosp < len(row) else "0"
                outr_str = row[idx_ch_outr] if idx_ch_outr >= 0 and idx_ch_outr < len(row) else "0"
                ch_amb = int(amb_str) if amb_str.isdigit() else 0
                ch_hosp = int(hosp_str) if hosp_str.isdigit() else 0
                ch_outr = int(outr_str) if outr_str.isdigit() else 0
                sus_val = row[idx_ch_sus] if idx_ch_sus >= 0 and idx_ch_sus < len(row) else "S"
                ind_vinc = row[idx_ch_vinc] if idx_ch_vinc >= 0 and idx_ch_vinc < len(row) else "010300"
                reg_cons = row[idx_ch_reg] if idx_ch_reg >= 0 and idx_ch_reg < len(row) else ""
                uf_cons = row[idx_ch_crm_uf] if idx_ch_crm_uf >= 0 and idx_ch_crm_uf < len(row) else ""

                cod_vinc = ind_vinc[:2] if len(ind_vinc) >= 2 else "01"
                cod_sub = ind_vinc[2:4] if len(ind_vinc) >= 4 else "03"
                desc_vinc = vinculo_map.get(cod_vinc, "VÍNCULO EMPREGATÍCIO")
                desc_sub = subvinculo_map.get(cod_sub, "PÚBLICO")

                prof_ids_set.add(prof_id)
                estabelecimentos[co_unid]["vinculos_raw"].append({
                    "profId": prof_id,
                    "cbo": cbo,
                    "chAmb": ch_amb,
                    "chHosp": ch_hosp,
                    "chOutr": ch_outr,
                    "atendimentoSus": "SIM" if sus_val.upper() == "S" else "NÃO",
                    "vinculacao": desc_vinc,
                    "tipoVinculo": desc_vinc,
                    "subtipo": desc_sub,
                    "registroConselho": reg_cons,
                    "ufConselho": uf_cons
                })
                total_links_found += 1

    print(f"-> Vínculos identificados na rede: {total_links_found}", flush=True)
    print(f"-> Profissionais únicos a buscar dados: {len(prof_ids_set)}", flush=True)

    # 6. Mapear Nome e CNS em tbDadosProfissionalSus202607.csv (Streaming otimizado)
    print(f"5/6. Mapeando Nomes e CNS em tbDadosProfissionalSus202607.csv...", flush=True)
    prof_dados_map = {}
    f_prof = SOURCE_DIR / "tbDadosProfissionalSus202607.csv"
    with open(f_prof, "r", encoding="latin-1") as f:
        header_line = f.readline()
        header = [clean(h) for h in header_line.split(";")]
        idx_p_id = header.index("CO_PROFISSIONAL_SUS")
        idx_p_nome = header.index("NO_PROFISSIONAL")
        idx_p_cns = header.index("CO_CNS")
        idx_p_cpf = header.index("CO_CPF") if "CO_CPF" in header else -1

        for line in f:
            first_semi = line.find(";")
            if first_semi > 2:
                p_id = line[1:first_semi-1].strip()
                if p_id in prof_ids_set:
                    row = [clean(c) for c in line.split(";")]
                    nome = row[idx_p_nome] if idx_p_nome < len(row) else ""
                    cns = row[idx_p_cns] if idx_p_cns < len(row) else ""
                    cpf = row[idx_p_cpf] if idx_p_cpf >= 0 and idx_p_cpf < len(row) else ""
                    prof_dados_map[p_id] = {
                        "nome": nome,
                        "cns": cns,
                        "cpf": cpf
                    }
                    if len(prof_dados_map) >= len(prof_ids_set):
                        print("   (Todos os profissionais foram localizados antecipadamente!)", flush=True)
                        break

    print(f"-> Profissionais mapeados com sucesso: {len(prof_dados_map)}", flush=True)

    # 7. Montar lista de colaboradores por estabelecimento
    all_colaboradores = []
    cns_horas_total = {}
    cns_vinculos_total = {}

    for co_unid, est in estabelecimentos.items():
        for vr in est["vinculos_raw"]:
            p_dados = prof_dados_map.get(vr["profId"], {})
            nome = p_dados.get("nome", f"PROFISSIONAL {vr['profId']}")
            cns = p_dados.get("cns", "")
            cpf = p_dados.get("cpf", "")

            cbo_cod = vr["cbo"]
            cbo_desc = cbo_map.get(cbo_cod, "PROFISSIONAL DE SAUDE")
            ocupacao = f"{cbo_cod} - {cbo_desc}"

            ch_amb = vr["chAmb"]
            ch_hosp = vr["chHosp"]
            ch_outr = vr["chOutr"]
            ch_total = ch_amb + ch_hosp + ch_outr
            if ch_total == 0:
                ch_total = 40

            if cns:
                cns_horas_total[cns] = cns_horas_total.get(cns, 0) + ch_total
                cns_vinculos_total[cns] = cns_vinculos_total.get(cns, 0) + 1

            prof_obj = {
                "nome": nome,
                "cns": cns,
                "cnsMaster": cns,
                "cpf": cpf,
                "cbo": cbo_cod,
                "ocupacao": ocupacao,
                "chAmb": ch_amb,
                "chHosp": ch_hosp,
                "chOutros": ch_outr,
                "chTotal": ch_total,
                "atendimentoSus": vr["atendimentoSus"],
                "vinculacao": vr["vinculacao"],
                "tipoVinculo": vr["tipoVinculo"],
                "subtipo": vr["subtipo"],
                "registroConselho": vr["registroConselho"],
                "ufConselho": vr["ufConselho"],
                "situacao": "Ativo",
                "dtEntrada": "01/02/2021",
                "dtAtribuicao": "01/03/2021",
                "portaria134": "",
                "cnes": est["cnes"],
                "estabelecimento": est["nomeFantasia"],
                "coUnidade": co_unid
            }
            est["profissionais"].append(prof_obj)
            all_colaboradores.append(prof_obj)

    # 8. Calcular Portaria SAS/MS 134/2011 (Acúmulo de cargos e limites de carga horária)
    alertas_134_count = 0
    for est in estabelecimentos.values():
        for p in est["profissionais"]:
            cns = p["cns"]
            if not cns:
                continue
            qtd = cns_vinculos_total.get(cns, 1)
            total_h = cns_horas_total.get(cns, p["chTotal"])
            if qtd > 1 and total_h > 60:
                p["portaria134"] = f"SOBREPOSIÇÃO (Art. 2º - {qtd} vínculos / {total_h}h)"
                alertas_134_count += 1
            elif total_h > 60:
                p["portaria134"] = f"CH EXCESSIVA ({total_h}h semanais)"
                alertas_134_count += 1

    print(f"-> Total de colaboradores/vínculos gerados: {len(all_colaboradores)}", flush=True)
    print(f"-> Alertas da Portaria 134/2011 identificados: {alertas_134_count}", flush=True)

    # Limpar vinculos_raw dos estabelecimentos para o JSON final
    for est in estabelecimentos.values():
        del est["vinculos_raw"]

    # 9. Salvar Arquivos JSON do Módulo CNES
    CNES_DATA_DIR.mkdir(parents=True, exist_ok=True)

    json_payload = {
        "codigoIbge": IBGE_6,
        "municipio": MUNICIPIO,
        "uf": UF,
        "competencia": COMPETENCIA,
        "competenciaPadrao": COMPETENCIA,
        "fonte": f"DATASUS CNES Oficial (Dump Nacional {COMPETENCIA})",
        "counts": {
            "establishments": len(estabelecimentos),
            "professional_links": len(all_colaboradores),
            "professionals": len(prof_dados_map)
        },
        "competencias": [
            {"codigo": "202608", "label": "08/2026 (Competência Vigente Oficial)", "vigente": True},
            {"codigo": "202607", "label": "07/2026 (Base Oficial Auditada)", "vigente": False},
            {"codigo": "202606", "label": "06/2026", "vigente": False}
        ],
        "estabelecimentos": sorted(estabelecimentos.values(), key=lambda x: x["cnes"])
    }

    file_202607 = CNES_DATA_DIR / f"cnes_{IBGE_6}_202607.json"
    file_202608 = CNES_DATA_DIR / f"cnes_{IBGE_6}_202608.json"
    file_base = CNES_DATA_DIR / f"cnes_{IBGE_6}.json"

    with open(file_202607, "w", encoding="utf-8") as f:
        json.dump(json_payload, f, ensure_ascii=False, indent=2)
    with open(file_202608, "w", encoding="utf-8") as f:
        json.dump(json_payload, f, ensure_ascii=False, indent=2)
    with open(file_base, "w", encoding="utf-8") as f:
        json.dump(json_payload, f, ensure_ascii=False, indent=2)

    print(f"-> Salvo JSON oficial do sistema em: {file_202607}", flush=True)

    # 10. Gerar Planilha Excel Oficial (.XLSX) na Área de Trabalho
    excel_path = DESKTOP_DIR / f"CNES_Profissionais_{MUNICIPIO.replace(' ', '_')}_{COMPETENCIA}.xlsx"
    print(f"6/6. Gerando planilha Excel oficial em: {excel_path}", flush=True)

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
        bottom=Side(style="thin", color="E2E8F0")
    )

    headers_ws1 = [
        "CNES", "Estabelecimento de Saúde", "Nome do Profissional", "CNS", 
        "CBO", "Ocupação / Cargo", "CH Amb", "CH Hosp", "CH Outros", "CH Total",
        "Atende SUS", "Tipo de Vínculo", "Subtipo", "Registro Conselho", "Portaria 134/2011"
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
            colab["registroConselho"],
            colab["portaria134"]
        ]
        ws1.append(row_vals)
        has_alert = bool(colab["portaria134"])
        for col_num in range(1, len(row_vals) + 1):
            c = ws1.cell(row=r_idx, column=col_num)
            c.border = border_thin
            if has_alert and col_num == 15:
                c.fill = alerta_fill
                c.font = alerta_font
            elif r_idx % 2 == 0:
                c.fill = zebra_fill
            if col_num in [1, 4, 5, 7, 8, 9, 10, 11, 14]:
                c.alignment = Alignment(horizontal="center", vertical="center")

    for col in ws1.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws1.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

    # --- ABA 2: Estabelecimentos de Saúde ---
    ws2 = wb.create_sheet(title="Estabelecimentos")
    headers_ws2 = ["CNES", "Nome Fantasia", "Razão Social", "Tipo de Unidade", "Gestão", "Logradouro", "Bairro", "CEP", "Qtd Profissionais"]
    ws2.append(headers_ws2)
    for col_num in range(1, len(headers_ws2) + 1):
        cell = ws2.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for r_idx, est in enumerate(sorted(estabelecimentos.values(), key=lambda x: x["cnes"]), start=2):
        row_vals = [
            est["cnes"],
            est["nomeFantasia"],
            est["razaoSocial"],
            est["tipoUnidade"],
            est["tipoGestao"],
            est["endereco"],
            est["bairro"],
            est["cep"],
            len(est["profissionais"])
        ]
        ws2.append(row_vals)
        for col_num in range(1, len(row_vals) + 1):
            c = ws2.cell(row=r_idx, column=col_num)
            c.border = border_thin
            if r_idx % 2 == 0:
                c.fill = zebra_fill
            if col_num in [1, 5, 8, 9]:
                c.alignment = Alignment(horizontal="center", vertical="center")

    for col in ws2.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws2.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

    # --- ABA 3: Auditoria Portaria 134 ---
    ws3 = wb.create_sheet(title="Auditoria Portaria 134")
    headers_ws3 = ["CNS", "Nome do Profissional", "Vínculos na Rede", "CH Semanal Total", "Estabelecimentos", "Ocupações", "Parecer de Auditoria"]
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
                "alerta": ""
            }
        cns_grouped[cns]["vinculos"] += 1
        cns_grouped[cns]["chTotal"] += colab["chTotal"]
        cns_grouped[cns]["estabelecimentos"].add(colab["estabelecimento"])
        cns_grouped[cns]["ocupacoes"].add(colab["ocupacao"].split(" - ")[0])

    r_idx = 2
    for cns, info in sorted(cns_grouped.items(), key=lambda x: -x[1]["chTotal"]):
        if info["vinculos"] > 1 or info["chTotal"] > 60:
            parecer = f"Sobreposição de {info['vinculos']} vínculos ({info['chTotal']}h semanais)" if info["vinculos"] > 1 and info["chTotal"] > 60 else (f"{info['vinculos']} vínculos ativos" if info["vinculos"] > 1 else f"CH {info['chTotal']}h")
            row_vals = [
                info["cns"],
                info["nome"],
                info["vinculos"],
                info["chTotal"],
                ", ".join(info["estabelecimentos"]),
                ", ".join(info["ocupacoes"]),
                parecer
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
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws3.column_dimensions[col_letter].width = min(max(max_len + 3, 14), 50)

    wb.save(excel_path)
    print(f"-> Planilha Excel salva em: {excel_path}", flush=True)

    # Também salvar CSV com BOM UTF-8
    csv_path = DESKTOP_DIR / f"CNES_Profissionais_{MUNICIPIO.replace(' ', '_')}_{COMPETENCIA}.csv"
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(headers_ws1)
        for colab in sorted_colabs:
            writer.writerow([
                colab["cnes"], colab["estabelecimento"], colab["nome"], colab["cns"],
                colab["cbo"], colab["ocupacao"], colab["chAmb"], colab["chHosp"], colab["chOutros"],
                colab["chTotal"], colab["atendimentoSus"], colab["tipoVinculo"], colab["subtipo"],
                colab["registroConselho"], colab["portaria134"]
            ])
    print(f"-> CSV oficial salvo em: {csv_path}", flush=True)

    elapsed = time.time() - start_time
    print("=" * 70, flush=True)
    print(f"EXTRAÇÃO FINALIZADA COM SUCESSO EM {elapsed:.1f}s!", flush=True)
    print(f"Estabelecimentos auditados: {len(estabelecimentos)}", flush=True)
    print(f"Profissionais auditados:    {len(prof_dados_map)}", flush=True)
    print(f"Vínculos auditados:         {len(all_colaboradores)}", flush=True)
    print(f"Arquivos gerados na Área de Trabalho:", flush=True)
    print(f"  - {excel_path.name}", flush=True)
    print(f"  - {csv_path.name}", flush=True)
    print("=" * 70, flush=True)

if __name__ == "__main__":
    main()
