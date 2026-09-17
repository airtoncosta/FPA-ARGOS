import requests
import re

handles = [
    'prefeituradebacabal',
    'prefeituradebacabaloficial',
    'semusbacabal',
    'robertocostama',
    'robertocostama_',
    'edvanbrandaoma',
    'camarabacabal',
    'governoma',
    'governodoma',
    'saudema',
    'cosemsma',
    'famem_ma',
    'minsaude',
    'fundonacionaldesaude',
    'anvisaoficial',
    'ans_reguladora',
    'fiocruz',
    'butantanoficial',
    'ebserh',
    'conassoficial',
    'conasems',
    'conselhonacionaldesaude',
    'tce_ma',
    'mpmaoficial'
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
}

for h in handles:
    url = f'https://www.instagram.com/{h}/'
    try:
        r = requests.get(url, headers=headers, timeout=6)
        og_title = re.search(r'<meta property="og:title" content="([^"]+)"', r.text)
        og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', r.text)
        
        title_val = og_title.group(1) if og_title else 'None'
        desc_val = og_desc.group(1) if og_desc else 'None'
        
        is_real = ('• Instagram' in title_val or 'seguidores' in desc_val.lower() or 'followers' in desc_val.lower())
        print(f"{h:26} | Real: {str(is_real):5} | Title: {title_val[:45]} | Desc: {desc_val[:35]}")
    except Exception as e:
        print(f"{h:26} | ERR: {e}")
