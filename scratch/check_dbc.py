import os
os.environ['PYSUS_CACHEPATH'] = os.path.abspath('data/cnes/pysus-cache')
os.environ['HOME'] = os.path.abspath('data/cnes')
import asyncio
from pysus.api.ftp.client import DownloadedFile

async def main():
    dbc_path = os.path.abspath(r'data\cnes\raw\202608\PF\0f7cdf4fd5e2fc669a07417967fdd49778f91a012e562cebd510e58928eba0d7\PFMA2608.dbc')
    f = DownloadedFile(dbc_path)
    t = await f.load()
    if hasattr(t, 'to_dicts'):
        rows = t.to_dicts()
    elif hasattr(t, 'to_dict'):
        rows = t.to_dict('records')
    else:
        rows = list(t)
    
    print('Total rows in PFMA2608:', len(rows))
    if rows:
        print('Columns in PF row:', list(rows[0].keys()))
        bacabal_rows = [r for r in rows if '210120' in str(r.get('CO_UNIDADE', ''))]
        print('Bacabal rows count:', len(bacabal_rows))
        joselma = [r for r in bacabal_rows if '705001467933053' in str(r.values()) or 'JOSELMA' in str(r.values())]
        print('Joselma raw rows:', joselma)

if __name__ == '__main__':
    asyncio.run(main())
