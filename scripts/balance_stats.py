import json, statistics as st, sys
"""Сводка прогонов стратегий на многих seed: среднее, p10/p90, окупаемость, провалы, лучший формат по seed.

Запуск: npx vite-node scripts/strategies.ts 84 40 --json > runs.txt  (можно несколькими процессами с --only=…)
        python3 scripts/balance_stats.py runs.txt [runs2.txt …]
"""
runs=[]
for f in sys.argv[1:]:
    lines=[l for l in open(f) if l.startswith('[')]
    runs+=json.loads(lines[-1])
by={}
for r in runs: by.setdefault(r['strategy'],[]).append(r)
def q(a,p):
    a=sorted(a); k=(len(a)-1)*p; i=int(k); return a[i]+(a[min(i+1,len(a)-1)]-a[i])*(k-i)
rows=[]
for s,rs in by.items():
    steady=[sum(r['profit'][14:])/max(1,len(r['profit'][14:])) for r in rs]
    pay=[]
    for r in rs:
        acc=-r['invested']; d=None
        for i,p in enumerate(r['profit']):
            acc+=p
            if acc>=0: d=i+1; break
        pay.append(d)
    paid=[p for p in pay if p]
    bank=sum(1 for r in rs if r['bankruptDay'])
    neg=sum(1 for x in steady if x<0)
    first2=[sum(r['profit'][:14]) for r in rs]
    rows.append((s,len(rs),st.mean(steady),q(steady,.1),st.median(steady),q(steady,.9),st.pstdev(steady)/max(1,abs(st.mean(steady))),
                 st.median(paid) if paid else None, q(paid,.9) if paid else None, len(rs)-len(paid), bank, neg, st.mean(first2), rs[0]['invested']))
print(f"{'формат':14} {'n':>3} {'среднее':>8} {'p10':>7} {'медиана':>8} {'p90':>7} {'CV':>5} {'окуп.мед':>8} {'окуп.p90':>8} {'не окуп.':>8} {'банкр':>5} {'минус':>5} {'2 нед':>8} {'вложено':>8}")
for r in sorted(rows,key=lambda x:-x[2]):
    print(f"{r[0]:14} {r[1]:3d} {r[2]:8.0f} {r[3]:7.0f} {r[4]:8.0f} {r[5]:7.0f} {r[6]:5.2f} {str(r[7]):>8} {str(round(r[8]) if r[8] else None):>8} {r[9]:8d} {r[10]:5d} {r[11]:5d} {r[12]:8.0f} {r[13]:8.0f}")
# Win rate among Klenovaya formats per seed
kl=['newbie','togo','lunch','cozy','evening','all','kiosk']
wins={}
seeds=sorted({r['seed'] for r in runs})
for sd in seeds:
    best=None
    for s in kl:
        r=[x for x in by.get(s,[]) if x['seed']==sd]
        if not r: continue
        v=sum(r[0]['profit'][14:])
        if best is None or v>best[1]: best=(s,v)
    if best: wins[best[0]]=wins.get(best[0],0)+1
print('\nЛучший формат Кленовой по seed:', wins)
# all vs second best gap
gaps=[]
for sd in seeds:
    vals=sorted([(sum([x for x in by[s] if x['seed']==sd][0]['profit'][14:])/70,s) for s in kl if s in by and any(x['seed']==sd for x in by[s])],reverse=True)
    if len(vals)>1: gaps.append((vals[0][1],vals[0][0]-vals[1][0],vals[1][1]))
from collections import Counter
print('Второй после лучшего:', Counter(g[2] for g in gaps))
print('Отрыв лучшего от второго, ₽/день: медиана', round(st.median([g[1] for g in gaps])), 'p10', round(q([g[1] for g in gaps],.1)))
